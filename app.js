const stickerGrid = document.querySelector('#sticker-grid');
const stickerCount = document.querySelector('#sticker-count');
const lightbox = document.querySelector('#lightbox');
const lightboxImage = document.querySelector('#lightbox-image');
const lightboxMediaShell = document.querySelector('.lightbox-media-shell');
const copyButton = document.querySelector('#copy-button');
const downloadButton = document.querySelector('#download-button');
const actionStatus = document.querySelector('#action-status');
const mascot = document.querySelector('#mascot');
const mascotBubble = document.querySelector('#mascot-bubble');
const mascotAudio = document.querySelector('#mascot-audio');

let activeSticker = null;
let activeBlobPromise = null;

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
    // rootMargin 提前约 640px 触发入场动画:元素还在视口外时动画就已开始,
    // 滚到时不再有"卡半拍才开始动"的感觉。
    { rootMargin: '640px 0px', threshold: 0.05 },
  );
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

function createStickerCard(sticker, index) {
  const card = document.createElement('button');
  card.className = 'sticker-card';
  card.type = 'button';
  card.style.setProperty('--tilt', `${index % 2 === 0 ? 0.4 : -0.4}deg`);
  card.style.setProperty('--sticker-delay', `${Math.min(index, 16) * 58}ms`);
  card.setAttribute('aria-label', '打开表情预览');

  const inner = document.createElement('span');
  inner.className = 'sticker-card-inner';

  const source = sticker.preview || sticker.original;
  const image = document.createElement('img');
  image.src = source;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  // 预先声明宽高让浏览器在加载前就按正确宽高比占位,图片到达后高度不再变化,
  // CSS columns 也就不会在每次加载时重新平衡列导致整墙抖动。
  if (sticker.width > 0 && sticker.height > 0) {
    image.width = sticker.width;
    image.height = sticker.height;
  }
  let triedOriginal = false;
  image.onerror = () => {
    if (sticker.preview && !triedOriginal) {
      triedOriginal = true;
      image.src = sticker.original;
      return;
    }
    card.remove();
  };

  inner.appendChild(image);
  card.appendChild(inner);

  if (/\.(gif|apng)$/i.test(sticker.original)) {
    card.classList.add('is-animated');
  }

  card.addEventListener('click', () => openLightbox(sticker));
  return card;
}

function renderStickers(stickers) {
  stickerGrid.replaceChildren();
  const uniqueStickers = [
    ...new Map(
      stickers
        .filter((sticker) => sticker && sticker.original)
        .map((sticker) => [sticker.original, sticker]),
    ).values(),
  ];
  if (!uniqueStickers.length) {
    if (stickerCount) stickerCount.hidden = true;
    return;
  }

  if (stickerCount) {
    stickerCount.textContent = `已收录 ${uniqueStickers.length} 枚`;
    stickerCount.hidden = false;
  }

  const fragment = document.createDocumentFragment();
  uniqueStickers.forEach((sticker, index) => {
    fragment.appendChild(createStickerCard(sticker, index));
  });
  stickerGrid.appendChild(fragment);
}

function openLightbox(sticker) {
  activeSticker = sticker;
  const animated = /\.(gif|apng)$/i.test(sticker.original);
  // 静态图显示 WebP 大图层(几十~一两百 KB),动画图才加载原文件;
  // 下载/复制仍指向原图,这里只优化「看」,不改变「取」。
  lightboxImage.src = animated
    ? sticker.original
    : sticker.large || sticker.preview || sticker.original;
  lightboxImage.alt = sticker.alt || '表情包大图预览';
  downloadButton.href = sticker.original;
  downloadButton.download = sticker.filename || 'sticker';
  // 打开预览时预取原图,用户点「复制」时无需再次等待下载,
  // 避免大图 fetch 太久超出浏览器用户激活窗口导致剪贴板写入失败。
  activeBlobPromise = fetch(sticker.original)
    .then((response) => response.blob())
    .catch(() => null);
  actionStatus.textContent = '';
  lightboxMediaShell.classList.toggle('is-animated', animated);
  lightbox.classList.add('is-open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  copyButton.focus();
}

function closeLightbox() {
  lightbox.classList.remove('is-open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  window.setTimeout(() => {
    if (!lightbox.classList.contains('is-open')) {
      lightboxImage.removeAttribute('src');
    }
  }, 650);
}

async function copyImage() {
  if (!activeSticker) return;

  if (!navigator.clipboard || !window.ClipboardItem) {
    actionStatus.textContent = '当前浏览器不支持复制图片，请下载原图';
    return;
  }

  copyButton.disabled = true;
  actionStatus.textContent = '正在准备图片…';

  try {
    const blob = activeBlobPromise ? await activeBlobPromise : null;
    if (!blob) throw new Error('image unavailable');
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type || 'image/png']: blob }),
    ]);
    actionStatus.textContent = '图片已复制';
  } catch (error) {
    actionStatus.textContent = '复制失败，请下载原图';
  } finally {
    copyButton.disabled = false;
  }
}

copyButton.addEventListener('click', copyImage);
document.querySelectorAll('[data-close-lightbox]').forEach((element) => {
  element.addEventListener('click', closeLightbox);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && lightbox.classList.contains('is-open')) {
    closeLightbox();
  }
});

