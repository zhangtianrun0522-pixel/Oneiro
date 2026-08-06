var cloud = require('wx-server-sdk');
var tencentcloud = require('tencentcloud-sdk-nodejs-asr');
var AsrClient = tencentcloud.asr.v20190614.Client;

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function resultError(reason, message) {
  var result = {
    ok: false,
    reason: reason
  };

  if (message) {
    result.message = message;
  }

  return result;
}

// 平台超时到点时云函数被直接掐断，客户端只会拿到一个没有 reason 的
// cloud_call_failed，排查时看不出是 ASR 慢还是网络断。自己先于平台超时收口，
// 把原因说清楚。这个值必须低于控制台里 speechRecognize 的平台超时时间。
var ASR_REQUEST_TIMEOUT_MS = 15000;

exports.main = function (event) {
  return new Promise(function (finish) {
    var settled = false;
    var timer = null;

    // 下面所有分支都调用 resolve，这里把它换成幂等的收口函数：先到者胜，
    // 超时兜底不会和真实结果互相覆盖。
    function resolve(result) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      finish(result);
    }

    timer = setTimeout(function () {
      resolve(resultError('recognize_timeout', '语音识别超时，请重试'));
    }, ASR_REQUEST_TIMEOUT_MS);

    try {
      var audioBase64 = event && typeof event.audioBase64 === 'string'
        ? event.audioBase64
        : '';
      var duration = Number(event && event.duration);

      if (duration > 60 || audioBase64.length > 4 * 1024 * 1024) {
        resolve(resultError('too_long'));
        return;
      }

      if (!audioBase64) {
        resolve(resultError('invalid_audio', '音频数据为空'));
        return;
      }

      var secretId = process.env.TENCENT_ASR_SECRET_ID || '';
      var secretKey = process.env.TENCENT_ASR_SECRET_KEY || '';

      if (!secretId || !secretKey) {
        resolve(resultError(
          'not_configured',
          '语音识别服务尚未配置，请稍后再试。'
        ));
        return;
      }

      var audioBuffer = Buffer.from(audioBase64, 'base64');

      if (audioBuffer.length > 3 * 1024 * 1024) {
        resolve(resultError('too_long'));
        return;
      }

      var client = new AsrClient({
        credential: {
          secretId: secretId,
          secretKey: secretKey
        },
        region: 'ap-shanghai',
        profile: {
          httpProfile: {
            endpoint: 'asr.tencentcloudapi.com'
          }
        }
      });
      var request = {
        EngSerViceType: '16k_zh',
        SourceType: 1,
        Data: audioBase64,
        DataLen: audioBuffer.length,
        VoiceFormat: 'mp3'
      };

      client.SentenceRecognition(request, function (error, response) {
        try {
          if (error) {
            // 腾讯 ASR 的 code（如 FailedOperation.ErrorRecognize、
            // AuthFailure.SecretIdNotFound、RequestLimitExceeded）是唯一能
            // 区分「音频有问题」和「账号/额度有问题」的信号，必须带回客户端，
            // 否则线上只能看到一句笼统的「语音识别暂不可用」。
            var failure = resultError(
              'recognize_failed',
              error.message || '语音识别失败'
            );
            failure.providerErrorCode = String(error.code || '').slice(0, 80);
            resolve(failure);
            return;
          }

          var text = response && response.Result
            ? String(response.Result).trim()
            : '';

          if (!text) {
            resolve(resultError('empty_result', '没有识别到清晰的语音内容'));
            return;
          }

          resolve({
            ok: true,
            text: text
          });
        } catch (callbackError) {
          resolve(resultError(
            'recognize_failed',
            callbackError.message || '语音识别失败'
          ));
        }
      });
    } catch (error) {
      resolve(resultError(
        'recognize_failed',
        error && error.message ? error.message : '语音识别失败'
      ));
    }
  });
};
