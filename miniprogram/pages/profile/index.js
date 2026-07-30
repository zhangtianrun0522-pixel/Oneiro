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
  return Object.assign({}, snapshot, { clientId: snapshotId(snapshot) });
}

function normalizeMemoryState(value) {
  var source = value && typeof value === 'object' ? value : {};
  // `latestDraft` is read only as a migration fallback for locally cached
  // states created before portraits became immediately active.
  var current = withClientId(source.current || source.latestDraft);
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
    portraitLoading: false,
    portraitSaving: false,
    portraitEditing: false,
    portraitEditSummary: '',
    showPortraitHistory: false,
    revisit: null,
    revisitAnswering: false,
    revisitAnswerText: '',
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
    if (wx.getStorageSync('oneiro:revisitDisabled')) {
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
    if (!revisit || !revisit.localId) return;
    if (!text) {
      wx.showToast({ title: '写一句就好', icon: 'none' });
      return;
    }
    cloudBase.answerRevisit(revisit.localId, text, function (result) {
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
    this.setData({ revisit: null, revisitAnswering: false, revisitAnswerText: '' });
    wx.showToast({ title: '已关闭，之后不会再提醒', icon: 'none' });
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
    cloudBase.getProfileMemory(function (result) {
      if (!result || !result.ok) return;
      var remote = normalizeMemoryState(result);
      var local = normalizeMemoryState(that.data.memoryState);
      if (!remote.current && !remote.latestDraft && !remote.history.length && local.history.length) return;
      persistMemoryState(remote);
      that.setData({ memoryState: remote });
    });
  },

  togglePortraitHistory: function () {
    this.setData({ showPortraitHistory: !this.data.showPortraitHistory });
  },

  restorePortrait: function (event) {
    var that = this;
    var state = normalizeMemoryState(this.data.memoryState);
    var targetId = String(event && event.currentTarget && event.currentTarget.dataset.id || '');
    var target = state.history.filter(function (item) { return item.clientId === targetId; })[0];
    if (!target || targetId === snapshotId(state.current)) return;

    wx.showModal({
      title: '回到这段理解？',
      content: '当前画像会保留在历史记录里，不会被删除。',
      confirmText: '回溯',
      success: function (res) {
        if (!res.confirm) return;
        function applyRestored(snapshot) {
          var previousId = snapshotId(state.current);
          var restored = withClientId(snapshot || Object.assign({}, target, {
            id: 'local-restored-' + String(Date.now()),
            version: state.history.reduce(function (max, item) { return Math.max(max, Number(item.version || 0)); }, 0) + 1,
            changeReason: '从 V' + String(target.version || '?') + ' 回溯',
            userEdited: { restoredFromVersion: Number(target.version || 0), restoredAt: new Date().toISOString() }
          }));
          restored.status = 'confirmed';
          restored.isCurrent = true;
          state.current = restored;
          state.history = [restored].concat(state.history.filter(function (item) {
            return item.clientId !== restored.clientId;
          }).map(function (item) {
            return item.clientId === previousId
              ? Object.assign({}, item, { status: 'superseded', isCurrent: false })
              : item;
          })).slice(0, 30);
          persistMemoryState(state);
          that.setData({ memoryState: state, showPortraitHistory: false });
          wx.showToast({ title: '已回到这段理解', icon: 'success' });
        }
        if (!targetId || targetId.indexOf('local-') === 0) {
          applyRestored(null);
          return;
        }
        cloudBase.restoreProfilePortrait(targetId, function (result) {
          if (!result || !result.ok || !result.snapshot) {
            wx.showToast({ title: '回溯失败，请稍后再试', icon: 'none' });
            return;
          }
          applyRestored(result.snapshot);
        });
      }
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

  createLocalPortraitDraft: function (changeReason) {
    var state = normalizeMemoryState(this.data.memoryState);
    var archive = wx.getStorageSync('oneiro:dreamArchive') || [];
    var maxVersion = state.history.reduce(function (max, item) {
      return Math.max(max, Number(item.version || 0));
    }, 0);
    var portrait = dreamMemory.buildProfileDraft(this.data.profile, archive, maxVersion + 1, changeReason);
    portrait.id = 'local-' + String(Date.now());
    portrait.clientId = portrait.id;
    portrait.status = 'confirmed';
    portrait.isCurrent = true;
    state.history = [portrait].concat(state.history.map(function (item) {
      return item.clientId === snapshotId(state.current)
        ? Object.assign({}, item, { status: 'superseded', isCurrent: false })
        : item;
    })).slice(0, 30);
    state.current = portrait;
    state.lastGeneratedDreamCount = this.data.insights.dreamCount;
    persistMemoryState(state);
    this.setData({ memoryState: state });
    return portrait;
  },

  generatePortrait: function (event) {
    var that = this;
    var reason = event && event.currentTarget && event.currentTarget.dataset.reason
      ? event.currentTarget.dataset.reason
      : '根据最新资料与梦境变化生成';
    var localPortrait;

    if (this.data.portraitLoading) return;
    localPortrait = this.createLocalPortraitDraft(reason);
    this.setData({ portraitLoading: true, portraitEditing: false });
    analytics.trackEvent('profile_portrait_generate', {
      dreamCount: this.data.insights.dreamCount,
      reason: reason
    });
    cloudBase.generateProfilePortrait(reason, function (result) {
      var state = normalizeMemoryState(that.data.memoryState);
      that.setData({ portraitLoading: false });
      if (!result || !result.ok || !result.snapshot) {
        wx.showToast({ title: '已更新为本机画像', icon: 'none' });
        return;
      }
      var remotePortrait = Object.assign({}, withClientId(result.snapshot), { status: 'confirmed', isCurrent: true });
      state.history = [remotePortrait].concat(state.history.filter(function (item) {
        return item.clientId !== localPortrait.clientId && item.clientId !== remotePortrait.clientId;
      }).map(function (item) {
        return item.clientId === snapshotId(state.current)
          ? Object.assign({}, item, { status: 'superseded', isCurrent: false })
          : item;
      })).slice(0, 30);
      state.current = remotePortrait;
      state.lastGeneratedDreamCount = that.data.insights.dreamCount;
      persistMemoryState(state);
      that.setData({ memoryState: state });
      wx.showToast({ title: '阶段画像已更新', icon: 'success' });
    });
  },

  startPortraitEdit: function () {
    var portrait = this.data.memoryState.current;
    if (!portrait) return;
    this.setData({ portraitEditing: true, portraitEditSummary: portrait.summary || '' });
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
    if (!portrait || !summary || this.data.portraitSaving) return;
    if (!snapshotId(portrait) || snapshotId(portrait).indexOf('local-') === 0) {
      portrait = Object.assign({}, portrait, { summary: summary, userEdited: true, updatedAt: new Date().toISOString() });
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
