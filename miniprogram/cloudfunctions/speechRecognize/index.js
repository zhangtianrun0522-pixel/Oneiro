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

exports.main = function (event) {
  return new Promise(function (resolve) {
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
            resolve(resultError(
              'recognize_failed',
              error.message || '语音识别失败'
            ));
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
