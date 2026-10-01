// 「加入群聊」在首页和关于页是同一套东西：复制群号 + 弹出二维码弹窗。
// 单独成文件，既不把这段逻辑塞进已经很长的 app.js，也不让两个页面各写一份。
const GROUP_NUMBER = '1041665197';

const qrModal = document.querySelector('#qr-modal');
const qrModalPanel = qrModal?.querySelector('.qr-modal-panel');
const copyResetTimers = new WeakMap();
let qrReturnFocus = null;

function scopeOf(element) {
  return element.closest('[data-qr-scope]');
}

function statusOf(button) {
  return scopeOf(button)?.querySelector('[data-copy-status]') ?? null;
}

// 老浏览器没有异步剪贴板时退回选中 + execCommand，再不济把群号选中给用户手抄
function selectGroupNumber(button) {
  const target = scopeOf(button)?.querySelector('[data-group-number]');
  if (!target) return;
  const range = document.createRange();
  range.selectNodeContents(target);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

async function writeClipboard(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) { /* 非 HTTPS 或权限被拒时继续走兜底 */ }
  }
  return false;
}

async function copyGroupNumber(button) {
  const status = statusOf(button);
  let copied = await writeClipboard(GROUP_NUMBER);
  if (!copied) {
    selectGroupNumber(button);
    try {
      copied = document.execCommand('copy');
    } catch (_) {
      copied = false;
    }
  }

  if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
  button.textContent = copied ? '已复制' : '复制失败';
  button.classList.toggle('is-copied', copied);
  if (status) {
    status.textContent = copied
      ? `群号 ${GROUP_NUMBER} 已复制`
      : `复制失败，请手动输入群号 ${GROUP_NUMBER}`;
  }

  window.clearTimeout(copyResetTimers.get(button));
  copyResetTimers.set(button, window.setTimeout(() => {
    button.textContent = button.dataset.idleLabel;
    button.classList.remove('is-copied');
    if (status) status.textContent = '';
  }, 1800));
}

function openQrModal() {
  if (!qrModal) return;
  qrReturnFocus = document.activeElement;
  qrModal.classList.add('is-open');
  qrModal.setAttribute('aria-hidden', 'false');
  // 复用灯箱的「正在预览」状态：它已经负责隐藏看板娘和固定定位的浮层
  document.body.classList.add('is-previewing');
  qrModal.querySelector('.qr-modal-close')?.focus();
}

function closeQrModal() {
  if (!qrModal?.classList.contains('is-open')) return;
  qrModal.classList.remove('is-open');
  qrModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-previewing');
  if (qrReturnFocus?.isConnected) qrReturnFocus.focus({ preventScroll: true });
  qrReturnFocus = null;
}

document.querySelectorAll('[data-open-qr]').forEach((button) => {
  button.addEventListener('click', () => {
    openQrModal();
    // 让弹窗里那颗复制按钮给出反馈：点一次就同时拿到群号和二维码
    const copyButton = qrModal?.querySelector('[data-copy-group]');
    if (copyButton) copyGroupNumber(copyButton);
  });
});

document.querySelectorAll('[data-copy-group]').forEach((button) => {
  button.addEventListener('click', () => copyGroupNumber(button));
});

qrModal?.querySelectorAll('[data-close-qr]').forEach((element) => {
  element.addEventListener('click', closeQrModal);
});

document.addEventListener('keydown', (event) => {
  if (!qrModal || !qrModal.classList.contains('is-open')) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeQrModal();
    return;
  }

  if (event.key !== 'Tab' || !qrModalPanel) return;
  const controls = [...qrModalPanel.querySelectorAll('button, a[href]')]
    .filter((element) => !element.disabled && element.getClientRects().length);
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (!first) return;
  if (!qrModalPanel.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
