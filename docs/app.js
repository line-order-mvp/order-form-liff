(function() {
  'use strict';

  var config = window.LINE_ORDER_CONFIG || {};
  var statusPanel = document.getElementById('statusPanel');
  var statusTitle = document.getElementById('statusTitle');
  var statusMessage = document.getElementById('statusMessage');
  var orderFrame = document.getElementById('orderFrame');
  var idToken = '';
  var frameWindow = null;
  var frameOrigin = '';
  var frameReadyTimer = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    if (!config.LIFF_ID || !config.GAS_IFRAME_URL || config.GAS_IFRAME_URL.indexOf('PASTE_') === 0) {
      showError('設定が不足しています', 'docs/config.js に LIFF_ID と Apps Script WebアプリURLを設定してください。');
      return;
    }
    if (!window.liff) {
      showError('LINEの読み込みに失敗しました', '通信状況を確認して、もう一度開いてください。');
      return;
    }

    window.addEventListener('message', handleFrameMessage);
    showStatus('注文画面を準備しています', 'LINEアプリと接続しています。少しだけお待ちください。');

    withTimeout(
      window.liff.init({ liffId: config.LIFF_ID }),
      config.LIFF_INIT_TIMEOUT_MS || 15000,
      'LIFF初期化が完了しませんでした。LIFF Endpoint URLとLIFF IDを確認してください。'
    )
      .then(function() {
        if (!window.liff.isInClient()) {
          throw new Error('LINEアプリのリッチメニューから開いてください。');
        }
        idToken = window.liff.getIDToken();
        if (!idToken) {
          throw new Error('LINEの本人確認情報を取得できませんでした。LIFFのopenid権限を確認してください。');
        }
        loadOrderFrame();
      })
      .catch(function(error) {
        showError('注文画面を開けません', friendlyError(error));
      });
  }

  function loadOrderFrame() {
    showStatus('注文フォームを読み込んでいます', '商品マスタとお客様情報を確認しています。');
    orderFrame.src = config.GAS_IFRAME_URL;
    frameReadyTimer = window.setTimeout(function() {
      showError('注文フォームを読み込めません', 'Apps ScriptのWebアプリURL、デプロイ状態、X-Frame設定を確認してください。');
    }, config.FRAME_READY_TIMEOUT_MS || 20000);
  }

  function handleFrameMessage(event) {
    if (!isAllowedFrameOrigin(event.origin) || !event.data || typeof event.data !== 'object') {
      return;
    }

    var message = event.data;
    if (message.type === 'LINE_ORDER_FRAME_READY') {
      frameWindow = event.source;
      frameOrigin = event.origin;
      window.clearTimeout(frameReadyTimer);
      sendToFrame({ type: 'LINE_ORDER_ID_TOKEN', idToken: idToken });
      statusPanel.classList.add('is-hidden');
      orderFrame.classList.remove('is-hidden');
      return;
    }

    if (message.type === 'LINE_ORDER_SEND_CHAT') {
      sendChatMessage(message);
      return;
    }

    if (message.type === 'LINE_ORDER_FATAL') {
      showError('注文画面を開けません', friendlyError(message.error));
    }
  }

  function sendChatMessage(message) {
    if (!message.chatMessageText || !message.orderId || !message.chatResultToken) {
      sendToFrame({
        type: 'LINE_ORDER_CHAT_RESULT',
        orderId: message.orderId || '',
        chatResultToken: message.chatResultToken || '',
        state: '失敗',
        error: 'トーク送信用の注文情報が不足しています。'
      });
      return;
    }

    window.liff.sendMessages([{ type: 'text', text: message.chatMessageText }])
      .then(function() {
        sendToFrame({
          type: 'LINE_ORDER_CHAT_RESULT',
          orderId: message.orderId,
          chatResultToken: message.chatResultToken,
          state: '成功',
          error: ''
        });
      })
      .catch(function(error) {
        sendToFrame({
          type: 'LINE_ORDER_CHAT_RESULT',
          orderId: message.orderId,
          chatResultToken: message.chatResultToken,
          state: '失敗',
          error: friendlyError(error)
        });
      });
  }

  function sendToFrame(payload) {
    if (!frameWindow || !frameOrigin) {
      return;
    }
    frameWindow.postMessage(payload, frameOrigin);
  }

  function isAllowedFrameOrigin(origin) {
    try {
      var host = new URL(origin).hostname;
      var configured = new URL(config.GAS_IFRAME_URL).origin;
      return origin === configured || origin === 'https://script.google.com' || host === 'script.googleusercontent.com' || host.endsWith('.googleusercontent.com');
    } catch (error) {
      return false;
    }
  }

  function showStatus(title, message) {
    statusPanel.classList.remove('is-hidden', 'is-error');
    statusTitle.textContent = title;
    statusMessage.textContent = message;
  }

  function showError(title, message) {
    orderFrame.classList.add('is-hidden');
    statusPanel.classList.remove('is-hidden');
    statusPanel.classList.add('is-error');
    statusTitle.textContent = title;
    statusMessage.textContent = message;
  }

  function withTimeout(promise, milliseconds, message) {
    var timerId;
    var timeout = new Promise(function(resolve, reject) {
      timerId = window.setTimeout(function() {
        reject(new Error(message));
      }, milliseconds);
    });
    return Promise.race([promise, timeout]).then(function(value) {
      window.clearTimeout(timerId);
      return value;
    }, function(error) {
      window.clearTimeout(timerId);
      throw error;
    });
  }

  function friendlyError(error) {
    return String(error && error.message ? error.message : error || '処理できませんでした。')
      .replace(/^Exception:\s*/i, '')
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 260);
  }
})();