function initMascot() {
  if (!mascot) return;
  if (mascotAudio) mascotAudio.volume = 0.42;

  const holdDelay = 420;
  const dragThreshold = 7;
  const clickComboWindow = 620;
  const shortAudioCooldown = 120;
  const storageKey = 'deepseek-mascot-position';
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let hasDragged = false;
  let holdTimer = null;
  let audioStopTimer = null;
  let bopResetTimer = null;
  let comboResetTimer = null;
  let completedHold = false;
  let comboCount = 0;
  let lastClickAt = 0;
  let lastShortAudioAt = 0;

  function clampPosition(x, y) {
    const rect = mascot.getBoundingClientRect();
    const padding = 10;
    return {
      x: Math.min(Math.max(padding, x), window.innerWidth - rect.width - padding),
      y: Math.min(Math.max(padding, y), window.innerHeight - rect.height - padding),
    };
  }

  function setPosition(x, y, persist = false) {
    const position = clampPosition(x, y);
    mascot.style.left = `${position.x}px`;
    mascot.style.top = `${position.y}px`;
    mascot.style.right = 'auto';
    mascot.style.bottom = 'auto';
    if (persist) {
      localStorage.setItem(storageKey, JSON.stringify(position));
    }
  }

  function restorePosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        setPosition(saved.x, saved.y);
      }
    } catch (error) {
      localStorage.removeItem(storageKey);
    }
  }

  function clearHoldTimer() {
    window.clearTimeout(holdTimer);
    holdTimer = null;
  }

  function clearBopTimer() {
    window.clearTimeout(bopResetTimer);
    bopResetTimer = null;
  }

  function playMascotAudio({ full = false } = {}) {
    if (!mascotAudio) return;
    const now = performance.now();
    if (!full && now - lastShortAudioAt < shortAudioCooldown) return;
    window.clearTimeout(audioStopTimer);
    mascotAudio.pause();
    mascotAudio.currentTime = 0;
    mascotAudio.play().catch(() => {});
    if (full) {
      lastShortAudioAt = 0;
      return;
    }
    lastShortAudioAt = now;
    audioStopTimer = window.setTimeout(() => {
      mascotAudio.pause();
      mascotAudio.currentTime = 0;
    }, 320);
  }

  function updateCombo(fullAudio) {
    const now = performance.now();
    comboCount = fullAudio || now - lastClickAt > clickComboWindow
      ? 1
      : Math.min(comboCount + 1, 9);
    lastClickAt = now;
    window.clearTimeout(comboResetTimer);
    comboResetTimer = window.setTimeout(() => {
      comboCount = 0;
    }, clickComboWindow);
    return comboCount;
  }

  function bopMascot({ fullAudio = false } = {}) {
    const combo = updateCombo(fullAudio);
    const isCombo = !fullAudio && combo >= 2;
    mascot.classList.remove('is-bopping', 'is-combo-bopping');
    void mascot.offsetWidth;
    mascot.classList.add(isCombo ? 'is-combo-bopping' : 'is-bopping', 'is-talking');
    mascotBubble.textContent = fullAudio
      ? '听完嘛'
      : isCombo
        ? `再戳×${combo}`
        : '嘻';
    playMascotAudio({ full: fullAudio });
    clearBopTimer();
    bopResetTimer = window.setTimeout(() => {
      mascot.classList.remove('is-bopping', 'is-combo-bopping', 'is-talking');
      mascotBubble.textContent = '戳我';
    }, isCombo ? 480 : 740);
  }

  function startPress(event) {
    if (pointerId !== null) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    const rect = mascot.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    hasDragged = false;
    completedHold = false;
    mascot.setPointerCapture(pointerId);
    clearBopTimer();
    mascot.classList.remove('is-bopping', 'is-combo-bopping', 'is-talking');
    mascot.classList.add('is-pressed');
    mascotBubble.textContent = '别捏';
    clearHoldTimer();
    holdTimer = window.setTimeout(() => {
      if (!hasDragged) {
        completedHold = true;
        mascot.classList.add('is-holding');
        mascotBubble.textContent = '咕噜咕噜';
      }
    }, holdDelay);
  }

  function movePress(event) {
    if (event.pointerId !== pointerId) return;
    const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (distance > dragThreshold) {
      hasDragged = true;
      clearHoldTimer();
      mascot.classList.add('is-dragging');
      mascot.classList.remove('is-holding', 'is-bopping', 'is-combo-bopping', 'is-talking');
      mascotBubble.textContent = '搬家中';
    }
    if (hasDragged) {
      setPosition(event.clientX - offsetX, event.clientY - offsetY);
    }
  }

  function endPress(event) {
    if (event.pointerId !== pointerId) return;
    clearHoldTimer();
    mascot.releasePointerCapture(pointerId);
    pointerId = null;
    mascot.classList.remove('is-pressed', 'is-holding', 'is-dragging');
    if (hasDragged) {
      const rect = mascot.getBoundingClientRect();
      setPosition(rect.left, rect.top, true);
      mascotBubble.textContent = '放好啦';
      window.setTimeout(() => {
        mascotBubble.textContent = '戳我';
      }, 700);
      return;
    }
    bopMascot({ fullAudio: completedHold });
  }

  restorePosition();
  mascot.addEventListener('pointerdown', startPress);
  mascot.addEventListener('pointermove', movePress);
  mascot.addEventListener('pointerup', endPress);
  mascot.addEventListener('pointercancel', endPress);
  mascot.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      bopMascot();
    }
  });
  window.addEventListener('resize', () => {
    const rect = mascot.getBoundingClientRect();
    setPosition(rect.left, rect.top, true);
  });
}

async function loadStickers() {
  try {
    const response = await fetch('stickers/manifest.json');
    if (!response.ok) throw new Error('manifest unavailable');
    const stickers = await response.json();
    renderStickers(stickers);
  } catch (error) {
    renderStickers([]);
  }
}

initMascot();
loadStickers();
