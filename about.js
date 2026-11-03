// 关于页自己的页面效果：入场动画与吸顶导航。
// 首页那套逻辑绑在表情墙上，这里重写一份小得多的版本，避免为了两个函数把 app.js 拖进来。
// 「加入群聊」的复制与二维码弹窗在 qr-modal.js（两个页面共用）。
const siteNav = document.querySelector('.site-nav');

const revealItems = document.querySelectorAll('[data-reveal]');
revealItems.forEach((item) => {
  if (item.dataset.delay) {
    item.style.setProperty('--delay', `${item.dataset.delay}ms`);
  }
});

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '640px 0px', threshold: 0.05 },
  );
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

// 滚过首屏后导航浮起成白色贴纸条(与首页一致)
function initNavScroll() {
  if (!siteNav) return;
  const sync = () => siteNav.classList.toggle('is-scrolled', window.scrollY > 26);
  sync();
  window.addEventListener('scroll', sync, { passive: true });
}

initNavScroll();

// 开放数据区的「复制代码」：优先用 Clipboard API，失败时退回选中文本方案。
// 按钮文字短暂变成「已复制」，让点击有明确反馈。
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 剪贴板权限被拒时仍尝试选中复制。
    }
  }
  const helper = document.createElement('textarea');
  helper.value = text;
  helper.setAttribute('readonly', '');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  helper.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(helper);
  return ok;
}

document.querySelectorAll('[data-copy-snippet]').forEach((button) => {
  const source = document.getElementById(button.dataset.copySnippet);
  if (!source) return;
  const original = button.textContent;
  const status = button.closest('.about-api-code')?.querySelector('.about-api-copy-status');
  let resetTimer = 0;

  button.addEventListener('click', async () => {
    const ok = await copyText(source.textContent.trim());
    button.textContent = ok ? '已复制' : '复制失败';
    if (status) status.textContent = ok ? '代码已复制' : '复制失败，请手动选择代码复制';
    button.classList.toggle('is-copied', ok);
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove('is-copied');
      if (status) status.textContent = '';
    }, 1800);
  });
});
