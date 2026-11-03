/*
 * 《肥鱼万事屋》渐进增强脚本。
 * 所有内容在无 JavaScript 时都已完整可读：这里的每个功能都是可选增强。
 */
(function () {
  'use strict';

  const body = document.body;
  if (!body.classList.contains('manual-page')) return;
  body.classList.add('manual-js');

  /* ------------------------------ 吸顶导航 ------------------------------ */

  // 首页的 app.js 会加 is-scrolled；手册页不加载它，导航滚动后就没有底色，
  // 正文会从导航底下透出来。这里补上同一套状态。
  const siteNav = document.querySelector('.site-nav');
  if (siteNav) {
    const syncNav = () => siteNav.classList.toggle('is-scrolled', window.scrollY > 26);
    syncNav();
    window.addEventListener('scroll', syncNav, { passive: true });
  }

  /* ------------------------------ 入场动画 ------------------------------ */

  const revealItems = document.querySelectorAll('.manual-page [data-reveal]');
  revealItems.forEach((item) => {
    if (item.dataset.delay) {
      item.style.setProperty('--delay', `${item.dataset.delay}ms`);
    }
  });

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '200px 0px', threshold: 0.05 },
    );
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add('is-visible'));
  }

  /* ------------------------------ 阅读进度 ------------------------------ */

  const progressBar = document.querySelector('[data-manual-progress]');
  if (progressBar) {
    let ticking = false;
    const updateProgress = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      progressBar.style.width = `${(ratio * 100).toFixed(2)}%`;
      ticking = false;
    };
    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(updateProgress);
      },
      { passive: true },
    );
    window.addEventListener('resize', updateProgress, { passive: true });
    updateProgress();
  }

  /* -------------------------------- 目录 -------------------------------- */

  const tocLinks = Array.from(document.querySelectorAll('.manual-toc a[href^="#"]'));
  if (tocLinks.length) {
    const linkById = new Map();
    tocLinks.forEach((link) => {
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      if (!linkById.has(id)) linkById.set(id, []);
      linkById.get(id).push(link);
    });

    const headings = Array.from(document.querySelectorAll('.manual-prose [id]')).filter((node) =>
      linkById.has(node.id),
    );

    const setActive = (id) => {
      tocLinks.forEach((link) => link.removeAttribute('aria-current'));
      (linkById.get(id) || []).forEach((link) => link.setAttribute('aria-current', 'true'));
    };

    if (headings.length && 'IntersectionObserver' in window) {
      const visible = new Set();
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) visible.add(entry.target.id);
            else visible.delete(entry.target.id);
          });
          // 取当前视口里最靠上的标题，滚动时不会在两条目录之间来回跳
          const current = headings.find((heading) => visible.has(heading.id));
          if (current) setActive(current.id);
        },
        { rootMargin: '-96px 0px -62% 0px', threshold: 0 },
      );
      headings.forEach((heading) => observer.observe(heading));
    }

    // 移动端目录：点完锚点自动收起，避免盖住正文
    const tocDetails = document.querySelector('.manual-toc-details');
    if (tocDetails) {
      tocLinks.forEach((link) => {
        link.addEventListener('click', () => {
          window.setTimeout(() => {
            tocDetails.open = false;
          }, 120);
        });
      });
      if (window.location.hash && tocDetails.querySelector(`a[href="${window.location.hash}"]`)) {
        tocDetails.open = true;
      }
    }
  }

  /* ------------------------------ 代码复制 ------------------------------ */

  const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  };

  document.querySelectorAll('.manual-prose .manual-code').forEach((block) => {
    const code = block.querySelector('pre code');
    const head = block.querySelector('.manual-code-head');
    if (!code || !head || head.querySelector('.manual-code-copy')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'manual-code-copy';
    button.textContent = '复制';
    button.setAttribute('aria-label', '复制这段代码');

    let resetTimer = 0;
    button.addEventListener('click', async () => {
      try {
        await copyText(code.textContent.replace(/\n$/, ''));
        button.textContent = '已复制';
        button.classList.add('is-done');
      } catch (error) {
        button.textContent = '复制失败';
      }
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        button.textContent = '复制';
        button.classList.remove('is-done');
      }, 1800);
    });

    head.appendChild(button);
  });

  /* ---------------------------- 检查清单持久化 ---------------------------- */

  document.querySelectorAll('[data-manual-checklist]').forEach((box, boxIndex) => {
    const inputs = Array.from(box.querySelectorAll('input[type="checkbox"]'));
    if (!inputs.length) return;

    const storageKey = `manual-checklist:${window.location.pathname}:${
      box.dataset.manualChecklist || boxIndex
    }`;
    const count = box.querySelector('[data-manual-checklist-count]');
    const reset = box.querySelector('[data-manual-checklist-reset]');
    let saved = {};

    try {
      saved = JSON.parse(window.localStorage.getItem(storageKey) || '{}') || {};
    } catch (error) {
      saved = {};
    }

    const sync = () => {
      const done = inputs.filter((input) => input.checked).length;
      if (count) count.textContent = `${done} / ${inputs.length} 已勾选`;
    };

    const persist = () => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(saved));
      } catch (error) {
        /* 隐私模式或存储已满时，勾选只在本次页面有效 */
      }
    };

    inputs.forEach((input) => {
      input.checked = Boolean(saved[input.value]);
      input.addEventListener('change', () => {
        if (input.checked) saved[input.value] = 1;
        else delete saved[input.value];
        persist();
        sync();
      });
    });

    if (reset) {
      reset.hidden = false;
      reset.addEventListener('click', () => {
        saved = {};
        inputs.forEach((input) => {
          input.checked = false;
        });
        try {
          window.localStorage.removeItem(storageKey);
        } catch (error) {
          /* 忽略存储异常，界面仍然清空 */
        }
        sync();
      });
    }

    sync();
  });

})();
