// 角色立绘页：入场动画、吸顶导航，以及一个比首页灯箱更轻的立绘查看器。
// 页面结构全部写在 HTML 里，没有 JS 时卡片仍然能直接打开大图、下载高清图。
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

function initNavScroll() {
  if (!siteNav) return;
  const sync = () => siteNav.classList.toggle('is-scrolled', window.scrollY > 26);
  sync();
  window.addEventListener('scroll', sync, { passive: true });
}

initNavScroll();

// 二维码弹窗平时是隐藏的，但整屏 fixed 容器会让懒加载图片照样进首屏队列。
// 第一次点「加入群聊」时再补 src，省掉一次约 90KB 的图片请求。
let qrHydrated = false;
function hydrateQrImage() {
  if (qrHydrated) return;
  qrHydrated = true;
  document.querySelectorAll('#qr-modal source[data-srcset]').forEach((source) => {
    source.srcset = source.dataset.srcset;
  });
  document.querySelectorAll('#qr-modal img[data-src]').forEach((image) => {
    image.src = image.dataset.src;
  });
}
document.querySelectorAll('[data-open-qr]').forEach((button) => {
  button.addEventListener('click', hydrateQrImage, { once: true });
});

const cards = [...document.querySelectorAll('.character-card')];
const artNodes = cards.map((card) => ({
  card,
  full: card.querySelector('[data-art][data-variant="full"]'),
  chibi: card.querySelector('[data-art][data-variant="chibi"]'),
}));

const viewer = document.getElementById('character-viewer');
const viewerPanel = viewer?.querySelector('.character-viewer-panel');
const viewerImage = document.getElementById('viewer-image');
const viewerTitle = document.getElementById('viewer-title');
const viewerKicker = document.getElementById('viewer-kicker');
const viewerTags = document.getElementById('viewer-tags');
const viewerMeta = document.getElementById('viewer-meta');
const viewerStatus = document.getElementById('viewer-status');
const viewerCopy = document.getElementById('viewer-copy');
const viewerCopyLabel = document.getElementById('viewer-copy-label');
const viewerDownload = document.getElementById('viewer-download');
const viewerPrev = document.getElementById('viewer-prev');
const viewerNext = document.getElementById('viewer-next');
const viewerVariantButtons = [...document.querySelectorAll('[data-viewer-variant]')];
const viewerClosers = [...document.querySelectorAll('[data-close-viewer]')];
const viewerFirstFocus = viewerPanel?.querySelector('.viewer-close');

