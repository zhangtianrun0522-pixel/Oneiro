var recorderManager = wx.getRecorderManager();
var activePage = null;
var listenersBound = false;
var discardStopForPage = null;

function bindListeners() {
  if (listenersBound) return;
  recorderManager.onStop(function (result) {
    if (discardStopForPage) {
      discardStopForPage = null;
      return;
    }
    if (activePage && activePage.data && activePage.data.recording === true && typeof activePage.onRecorderStop === 'function') {
      activePage.onRecorderStop(result);
    }
  });
  recorderManager.onError(function (error) {
    if (discardStopForPage) {
      discardStopForPage = null;
      return;
    }
    if (activePage && activePage.data && activePage.data.recording === true && typeof activePage.onRecorderError === 'function') {
      activePage.onRecorderError(error);
    }
  });
  listenersBound = true;
}

function register(page) {
  bindListeners();
  activePage = page || null;
}

function unregister(page) {
  if (!page || activePage === page) activePage = null;
}

function start(options) {
  return recorderManager.start(options || {});
}

function stop() {
  return recorderManager.stop();
}

function stopForExit(page) {
  // Leaving a page deliberately discards a partial clip. Clear visual state
  // in the page first, then absorb its terminal recorder event even if the
  // page is registered again before the native callback arrives.
  discardStopForPage = page || activePage;
  return recorderManager.stop();
}

module.exports = {
  register: register,
  unregister: unregister,
  start: start,
  stop: stop,
  stopForExit: stopForExit
};
