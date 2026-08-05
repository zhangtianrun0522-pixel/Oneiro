function cleanText(value, limit) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .slice(0, limit || 120);
}

function readStorage(key) {
  return typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function'
    ? wx.getStorageSync(key)
    : null;
}

function writeStorage(key, value) {
  if (typeof wx !== 'undefined' && wx && typeof wx.setStorageSync === 'function') {
    wx.setStorageSync(key, value);
  }
}

function uniqueList(value, limit) {
  var seen = {};
  var result = [];

  (Array.isArray(value) ? value : []).forEach(function (item) {
    var text = cleanText(item, 40);
    var key = '$' + text;
    if (!text || seen[key] || result.length >= (limit || 8)) return;
    seen[key] = true;
    result.push(text);
  });
  return result;
}

function readyRecords(archive) {
  return (Array.isArray(archive) ? archive : []).filter(function (record) {
    return record && record.status !== 'blocked' && record.result;
  });
}

function countByRecord(records, getter) {
  var counts = {};
  var firstSeen = {};

  records.forEach(function (record, recordIndex) {
    uniqueList(getter(record), 12).forEach(function (value) {
      var key = '$' + value;
      counts[key] = (counts[key] || 0) + 1;
      if (firstSeen[key] === undefined) firstSeen[key] = recordIndex;
    });
  });

  return Object.keys(counts).map(function (key) {
    return { value: key.slice(1), count: counts[key], firstSeen: firstSeen[key] };
  }).sort(function (left, right) {
    return right.count - left.count || left.firstSeen - right.firstSeen;
  });
}

function facts(record, key) {
  var source = record && record.dreamFacts ? record.dreamFacts : {};
  return source[key] || (key === 'time_sense' ? source.timeSense : []) || [];
}

function topRepeated(items, minimum, limit) {
  return items.filter(function (item) {
    return item.count >= minimum;
  }).slice(0, limit || 3).map(function (item) {
    return { label: item.value, count: item.count };
  });
}

