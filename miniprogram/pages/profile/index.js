var analytics = require('../../utils/analytics');
var cloudBase = require('../../utils/cloudBase');
var dreamMemory = require('../../utils/dreamMemory');
var tabNav = require('../../utils/tabNav');

var PROFILE_MEMORY_KEY = 'oneiro:profileMemory';

function emptyProfile() {
  return { nickname: '', birthDate: '', birthTime: '', birthPlace: '', gender: '' };
}

function genderIndexFor(value) {
  var normalized = String(value || '').trim().toLowerCase();
  return normalized === 'male' ? 1 : normalized === 'female' ? 2 : 0;
}

function isValidDate(value) {
  var text = String(value || '');
  var parts;
  var date;

  if (!text) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  parts = text.split('-').map(Number);
  date = new Date(parts[0], parts[1] - 1, parts[2]);
  return parts[0] >= 1900 && parts[0] <= new Date().getFullYear() &&
    date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
}

function emptyMemoryState() {
  return { current: null, history: [], pastHistory: [], lastGeneratedDreamCount: 0 };
}

function snapshotId(snapshot) {
  return snapshot ? String(snapshot._id || snapshot.id || '') : '';
}

function withClientId(snapshot) {
  if (!snapshot) return null;
  var summary = String(snapshot.summary || snapshot.profileText || '').trim();
  return Object.assign({}, snapshot, { summary: summary, profileText: snapshot.profileText || summary, clientId: snapshotId(snapshot) });
}

// V7 and earlier stored page instructions as the portrait itself. Treat those
// snapshots as a migration candidate, while keeping them visible until V8 is
// successfully generated.
function needsPortraitMigration(snapshot) {
  var summary = String(snapshot && (snapshot.summary || snapshot.profileText) || '').trim();
  var wasUserEdited = snapshot && (
    snapshot.userEdited === true ||
    (snapshot.userEdited && typeof snapshot.userEdited === 'object') ||
    (snapshot.userEditedOriginal && typeof snapshot.userEditedOriginal === 'object')
  );
  if (wasUserEdited) return false;
  return !summary || /这是一份|基于近期|供你确认|供你修改|供你拒绝|阶段性观察|仅提炼当前|目前资料较少|等待你补充/.test(summary);
}

function normalizeMemoryState(value) {
  var source = value && typeof value === 'object' ? value : {};
  // 旧草稿只保留在云端历史中，不能在客户端伪装成已经生效的当前画像。
  var current = withClientId(source.current);
  var history = (Array.isArray(source.history) ? source.history : []).map(withClientId);
  var currentId = snapshotId(current);
  return {
    current: current,
    history: history,
    pastHistory: history.filter(function (item) {
      return snapshotId(item) !== currentId;
    }),
    lastGeneratedDreamCount: Number(source.lastGeneratedDreamCount || 0),
    lastPortraitRefreshKey: String(source.lastPortraitRefreshKey || '')
  };
}

function persistMemoryState(state) {
  var normalized = normalizeMemoryState(state);
  Object.keys(state).forEach(function (key) { delete state[key]; });
  Object.assign(state, normalized);
  wx.setStorageSync(PROFILE_MEMORY_KEY, state);
}

function sameProfile(left, right) {
  return ['nickname', 'birthDate', 'birthTime', 'birthPlace', 'gender'].every(function (key) {
    return String((left && left[key]) || '') === String((right && right[key]) || '');
  });
}

