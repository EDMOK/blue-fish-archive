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