function monthKey(value) {
  var date = new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function buildMonthlyCard(records, recurringSymbols, recurringEmotions) {
  var currentKey = monthKey(new Date());
  var monthly = records.filter(function (record) {
    return monthKey(record.createdAt) === currentKey;
  });
  var symbolCounts = countByRecord(monthly, function (record) {
    return record.result && record.result.symbols;
  });
  var emotionCounts = countByRecord(monthly, function (record) {
    return facts(record, 'emotions');
  });
  var primarySymbol = symbolCounts[0] || recurringSymbols[0];
  var primaryEmotion = emotionCounts[0] || recurringEmotions[0];

  if (monthly.length < 2 || !primarySymbol) {
    return { eligible: false, month: currentKey, dreamCount: monthly.length };
  }

  return {
    eligible: true,
    month: currentKey,
    dreamCount: monthly.length,
    title: primarySymbol.value + '月牌',
    symbol: primarySymbol.value,
    emotion: primaryEmotion ? primaryEmotion.value : '仍在显影',
    insight: '这个月，“' + primarySymbol.value + '”在你的梦里最醒目' +
      (primaryEmotion ? '，常与“' + primaryEmotion.value + '”同时出现。' : '。'),
    evidenceDreamIds: monthly.map(function (record) { return record.id; }).filter(Boolean).slice(0, 8)
  };
}

function buildInsights(archive) {
  var records = readyRecords(archive);
  var people = countByRecord(records, function (record) { return facts(record, 'people'); });
  var symbols = countByRecord(records, function (record) {
    return record.result && record.result.symbols;
  });
  var emotions = countByRecord(records, function (record) { return facts(record, 'emotions'); });
  var places = countByRecord(records, function (record) { return facts(record, 'places'); });
  var recurringPeople = topRepeated(people, 2, 3);
  var recurringSymbols = topRepeated(symbols, 2, 4);
  var recurringEmotions = topRepeated(emotions, 2, 3);
  var recurringPlaces = topRepeated(places, 2, 3);
  var lead = recurringSymbols[0] || recurringEmotions[0] || recurringPlaces[0] || recurringPeople[0];
  var evidenceDreamIds = records.map(function (record) { return record.id; }).filter(Boolean).slice(0, 12);

  return {
    dreamCount: records.length,
    eligible: records.length >= 3,
    recurringPeople: recurringPeople,
    recurringSymbols: recurringSymbols,
    recurringEmotions: recurringEmotions,
    recurringPlaces: recurringPlaces,
    evidenceDreamIds: evidenceDreamIds,
    stageSummary: records.length < 3
      ? '再记录 ' + String(3 - records.length) + ' 个梦，Oneiro 会开始整理跨梦线索。'
      : lead
        ? '最近的梦反复围绕“' + lead.label + '”展开。它是阶段线索，不是永久标签；你可以继续观察它下一次如何变化。'
        : '已经积累了 ' + records.length + ' 个梦，但还没有稳定重复的线索。没有模式，本身也是一种阶段状态。',
    monthlyCard: buildMonthlyCard(records, symbols, emotions)
  };
}

function isUsefulDiscussionText(value) {
  var source = cleanText(value, 160);
  if (source.length < 8) return false;
  if (/^(嗯|哦|好的|是的|不是|不知道|可能吧|哈哈|我觉得|感觉像)[，。,.！!？?、\s]*$/i.test(source)) return false;
  return /最近|这几天|今天|昨晚|工作|学习|学校|项目|同事|老板|家人|朋友|伴侣|父母|生活|压力|焦虑|难过|害怕|开心|生气|疲惫|失眠|关系|决定|搬|换|离开|面试|考试|加班|旅行|钱|计划|正在|发生|联系|争吵|失去|等待/.test(source);
}

function autoExtractedRealLifeContext(archive) {
  // 现实线索只能来自 AI 的 memory_candidate 和云端 life_notes；本地不
  // 根据关键词猜测语义，避免把普通聊天误显示为已确认的现实记忆。
  return [];
}

function discussionCount(archive) {
  return readyRecords(archive).reduce(function (count, record) {
    var messages = Array.isArray(record && record.chatMessages) ? record.chatMessages : [];
    return count + messages.filter(function (message) { return message && message.role === 'user'; }).length + (record && record.revisitAnswer ? 1 : 0);
  }, 0);
}

function buildProfileDraft(profile, archive, nextVersion, changeReason) {
  var records = readyRecords(archive);
  var insights = buildInsights(archive);
  var factsList = autoExtractedRealLifeContext(archive);
  var discussions = discussionCount(archive);
  var themes = insights.recurringSymbols.slice(0, 3).map(function (item) { return item.label; });
  var tone = insights.recurringEmotions[0] ? '梦里的情绪常带着“' + insights.recurringEmotions[0].label + '”的底色。' :
    factsList[0] ? '现实线索里能看见一层“' + cleanText(factsList[0], 28) + '”的情绪。' : '情绪还在显影，暂时不急着下结论。';
  var stateText;
  var changing = '';
  var evidenceSymbols = records.reduce(function (all, record) {
    return all.concat(uniqueList(record && record.result && record.result.symbols, 3));
  }, []);

  if (!records.length && !factsList.length) {
    stateText = '你刚开始记录，当前留下的资料还很少；这份画像会从下一条真实线索继续变具体。';
  } else if (records.length < 3) {
    stateText = '你刚开始记录。从现有梦境看，' + (evidenceSymbols.length ? '“' + evidenceSymbols.slice(0, 2).join('”“') + '”是目前能确认的线索。' : '目前只能确认你正在留意自己的梦。');
  } else if (factsList[0]) {
    stateText = '最近现实里你提到“' + cleanText(factsList[0], 45) + '”，这成为当前理解你的一个具体入口。';
  } else if (themes.length) {
    stateText = '最近梦里反复出现“' + themes.join('”“') + '”，它们是这一阶段较清楚的线索。';
  } else {
    stateText = '你持续留下梦境，但稳定模式还在形成；目前只保留已经出现的线索。';
  }
  if (records.length >= 3 || factsList.length >= 2 || discussions >= 2) {
    changing = '你正在从记录感受，慢慢走向辨认现实里哪些事情仍在牵动你。';
  }
  var summaryParts = ['当下的状态：' + stateText];
  if (themes.length) summaryParts.push('反复出现的主题：' + themes.join('、') + '。');
  summaryParts.push('情绪的底色：' + tone);
  if (changing) summaryParts.push('正在变化的：' + changing);
  var summary = summaryParts.join('').slice(0, 200);

  return {
    version: Number(nextVersion) || 1,
    status: 'confirmed',
    isCurrent: true,
    summary: summary,
    profileText: summary,
    emotionalTone: tone.slice(0, 100),
    changing: changing.slice(0, 120),
    traits: [],
    themes: uniqueList(themes, 3),
    realLifeContext: factsList,
    sourceRefs: insights.evidenceDreamIds.map(function (id) {
      return { type: 'dream', id: id };
    }),
    baseProfile: {
      nickname: cleanText(profile && profile.nickname, 30),
      birthDate: cleanText(profile && profile.birthDate, 20),
      birthTime: cleanText(profile && profile.birthTime, 20),
      birthPlace: cleanText(profile && profile.birthPlace, 60),
      gender: cleanText(profile && profile.gender, 12)
    },
    sourceCounts: {
      dreamCount: insights.dreamCount,
      discussionCount: discussions,
      lifeNoteCount: factsList.length
    },
    changeReason: cleanText(changeReason || '根据近期梦境变化生成', 80),
    aiOriginal: summary,
    userEdited: null,
    useInFutureReadings: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

var PROFILE_MEMORY_KEY = 'oneiro:profileMemory';
var syncQueue = require('./syncQueue');
var portraitRefreshInFlight = false;
var portraitRefreshPending = null;

function portraitSnapshotId(snapshot) {
  return snapshot ? String(snapshot._id || snapshot.id || snapshot.clientId || '') : '';
}

function readPortraitMemory() {
  var state = readStorage(PROFILE_MEMORY_KEY) || {};
  return state && typeof state === 'object' ? state : {};
}

function writePortraitMemory(state) {
  writeStorage(PROFILE_MEMORY_KEY, state);
}

function mergePortraitDraft(state, snapshot, dreamCount, refreshKey) {
  var clientId = portraitSnapshotId(snapshot);
  var portrait = Object.assign({}, snapshot, { clientId: clientId, status: 'confirmed', isCurrent: true });
  var history = Array.isArray(state.history) ? state.history : [];
  var previousPortraitId = portraitSnapshotId(state.current || state.latestDraft);
  if (previousPortraitId && previousPortraitId !== clientId) {
    history = history.map(function (item) {
      return portraitSnapshotId(item) === previousPortraitId
        ? Object.assign({}, item, { status: 'superseded', isCurrent: false })
        : item;
    });
  }
  state.current = portrait;
  delete state.latestDraft;
  state.history = [portrait].concat(history.filter(function (item) {
    return portraitSnapshotId(item) !== clientId;
  })).slice(0, 30);
  state.lastGeneratedDreamCount = Number(dreamCount || 0);
  state.lastPortraitRefreshKey = refreshKey || '';
  return state;
}

/*
 * Starts a portrait refresh after a persisted dream or a dream discussion.
 * The caller deliberately does not await it: saving a dream or replying in
 * chat must remain responsive when portrait generation is slow or unavailable.
 */
function refreshPortraitInBackground(options) {
  var input = options || {};
  var cloudBase = input.cloudBase;
  var archive = Array.isArray(input.archive) ? input.archive : (readStorage('oneiro:dreamArchive') || []);
  var insights = buildInsights(archive);
  var reason = cleanText(input.reason || '近期梦境或讨论有新变化', 220);
  var refreshKey = cleanText(input.refreshKey || reason + ':' + String(insights.dreamCount), 180);
  var state = readPortraitMemory();

  if (!cloudBase || typeof cloudBase.generateProfilePortrait !== 'function') return false;
  if (refreshKey && state.lastPortraitRefreshKey === refreshKey) return false;

  if (portraitRefreshInFlight) {
    portraitRefreshPending = input;
    return true;
  }

  portraitRefreshInFlight = true;
  cloudBase.generateProfilePortrait(reason, function (result) {
    var next;
    var pending;
    portraitRefreshInFlight = false;
    if (!result || !result.ok || !result.snapshot) {
      syncQueue.enqueue('portrait_refresh', { refreshKey: refreshKey, reason: reason });
      if (typeof input.onComplete === 'function') input.onComplete(result || { ok: false });
      if (portraitRefreshPending) {
        pending = portraitRefreshPending;
        portraitRefreshPending = null;
        setTimeout(function () { refreshPortraitInBackground(pending); }, 0);
      }
      return;
    }
    next = mergePortraitDraft(readPortraitMemory(), result.snapshot, insights.dreamCount, refreshKey);
    syncQueue.removeByKey('portrait:' + refreshKey);
    writePortraitMemory(next);
    if (typeof input.onUpdated === 'function') input.onUpdated(next, result.snapshot);
    if (typeof input.onComplete === 'function') input.onComplete(result);
    if (portraitRefreshPending) {
      pending = portraitRefreshPending;
      portraitRefreshPending = null;
      setTimeout(function () { refreshPortraitInBackground(pending); }, 0);
    }
  });
  return true;
}

module.exports = {
  buildInsights: buildInsights,
  buildProfileDraft: buildProfileDraft,
  autoExtractedRealLifeContext: autoExtractedRealLifeContext,
  confirmedRealLifeContext: autoExtractedRealLifeContext,
  refreshPortraitInBackground: refreshPortraitInBackground
};