Page({
  data: {
    profile: emptyProfile(),
    genderOptions: ['不填写', '男', '女'],
    genderIndex: 0,
    saving: false,
    // `memoryLoaded` guards the empty-state card: it starts false so the
    // first render shows a loading state instead of flashing "no portrait
    // yet" while the async cloud fetch in loadProfileMemory() is pending.
    memoryLoaded: false,
    portraitLoadError: false,
    portraitGenerateFailed: false,
    portraitLoading: false,
    portraitAutoGenerateTriggered: false,
    portraitSaving: false,
    portraitEditing: false,
    portraitEditSummary: '',
    revisit: null,
    revisitAnswering: false,
    revisitAnswerText: '',
    revisitSubmitting: false,
    revisitDisabled: false,
    lifeNotes: [],
    memoryState: emptyMemoryState(),
    insights: dreamMemory.buildInsights([])
  },

  onLoad: function () {
    var app = getApp();
    var saved = wx.getStorageSync('oneiro:lastProfile') || app.globalData.lastProfile || emptyProfile();
    var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
    var state = normalizeMemoryState(wx.getStorageSync(PROFILE_MEMORY_KEY));
    var insights = dreamMemory.buildInsights(archive);
    this.setData({
      profile: Object.assign(emptyProfile(), saved),
      genderIndex: genderIndexFor(saved.gender),
      memoryState: state,
      // If a cached snapshot already exists locally there is nothing to
      // block the empty-state on; only a truly cold cache waits for the
      // cloud round trip in loadProfileMemory() before it may render empty.
      memoryLoaded: !!state.current,
      insights: insights,
      lifeNotes: dreamMemory.autoExtractedRealLifeContext(archive).map(function (text, index) {
        return { id: '', localKey: 'local-' + index, text: text, localOnly: true };
      })
    });
    analytics.trackEvent('profile_view', { hasBirthDate: !!saved.birthDate });
    this.loadProfileMemory();
    this.loadLifeNotes();
  },

  onShow: function () {
    this.loadRevisit();
  },

  loadRevisit: function () {
    var that = this;
    var disabled = !!wx.getStorageSync('oneiro:revisitDisabled');
    this.setData({ revisitDisabled: disabled });
    if (disabled) {
      this.setData({ revisit: null, revisitAnswering: false, revisitAnswerText: '' });
      return;
    }
    cloudBase.getRevisit(function (result) {
      that.setData({ revisit: result && result.ok && result.dream ? result.dream : null });
    });
  },

  startAnswerRevisit: function () {
    this.setData({ revisitAnswering: true });
  },

  onRevisitAnswerInput: function (event) {
    this.setData({ revisitAnswerText: event.detail.value });
  },

  submitRevisitAnswer: function () {
    var that = this;
    var revisit = this.data.revisit;
    var text = String(this.data.revisitAnswerText || '').trim();
    if (!revisit || !revisit.localId || this.data.revisitSubmitting) return;
    if (!text) {
      wx.showToast({ title: '写一句就好', icon: 'none' });
      return;
    }
    this.setData({ revisitSubmitting: true });
    cloudBase.answerRevisit(revisit.localId, text, function (result) {
      that.setData({ revisitSubmitting: false });
      if (!result || !result.ok) {
        wx.showToast({ title: '暂时没有保存成功，请稍后再试', icon: 'none' });
        return;
      }
      that.setData({ revisit: null, revisitAnswering: false, revisitAnswerText: '' });
      that.loadLifeNotes();
      that.refreshPortraitInBackground('回访回答后重新理解你', 'revisit:' + String(revisit.localId));
      wx.showToast({ title: '谢谢你的分享，我会记得这一点', icon: 'none' });
    });
  },

  skipRevisitPrompt: function () {
    var revisit = this.data.revisit;
    if (revisit && revisit.localId) cloudBase.skipRevisit(revisit.localId);
    this.setData({ revisit: null, revisitAnswering: false, revisitAnswerText: '' });
  },

  disableRevisitPrompts: function () {
    var revisit = this.data.revisit;
    wx.setStorageSync('oneiro:revisitDisabled', true);
    if (revisit && revisit.localId) cloudBase.skipRevisit(revisit.localId);
    this.setData({ revisit: null, revisitAnswering: false, revisitAnswerText: '', revisitDisabled: true });
    wx.showToast({ title: '已关闭，之后不会再提醒', icon: 'none' });
  },

  // Recovers from the one-way `oneiro:revisitDisabled` flag: previously
  // nothing in the app could clear it once a user tapped "关闭提醒", so the
  // revisit feature was permanently gone for them. This gives it back.
  enableRevisitPrompts: function () {
    wx.removeStorageSync('oneiro:revisitDisabled');
    this.setData({ revisitDisabled: false });
    this.loadRevisit();
    wx.showToast({ title: '已恢复回访提醒', icon: 'none' });
  },

  loadLifeNotes: function () {
    var that = this;
    cloudBase.getLifeNotes(function (result) {
      if (!result || !result.ok || !Array.isArray(result.notes)) return;
      var notes = result.notes.map(function (note) {
        return Object.assign({}, note, { localKey: note.id || String(note.createdAt || '') });
      });
      that.setData({ lifeNotes: notes });
    });
  },

  refreshPortraitInBackground: function (reason, refreshKey) {
    var that = this;
    return dreamMemory.refreshPortraitInBackground({
      cloudBase: cloudBase,
      reason: reason,
      refreshKey: refreshKey,
      archive: wx.getStorageSync('oneiro:dreamArchive') || [],
      onUpdated: function (state) {
        that.setData({ memoryState: normalizeMemoryState(state) });
      }
    });
  },

  editLifeNote: function (event) {
    var that = this;
    var index = Number(event.currentTarget.dataset.index);
    var note = this.data.lifeNotes[index];
    if (!note || !note.id) {
      wx.showToast({ title: '联网后可修改这条片段', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '修改现实片段',
      editable: true,
      content: note.text,
      placeholderText: note.text,
      success: function (res) {
        var text = String(res.content || '').trim();
        if (!res.confirm || !text || text === note.text) return;
        cloudBase.editLifeNote(note.id, text, function (result) {
          if (!result || !result.ok) {
            wx.showToast({ title: '修改失败，请稍后再试', icon: 'none' });
            return;
          }
          that.loadLifeNotes();
          that.loadProfileMemory();
          that.refreshPortraitInBackground('用户修改了现实片段', 'life-note-edit:' + note.id + ':' + String(Date.now()));
          wx.showToast({ title: '现实片段已修改', icon: 'success' });
        });
      }
    });
  },

  deleteLifeNote: function (event) {
    var that = this;
    var index = Number(event.currentTarget.dataset.index);
    var note = this.data.lifeNotes[index];
    if (!note || !note.id) {
      wx.showToast({ title: '联网后可删除这条片段', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除这条现实片段？',
      content: '删除后，它不会再用于画像和后续梦境关联。',
      confirmText: '删除',
      confirmColor: '#b85c54',
      success: function (res) {
        if (!res.confirm) return;
        cloudBase.deleteLifeNote(note.id, function (result) {
          if (!result || !result.ok) {
            wx.showToast({ title: '删除失败，请稍后再试', icon: 'none' });
            return;
          }
          that.loadLifeNotes();
          that.loadProfileMemory();
          that.refreshPortraitInBackground('用户删除了现实片段', 'life-note-delete:' + note.id + ':' + String(Date.now()));
          wx.showToast({ title: '现实片段已删除', icon: 'success' });
        });
      }
    });
  },

  loadProfileMemory: function () {
    var that = this;
    this.setData({ memoryLoaded: false, portraitLoadError: false });
    cloudBase.getProfileMemory(function (result) {
      if (!result || !result.ok) {
        // The fetch itself failed (network/cloud error). Only surface this
        // as a distinct "failed to load" state when we have nothing else to
        // show yet — if a portrait is already displayed (from local cache
        // or a just-created draft), a background fetch failure shouldn't
        // disturb it.
        that.setData({ memoryLoaded: true, portraitLoadError: !that.data.memoryState.current });
        return;
      }
      var remote = normalizeMemoryState(result);
      var local = normalizeMemoryState(that.data.memoryState);
      if (!remote.current && !remote.latestDraft && !remote.history.length && (local.current || local.history.length)) {
        that.setData({ memoryLoaded: true, portraitLoadError: false });
        if (needsPortraitMigration(local.current)) that.ensurePortraitGenerated(true, '旧版本画像升级');
        return;
      }
      persistMemoryState(remote);
      that.setData({ memoryState: remote, memoryLoaded: true, portraitLoadError: false });
      if (!remote.current) that.ensurePortraitGenerated();
      else if (needsPortraitMigration(remote.current)) that.ensurePortraitGenerated(true, '旧版本画像升级');
    });
  },

  retryPortrait: function () {
    this.setData({
      memoryLoaded: false,
      portraitLoadError: false,
      portraitGenerateFailed: false,
      portraitAutoGenerateTriggered: false
    });
    this.loadProfileMemory();
  },

  refreshPortrait: function () {
    // Auto-migration is intentionally once per page load. A user-triggered
    // refresh is a separate explicit action and must remain available.
    this.setData({ portraitAutoGenerateTriggered: false, portraitGenerateFailed: false });
    this.ensurePortraitGenerated(true, '手动重新梳理');
  },

  ensurePortraitGenerated: function (allowExisting, reason) {
    var that = this;
    var state = normalizeMemoryState(this.data.memoryState);
    if ((!allowExisting && state.current) || this.data.portraitLoading || this.data.portraitAutoGenerateTriggered) return;
    this.setData({ portraitLoading: true, portraitAutoGenerateTriggered: true, portraitGenerateFailed: false });
    analytics.trackEvent(allowExisting ? 'profile_portrait_refresh' : 'profile_portrait_auto_generate', { dreamCount: this.data.insights.dreamCount });
    cloudBase.generateProfilePortrait(reason || '首次打开画像时自动梳理', function (result) {
      var nextState;
      var snapshot;
      if (!result || !result.ok || !result.snapshot) {
        that.setData({ portraitLoading: false, portraitGenerateFailed: true });
        return;
      }
      nextState = normalizeMemoryState(that.data.memoryState);
      snapshot = Object.assign({}, withClientId(result.snapshot), { status: 'confirmed', isCurrent: true });
      nextState.current = snapshot;
      nextState.history = [snapshot].concat(nextState.history.filter(function (item) {
        return snapshotId(item) !== snapshotId(snapshot);
      }).map(function (item) {
        return Object.assign({}, item, { isCurrent: false });
      })).slice(0, 30);
      nextState.lastGeneratedDreamCount = that.data.insights.dreamCount;
      persistMemoryState(nextState);
      that.setData({ memoryState: nextState, memoryLoaded: true, portraitLoading: false, portraitGenerateFailed: false });
    });
  },

  onInput: function (event) {
    var profile = Object.assign({}, this.data.profile);
    profile[event.currentTarget.dataset.key] = event.detail.value;
    this.setData({ profile: profile });
  },

  onBirthDateChange: function (event) {
    var profile = Object.assign({}, this.data.profile, { birthDate: event.detail.value });
    this.setData({ profile: profile });
  },

  onBirthTimeChange: function (event) {
    var profile = Object.assign({}, this.data.profile, { birthTime: event.detail.value });
    this.setData({ profile: profile });
  },

  onGenderChange: function (event) {
    var index = Number(event.detail.value || 0);
    var profile = Object.assign({}, this.data.profile, {
      gender: index === 1 ? 'male' : index === 2 ? 'female' : ''
    });
    this.setData({ profile: profile, genderIndex: index });
  },

  clearBirthDate: function () {
    var profile = Object.assign({}, this.data.profile, { birthDate: '' });
    this.setData({ profile: profile });
  },

  clearBirthTime: function () {
    var profile = Object.assign({}, this.data.profile, { birthTime: '' });
    this.setData({ profile: profile });
  },

  startPortraitEdit: function () {
    var portrait = this.data.memoryState.current;
    if (!portrait || this.data.portraitLoading) return;
    this.setData({ portraitEditing: true, portraitEditSummary: portrait.summary || '' });
  },

  // wxml 的「暂停用于解读 / 恢复用于解读」一直 bindtap 到这个名字，但页面上
  // 从来没有实现过它（git 里查无此方法），点一下就抛 "is not a function"。
  // 云端能力 cloudBase.toggleProfilePortrait 早就在了，这里把它接上：
  // 先本地翻转让界面立刻响应，云端失败再回滚并说明，不留下和云端不一致的状态。
  togglePortraitUse: function () {
    var that = this;
    var state = normalizeMemoryState(this.data.memoryState);
    var portrait = state.current;
    if (!portrait || this.data.portraitLoading) return;

    var nextUse = portrait.useInFutureReadings === false;
    var targetId = snapshotId(portrait);

    function applyUse(useInFutureReadings) {
      var next = normalizeMemoryState(that.data.memoryState);
      if (!next.current) return;
      next.current = Object.assign({}, next.current, { useInFutureReadings: useInFutureReadings });
      next.history = next.history.map(function (item) {
        return snapshotId(item) === targetId
          ? Object.assign({}, item, { useInFutureReadings: useInFutureReadings })
          : item;
      });
      persistMemoryState(next);
      that.setData({ memoryState: next });
    }

    applyUse(nextUse);
    analytics.trackEvent('profile_portrait_toggle_use', { useInFutureReadings: nextUse });

    // 纯本机草稿还没有云端快照 id，本地翻转即是全部状态
    if (!targetId || targetId.indexOf('local-') === 0) {
      wx.showToast({ title: nextUse ? '已恢复用于解读' : '已暂停用于解读', icon: 'none' });
      return;
    }

    cloudBase.toggleProfilePortrait(targetId, nextUse, function (result) {
      if (!result || !result.ok) {
        applyUse(!nextUse);
        wx.showToast({ title: '暂时没有改成功，请稍后再试', icon: 'none' });
        return;
      }
      wx.showToast({ title: nextUse ? '已恢复用于解读' : '已暂停用于解读', icon: 'none' });
    });
  },

  onPortraitSummaryInput: function (event) {
    this.setData({ portraitEditSummary: event.detail.value });
  },

  cancelPortraitEdit: function () {
    this.setData({ portraitEditing: false, portraitEditSummary: '' });
  },

  savePortraitEdit: function () {
    var that = this;
    var state = normalizeMemoryState(this.data.memoryState);
    var portrait = state.current;
    var summary = String(this.data.portraitEditSummary || '').trim().slice(0, 500);
    if (!portrait || !summary || this.data.portraitSaving || this.data.portraitLoading) return;
    if (!snapshotId(portrait) || snapshotId(portrait).indexOf('local-') === 0) {
      portrait = Object.assign({}, portrait, {
        summary: summary,
        profileText: summary,
        userEdited: { summary: summary, editedAt: new Date().toISOString() },
        updatedAt: new Date().toISOString()
      });
      state.current = portrait;
      state.history = state.history.map(function (item) { return item.clientId === portrait.clientId ? portrait : item; });
      persistMemoryState(state);
      this.setData({ memoryState: state, portraitSaving: true });
      this.setData({ portraitSaving: false, portraitEditing: false, portraitEditSummary: '' });
      wx.showToast({ title: '修改已保存在本机', icon: 'none' });
      return;
    }
    this.setData({ portraitSaving: true });
    cloudBase.saveProfilePortrait(snapshotId(portrait), { summary: summary }, function (result) {
      that.setData({ portraitSaving: false });
      if (!result || !result.ok || !result.snapshot) {
        wx.showToast({ title: '云端修改失败，编辑内容仍保留', icon: 'none' });
        return;
      }
      var updated = Object.assign({}, withClientId(result.snapshot), { status: 'confirmed', isCurrent: true });
      var previousPortraitId = snapshotId(portrait);
      state.current = updated;
      state.history = [updated].concat(state.history.filter(function (item) {
        return item.clientId !== updated.clientId;
      }).map(function (item) {
        return item.clientId === previousPortraitId
          ? Object.assign({}, item, { status: 'superseded', isCurrent: false })
          : item;
      })).slice(0, 30);
      persistMemoryState(state);
      that.setData({
        memoryState: state,
        portraitEditing: false,
        portraitEditSummary: ''
      });
      wx.showToast({ title: '阶段画像已修改', icon: 'success' });
    });
  },

  saveProfile: function () {
    var that = this;
    var app = getApp();
    var previousProfile = wx.getStorageSync('oneiro:lastProfile') || emptyProfile();
    var profile = {
      nickname: String(this.data.profile.nickname || '').trim().slice(0, 30),
      birthDate: String(this.data.profile.birthDate || '').trim(),
      birthTime: String(this.data.profile.birthTime || '').trim(),
      birthPlace: String(this.data.profile.birthPlace || '').trim().slice(0, 60),
      gender: ['male', 'female'].indexOf(String(this.data.profile.gender || '').trim().toLowerCase()) >= 0
        ? String(this.data.profile.gender).trim().toLowerCase()
        : ''
    };

    if (!isValidDate(profile.birthDate)) {
      wx.showToast({ title: '出生日期无效', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    app.globalData.lastProfile = profile;
    wx.setStorageSync('oneiro:lastProfile', profile);
    cloudBase.saveProfile(profile, function (result) {
      that.setData({ saving: false });
      analytics.trackEvent('profile_saved', {
        hasNickname: !!profile.nickname,
        hasBirthDate: !!profile.birthDate,
        hasBirthTime: !!profile.birthTime,
        hasGender: !!profile.gender,
        cloudSaved: !!(result && result.ok)
      });
      wx.showToast({
        title: result && result.ok
          ? (profile.nickname || profile.birthDate || profile.birthTime || profile.birthPlace || profile.gender ? '资料已保存' : '资料已清空')
          : '已保存在本机，云端稍后同步',
        icon: result && result.ok ? 'success' : 'none'
      });
      if (!sameProfile(previousProfile, profile)) {
        that.refreshPortraitInBackground('基础资料更新后重新理解你', 'profile:' + String(Date.now()));
      }
      if (wx.getStorageSync('oneiro:pendingDreamText')) {
        if (wx.navigateBack) {
          wx.navigateBack({ delta: 1 });
        } else {
          tabNav.switchTab('pages/home/index');
        }
      }
    });
  },


  newDream: function () {
    tabNav.switchTab('pages/home/index');
  }

});