if (viewer && cards.length) {
  let activeIndex = 0;
  let activeVariant = 'full';
  let isOpen = false;
  let returnFocus = null;
  let imageRequest = 0;
  let copyRequest = 0;
  let pendingHighRes = null;
  const prefetched = new Set();

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function artFor(index, variant) {
    return artNodes[index]?.[variant] || artNodes[index]?.full || null;
  }

  function setHash() {
    const card = cards[activeIndex];
    if (!card) return;
    history.replaceState(null, '', `#${card.id}-${activeVariant}`);
  }

  function clearHash() {
    history.replaceState(null, '', location.pathname + location.search);
  }

  function prefetch(art) {
    if (!art || prefetched.has(art.dataset.view)) return;
    prefetched.add(art.dataset.view);
    const image = new Image();
    image.decoding = 'async';
    image.src = art.dataset.view;
  }

  // 只预取下一个角色：翻页的大多数操作是往后看，少下一张就少一份流量。
  function prefetchNeighbour() {
    if (cards.length < 2) return;
    const run = () => prefetch(artFor((activeIndex + 1) % cards.length, activeVariant));
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 1600 });
    } else {
      window.setTimeout(run, 600);
    }
  }

  function cancelHighRes() {
    imageRequest += 1;
    if (pendingHighRes) {
      pendingHighRes.onload = null;
      pendingHighRes.onerror = null;
      pendingHighRes = null;
    }
  }

  function applyArtImage(art) {
    const token = ++imageRequest;
    const info = art.dataset;
    // 全身卡片用 srcset 选过档，直接用当前已解码的那张做占位；Q 版角标
    // 太小，仍用 640 档，弹窗里不会先糊一下。
    const displayed = art.querySelector('img')?.currentSrc;
    const placeholder = (info.variant === 'full' && displayed) || info.card;
    const source = info.view;

    viewerImage.classList.remove('is-ready');
    viewerImage.alt = info.alt || '';
    viewerStatus.textContent = '正在加载大图…';

    viewerImage.onload = () => {
      if (token !== imageRequest) return;
      viewerImage.classList.add('is-ready');
    };
    viewerImage.onerror = () => {
      if (token !== imageRequest) return;
      viewerStatus.textContent = '图片加载失败，可以直接下载高清图';
    };
    viewerImage.src = placeholder;
    if (viewerImage.complete && viewerImage.naturalWidth > 0) {
      viewerImage.classList.add('is-ready');
    }

    const highRes = new Image();
    pendingHighRes = highRes;
    highRes.decoding = 'async';
    highRes.fetchPriority = 'high';
    highRes.onload = async () => {
      if (token !== imageRequest) return;
      if (highRes.decode) {
        try {
          await highRes.decode();
        } catch (_) {
          // 已经 load 成功，解码失败时让浏览器自己决定怎么显示
        }
      }
      if (token !== imageRequest) return;
      pendingHighRes = null;
      viewerImage.src = source;
      viewerImage.classList.add('is-ready');
      if (viewerStatus.textContent === '正在加载大图…') viewerStatus.textContent = '';
    };
    highRes.onerror = () => {
      if (token !== imageRequest) return;
      pendingHighRes = null;
      viewerImage.classList.add('is-ready');
      viewerStatus.textContent = '大图加载失败，可以直接下载高清图';
    };
    highRes.src = source;
  }

  function showCharacter(index, variant, { updateHash = true } = {}) {
    const card = cards[index];
    const art = artFor(index, variant);
    if (!card || !art) return;

    activeIndex = index;
    activeVariant = variant;
    imageRequest += 1;
    copyRequest += 1;
    viewerCopy.disabled = false;
    viewerCopy.classList.remove('is-copied');
    viewerCopyLabel.textContent = '复制图片';
    viewerStatus.textContent = '';

    const tags = [...card.querySelectorAll('.character-tags span')].map((tag) => tag.textContent.trim()).filter(Boolean);
    const number = card.querySelector('.character-no')?.textContent.trim() || '';
    viewerKicker.textContent = `${number} · ${card.dataset.model.toUpperCase()}`;
    viewerTitle.textContent = card.dataset.name;
    viewerTags.replaceChildren(
      ...tags.map((tag) => {
        const chip = document.createElement('span');
        chip.textContent = tag;
        return chip;
      }),
    );

    const width = Number(art.dataset.width);
    const height = Number(art.dataset.height);
    const size = Number.isFinite(width) && Number.isFinite(height) ? `${width} × ${height}` : '';
    viewerMeta.textContent = [variant === 'chibi' ? 'Q 版' : '全身', size && `原图 ${size}`, 'WebP']
      .filter(Boolean)
      .join(' · ');

    viewerVariantButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.viewerVariant === variant));
    });

    viewerDownload.href = art.dataset.download;
    viewerDownload.download = art.dataset.downloadName || '';
    viewerDownload.setAttribute('aria-label', `下载${card.dataset.name} ${variant === 'chibi' ? 'Q 版' : '全身'}立绘`);

    applyArtImage(art);
    if (updateHash) setHash();
    prefetchNeighbour();
  }

  function openViewer(index, variant, trigger) {
    returnFocus = trigger || document.activeElement;
    if (!isOpen) {
      isOpen = true;
      viewer.classList.add('is-open');
      viewer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    }
    showCharacter(index, variant);
    if (prefersReducedMotion.matches) {
      viewerFirstFocus?.focus({ preventScroll: true });
    } else {
      window.setTimeout(() => viewerFirstFocus?.focus({ preventScroll: true }), 60);
    }
  }

  function closeViewer() {
    if (!isOpen) return;
    isOpen = false;
    cancelHighRes();
    copyRequest += 1;
    viewerImage.onload = null;
    viewerImage.onerror = null;
    viewer.classList.remove('is-open');
    viewer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    clearHash();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    window.setTimeout(() => {
      if (!isOpen) {
        viewerImage.removeAttribute('src');
        viewerImage.classList.remove('is-ready');
      }
    }, 420);
  }

  function stepCharacter(step) {
    if (cards.length < 2) return;
    showCharacter((activeIndex + step + cards.length) % cards.length, activeVariant);
  }

  function setVariant(variant) {
    if (variant === activeVariant) return;
    showCharacter(activeIndex, variant);
  }

  function focusableInViewer() {
    return [...viewerPanel.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')].filter(
      (element) => !element.disabled && element.offsetParent !== null,
    );
  }

  // 点卡片或 Q 版小图：普通左键交给弹窗；按住 Ctrl/Cmd 时保留浏览器默认行为，
  // 让需要原图的人可以在新标签页直接打开。
  artNodes.forEach((entry, index) => {
    ['full', 'chibi'].forEach((variant) => {
      const link = entry[variant];
      if (!link) return;
      link.addEventListener('click', (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openViewer(index, variant, link);
      });
      link.addEventListener('pointerenter', () => prefetch(link), { passive: true });
      link.addEventListener('focus', () => prefetch(link));
    });
  });

  viewerVariantButtons.forEach((button) => {
    button.addEventListener('click', () => setVariant(button.dataset.viewerVariant));
  });

  viewerPrev?.addEventListener('click', () => stepCharacter(-1));
  viewerNext?.addEventListener('click', () => stepCharacter(1));
  viewerClosers.forEach((element) => element.addEventListener('click', closeViewer));

  document.addEventListener('keydown', (event) => {
    if (!isOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeViewer();
      return;
    }
    // 焦点在“全身/Q 版”切换组里时，左右键用来在版本之间移动，不抢去翻角色。
    if (event.target.closest?.('.viewer-tabs') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const nextVariant = activeVariant === 'full' ? 'chibi' : 'full';
      setVariant(nextVariant);
      viewerVariantButtons
        .find((button) => button.dataset.viewerVariant === nextVariant)
        ?.focus();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepCharacter(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepCharacter(1);
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = focusableInViewer();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  // 打开带角色锚点的分享链接：#deepseek-full / #kimi-chibi
  const match = location.hash.match(/^#([a-z0-9-]+)-(full|chibi)$/i);
  if (match) {
    const index = cards.findIndex((card) => card.id === match[1].toLowerCase());
    if (index >= 0) {
      openViewer(index, match[2].toLowerCase(), artNodes[index][match[2].toLowerCase()]);
    }
  }

  // 复制图片：和首页灯箱一样，把异步转码塞进 ClipboardItem 的 promise 里，
  // 这样 write() 仍在点击的用户激活任务内被调用，大图不会因为 await 而失效。
  async function copyImage() {
    const art = artFor(activeIndex, activeVariant);
    if (!art) return;

    if (!navigator.clipboard || !window.ClipboardItem) {
      viewerStatus.textContent = '当前浏览器不支持复制图片，请下载高清图';
      return;
    }

    const token = ++copyRequest;
    viewerCopy.disabled = true;
    viewerCopy.classList.remove('is-copied');
    viewerCopyLabel.textContent = '复制中…';
    viewerStatus.textContent = '正在准备图片…';

    try {
      const pngBlobPromise = (async () => {
        const response = await fetch(art.dataset.view);
        if (!response.ok) throw new Error(`view unavailable: ${response.status}`);
        const blob = await response.blob();
        const image = await loadImageFromBlob(blob);
        return imageToPngBlob(image);
      })();

      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlobPromise })]);
      if (token !== copyRequest) return;
      viewerCopyLabel.textContent = '已复制';
      viewerCopy.classList.add('is-copied');
      viewerStatus.textContent = '图片已复制';
    } catch (error) {
      if (token !== copyRequest) return;
      viewerCopyLabel.textContent = '重新复制';
      viewerStatus.textContent = '复制失败，请重试或下载高清图';
    } finally {
      if (token === copyRequest) viewerCopy.disabled = false;
    }
  }

  viewerCopy?.addEventListener('click', copyImage);
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image decode failed'));
    };
    image.src = url;
  });
}

function imageToPngBlob(image) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('canvas unavailable'));
      return;
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('png encode failed'));
    }, 'image/png');
  });
}
