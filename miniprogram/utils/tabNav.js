/**
 * 原生 tabBar 的 switchTab 不接受查询参数，因此跳 tab 页时需要把参数
 * 暂存在 globalData 里，由目标页在 onShow 中取走（取走即清空，避免下次
 * 再进同一个 tab 时残留旧参数）。
 */

function store() {
  var app = getApp();
  if (!app.globalData.pendingTabParams) app.globalData.pendingTabParams = {};
  return app.globalData.pendingTabParams;
}

/**
 * 切换到 tab 页，可携带参数。
 * @param {string} pagePath 例如 'pages/archive/index'
 * @param {object} [params]
 * @param {function} [complete]
 */
function switchTab(pagePath, params, complete) {
  if (params && typeof params === 'object') store()[pagePath] = params;
  wx.switchTab({
    url: '/' + pagePath,
    complete: function () { if (typeof complete === 'function') complete(); }
  });
}

/**
 * 目标页在 onShow 里调用，取走并清空本次参数。无参数时返回 {}。
 * @param {string} pagePath
 * @returns {object}
 */
function takeParams(pagePath) {
  var bag = store();
  var params = bag[pagePath] || {};
  delete bag[pagePath];
  return params;
}

module.exports = {
  switchTab: switchTab,
  takeParams: takeParams
};
