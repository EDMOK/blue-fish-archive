const stickerGrid = document.querySelector('#sticker-grid');
const stickerCount = document.querySelector('#sticker-count');
const wallEmpty = document.querySelector('#wall-empty');
const wallRetry = document.querySelector('#wall-retry');
const siteNav = document.querySelector('.site-nav');
const lightbox = document.querySelector('#lightbox');
const lightboxImage = document.querySelector('#lightbox-image');
const lightboxMediaShell = document.querySelector('.lightbox-media-shell');
const lightboxMeta = document.querySelector('#lightbox-meta');
const lightboxPrev = document.querySelector('#lightbox-prev');
const lightboxNext = document.querySelector('#lightbox-next');
const lightboxPosition = document.querySelector('#lightbox-position');
const copyLabel = document.querySelector('#copy-label');
const copyButton = document.querySelector('#copy-button');
const downloadButton = document.querySelector('#download-button');
const actionStatus = document.querySelector('#action-status');
const mascot = document.querySelector('#mascot');
const mascotBubble = document.querySelector('#mascot-bubble');
const mascotAudio = document.querySelector('#mascot-audio');
const tagFilter = document.querySelector('#tag-filter');
const tagFilterList = document.querySelector('#tag-filter-list');
const filterEmpty = document.querySelector('#filter-empty');
const lightboxAlt = document.querySelector('#lightbox-alt');
const lightboxTags = document.querySelector('#lightbox-tags');

const isAnimatedSticker = (sticker) => /\.(gif|apng)$/i.test(sticker.original);

// 防御坏数据:tags 不是有效字符串数组时忽略,避免整面墙出错
const stickerTags = (sticker) =>
  Array.isArray(sticker.tags)
    ? sticker.tags.filter((tag) => typeof tag === 'string' && tag.trim())
    : [];

// 未标注图片的通用 alt,不值得重复展示
const GENERIC_ALT = '鲸鱼娘同人表情包';
const specificAlt = (sticker) => {
  const alt = typeof sticker.alt === 'string' ? sticker.alt.trim() : '';
  return alt && alt !== GENERIC_ALT ? alt : '';
};

let stickerList = [];
// 灯箱只看当前筛选结果,翻页不会跳出标签
let lightboxList = [];
let stickerCards = [];
let tagButtons = [];
let activeTag = '';
let activeIndex = -1;
let activeSticker = null;
let lightboxRequestId = 0;
let pendingLightboxImage = null;
let copyRequestId = 0;
let lightboxReturnFocus = null;
let previousBodyOverflow = '';

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
  card.style.setProperty('--sticker-delay', `${Math.min(index, 8) * 24}ms`);
  const labelParts = [`打开第 ${index + 1} 张表情预览`];
  const alt = specificAlt(sticker);
  if (alt) labelParts.push(alt);
  if (sticker.selfMade) labelParts.push('站长自作');
  card.setAttribute('aria-label', labelParts.join('，'));

  const inner = document.createElement('span');
  inner.className = 'sticker-card-inner';

  const source = sticker.preview || sticker.original;
  const image = document.createElement('img');
  image.src = source;
  // 卡片本身是带 aria-label 的按钮,读屏名以按钮为准,这里的 alt 主要供图片搜索索引。
  image.alt = sticker.alt || '';
  image.loading = index < 6 ? 'eager' : 'lazy';
  image.fetchPriority = index < 2 ? 'high' : 'low';
  image.decoding = 'async';
  image.setAttribute('fetchpriority', image.fetchPriority);
  // 预先声明宽高让浏览器在加载前就按正确宽高比占位,图片到达后高度不再变化,
  // CSS columns 也就不会在每次加载时重新平衡列导致整墙抖动。
  if (sticker.width > 0 && sticker.height > 0) {
    image.width = sticker.width;
    image.height = sticker.height;
  }
  let triedOriginal = false;
  image.onload = () => card.classList.add('is-loaded');
  image.onerror = () => {
    if (sticker.preview && !triedOriginal) {
      triedOriginal = true;
      image.src = sticker.original;
      return;
    }
    card.remove();
  };
  // 命中缓存时 load 事件可能早于监听注册,补一次判断
  if (image.complete && image.naturalWidth > 0) {
    card.classList.add('is-loaded');
  }

  inner.appendChild(image);
  card.appendChild(inner);

  const tags = stickerTags(sticker);
  if (tags.length) {
    const tagRow = document.createElement('span');
    tagRow.className = 'sticker-tags';
    // 卡片本身是按钮,标签只做视觉提示,读屏信息已经在 aria-label 里
    tagRow.setAttribute('aria-hidden', 'true');
    tags.slice(0, 3).forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'sticker-tag';
      chip.textContent = tag;
      tagRow.appendChild(chip);
    });
    card.appendChild(tagRow);
  }

  if (isAnimatedSticker(sticker)) {
    card.classList.add('is-animated');
  }

  if (sticker.selfMade) {
    const badge = document.createElement('span');
    badge.className = 'sticker-badge';
    badge.textContent = '自作';
    // 徽章只是视觉提示,读屏信息已经在卡的 aria-label 里
    badge.setAttribute('aria-hidden', 'true');
    card.appendChild(badge);
  }

  card.addEventListener('click', () => openLightbox(index));
  return card;
}

// 数字从上往下滚到总数,比直接蹦出一个数字更像"清点完毕"
function animateStickerCount(total) {
  if (!stickerCount) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || total < 2) {
    stickerCount.textContent = `已收录 ${total} 枚`;
    return;
  }
  const duration = 900;
  const startTime = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - (1 - progress) ** 3;
    stickerCount.textContent = `已收录 ${Math.round(total * eased)} 枚`;
    if (progress < 1) window.requestAnimationFrame(tick);
  };
  stickerCount.textContent = '已收录 0 枚';
  window.requestAnimationFrame(tick);
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
  stickerList = uniqueStickers;
  lightboxList = uniqueStickers;
  const isEmpty = !uniqueStickers.length;

  if (wallEmpty) wallEmpty.hidden = !isEmpty;
  if (stickerCount) stickerCount.hidden = isEmpty;
  if (isEmpty) {
    stickerCards = [];
    renderTagFilter();
    return;
  }

  const fragment = document.createDocumentFragment();
  stickerCards = [];
  uniqueStickers.forEach((sticker, index) => {
    const card = createStickerCard(sticker, index);
    stickerCards.push(card);
    fragment.appendChild(card);
  });
  stickerGrid.appendChild(fragment);

  renderTagFilter();
  if (activeTag) {
    applyTagFilter();
  } else if (stickerCount) {
    animateStickerCount(uniqueStickers.length);
  }
}

function renderTagFilter() {
  if (!tagFilter || !tagFilterList) return;
  const counts = new Map();
  stickerList.forEach((sticker) => {
    stickerTags(sticker).forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });

  if (!counts.size) {
    activeTag = '';
    tagFilter.hidden = true;
    tagFilterList.replaceChildren();
    tagButtons = [];
    if (filterEmpty) filterEmpty.hidden = true;
    return;
  }
  // 重新加载后旧标签可能已经不存在,静默回到「全部」
  if (activeTag && !counts.has(activeTag)) activeTag = '';
  tagFilter.hidden = false;

  const entries = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'),
  );
  const fragment = document.createDocumentFragment();
  tagButtons = [];
  addTagChip(fragment, '', '全部', stickerList.length);
  entries.forEach(([tag, count]) => addTagChip(fragment, tag, tag, count));
  tagFilterList.replaceChildren(fragment);
  syncTagFilterState();
}

function addTagChip(fragment, value, label, count) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tag-chip';
  button.dataset.tag = value;
  button.setAttribute('aria-pressed', 'false');
  button.setAttribute(
    'aria-label',
    value ? `筛选标签 ${label}，${count} 张` : `显示全部，${count} 张`,
  );
  button.appendChild(document.createTextNode(label));
  const badge = document.createElement('span');
  badge.className = 'tag-chip-count';
  badge.textContent = String(count);
  badge.setAttribute('aria-hidden', 'true');
  button.appendChild(badge);
  button.addEventListener('click', () => setActiveTag(value));
  tagButtons.push(button);
  fragment.appendChild(button);
}

function syncTagFilterState() {
  tagButtons.forEach((button) => {
    const isActive = (button.dataset.tag || '') === activeTag;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function setActiveTag(tag) {
  activeTag = typeof tag === 'string' ? tag : '';
  syncTagFilterState();
  applyTagFilter();
}

function applyTagFilter() {
  const total = stickerList.length;
  let visible = 0;
  lightboxList = [];
  stickerCards.forEach((card, index) => {
    const sticker = stickerList[index];
    const matches = !activeTag || stickerTags(sticker).includes(activeTag);
    card.hidden = !matches;
    if (matches) {
      visible += 1;
      lightboxList.push(sticker);
    }
  });
  if (filterEmpty) filterEmpty.hidden = !(activeTag && visible === 0);
  if (stickerCount) {
    stickerCount.textContent = activeTag ? `${visible} / ${total} 枚` : `已收录 ${total} 枚`;
  }
}

function openLightbox(index) {
  lightboxReturnFocus = document.activeElement;
  previousBodyOverflow = document.body.style.overflow;
  const position = lightboxList.indexOf(stickerList[index]);
  showSticker(position >= 0 ? position : 0);
  lightbox.classList.add('is-open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  document.body.classList.add('is-previewing');
  copyButton.focus();
}

function cancelLightboxLoad() {
  lightboxRequestId += 1;
  if (pendingLightboxImage) {
    pendingLightboxImage.onload = null;
    pendingLightboxImage.onerror = null;
    pendingLightboxImage.removeAttribute('src');
    pendingLightboxImage = null;
  }
}

function showSticker(index) {
  const sticker = lightboxList[index];
  if (!sticker) return;
  activeIndex = index;
  activeSticker = sticker;
  copyRequestId += 1;
  copyButton.disabled = false;
  copyButton.classList.remove('is-copied');
  copyLabel.textContent = '复制图片';
  const animated = isAnimatedSticker(sticker);
  cancelLightboxLoad();
  const requestId = lightboxRequestId;
  const source = animated
    ? sticker.original
    : sticker.large || sticker.preview || sticker.original;
  // 复用墙上已缓存的缩略图，大图就绪前不让弹窗空白。
  const preview = sticker.preview || source;
  lightboxImage.classList.remove('is-ready');
  lightboxImage.alt = sticker.alt || '表情包大图预览';
  actionStatus.textContent = '正在加载图片…';
  lightboxImage.onload = () => {
    if (requestId !== lightboxRequestId) return;
    lightboxImage.classList.add('is-ready');
    if (lightboxImage.getAttribute('src') === source && actionStatus.textContent === '正在加载图片…') actionStatus.textContent = '';
  };
  lightboxImage.onerror = () => {
    if (requestId !== lightboxRequestId) return;
    actionStatus.textContent = '图片加载失败，请重新打开或下载原图';
  };
  lightboxImage.src = preview;
  if (lightboxImage.complete && lightboxImage.naturalWidth > 0) lightboxImage.onload();

  if (source !== preview) {
    const image = new Image();
    pendingLightboxImage = image;
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.onload = async () => {
      // 静态图解码期间保留缩略图；动画不等待完整解码。
      if (!animated && image.decode) {
        try { await image.decode(); } catch (_) { /* load 已成功，允许浏览器直接显示 */ }
      }
      if (requestId !== lightboxRequestId) return;
      pendingLightboxImage = null;
      lightboxImage.src = source;
      lightboxImage.classList.add('is-ready');
      if (actionStatus.textContent === '正在加载图片…') actionStatus.textContent = '';
    };
    image.onerror = () => {
      if (requestId !== lightboxRequestId) return;
      pendingLightboxImage = null;
      actionStatus.textContent = lightboxImage.complete && lightboxImage.naturalWidth > 0
        ? '大图加载失败，暂时显示缩略图；可重新打开重试'
        : '图片加载失败，请重新打开或下载原图';
    };
    image.src = source;
  }
  downloadButton.href = sticker.original;
  downloadButton.download = sticker.filename || 'sticker';
  lightboxMediaShell.classList.toggle('is-animated', animated);
  lightboxMediaShell.classList.toggle('is-self-made', Boolean(sticker.selfMade));
  updateLightboxMeta(sticker, index);
  updateLightboxDetails(sticker);
  const hasNeighbours = lightboxList.length > 1;
  if (lightboxPrev) lightboxPrev.hidden = !hasNeighbours;
  if (lightboxNext) lightboxNext.hidden = !hasNeighbours;
}

function updateLightboxMeta(sticker, index) {
  if (!lightboxMeta) return;
  const format = (sticker.filename || sticker.original).split('.').pop().toUpperCase();
  const size = sticker.width > 0 && sticker.height > 0 ? `${sticker.width}×${sticker.height}` : '';
  lightboxPosition.textContent = `${index + 1} / ${lightboxList.length}`;
  lightboxMeta.textContent = [
    format,
    size,
  ]
    .filter(Boolean)
    .join(' · ');
}

function updateLightboxDetails(sticker) {
  const alt = specificAlt(sticker);
  if (lightboxAlt) {
    lightboxAlt.textContent = alt;
    lightboxAlt.hidden = !alt;
  }
  if (!lightboxTags) return;

  const tags = stickerTags(sticker);
  lightboxTags.replaceChildren();
  tags.forEach((tag) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'lightbox-tag';
    chip.textContent = tag;
    chip.setAttribute('aria-label', `筛选标签：${tag}`);
    chip.addEventListener('click', () => {
      closeLightbox();
      setActiveTag(tag);
      document.querySelector('#wall')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    lightboxTags.appendChild(chip);
  });
  lightboxTags.hidden = !tags.length;
}

function stepLightbox(step) {
  if (lightboxList.length < 2 || activeIndex < 0) return;
  showSticker((activeIndex + step + lightboxList.length) % lightboxList.length);
}

function closeLightbox() {
  cancelLightboxLoad();
  copyRequestId += 1;
  lightboxImage.onload = null;
  lightboxImage.onerror = null;
  lightbox.classList.remove('is-open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = previousBodyOverflow;
  document.body.classList.remove('is-previewing');
  if (lightboxReturnFocus?.isConnected) lightboxReturnFocus.focus({ preventScroll: true });
  window.setTimeout(() => {
    if (!lightbox.classList.contains('is-open')) {
      lightboxImage.removeAttribute('src');
      lightboxImage.classList.remove('is-ready');
    }
  }, 650);
}

// Chrome/Edge 的剪贴板写入只接受 image/png:webp/jpg/gif 直接写会抛
// NotAllowedError(实测 "Type image/webp not supported on write"),必须先转成 PNG。
const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  apng: 'image/apng',
};

function mimeFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || 'image/png';
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
    context.drawImage(image, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('png encode failed'));
    }, 'image/png');
  });
}

async function copyImage() {
  if (!activeSticker) return;

  if (!navigator.clipboard || !window.ClipboardItem) {
    actionStatus.textContent = '当前浏览器不支持复制图片，请下载原图';
    return;
  }

  const requestId = ++copyRequestId;
  copyButton.disabled = true;
  copyButton.classList.remove('is-copied');
  copyLabel.textContent = '复制中…';
  actionStatus.textContent = '正在准备图片…';

  try {
    const original = activeSticker.original;
    const animated = isAnimatedSticker(activeSticker);
    // 把「取原图 + 转 PNG」整个异步流程作为 Promise 传给 ClipboardItem:
    // write() 在点击的用户激活任务里同步被授权,浏览器内部等待数据就绪。
    // 实测:先 await 下载完再 write() 会因用户激活失效抛 NotAllowedError(大图必现),
    // 而 promise-based 同步调用 write() 即使 5.6MB 原图也能成功。
    const pngBlobPromise = (async () => {
      const response = await fetch(original);
      if (!response.ok) throw new Error(`original unavailable: ${response.status}`);
      const blob = await response.blob();
      // PNG 且非动画可直接复用;其余格式(webp/jpg/gif…)经 canvas 转 PNG。
      // 动画图(GIF/APNG)只能取首帧,要保留动画请用「下载原图」。
      const mime = blob.type || mimeFromFilename(original);
      if (mime === 'image/png' && !animated) {
        return blob;
      }
      const image = await loadImageFromBlob(blob);
      return imageToPngBlob(image);
    })();

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlobPromise }),
    ]);
    if (requestId !== copyRequestId) return;
    copyLabel.textContent = '已复制';
    copyButton.classList.add('is-copied');
    actionStatus.textContent = animated
      ? '已复制静态画面，保留动画请下载原图'
      : '图片已复制';
  } catch (error) {
    if (requestId !== copyRequestId) return;
    copyLabel.textContent = '重新复制';
    actionStatus.textContent = '复制失败，请重试或下载原图';
  } finally {
    if (requestId === copyRequestId) copyButton.disabled = false;
  }
}

copyButton.addEventListener('click', copyImage);
if (lightboxPrev) lightboxPrev.addEventListener('click', () => stepLightbox(-1));
if (lightboxNext) lightboxNext.addEventListener('click', () => stepLightbox(1));
document.querySelectorAll('[data-close-lightbox]').forEach((element) => {
  element.addEventListener('click', closeLightbox);
});
document.addEventListener('keydown', (event) => {
  if (!lightbox.classList.contains('is-open')) return;
  if (event.key === 'Tab') {
    const controls = [...lightbox.querySelectorAll('button, a[href]')]
      .filter((element) => !element.disabled && !element.hidden && element.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first) return;
    if (!lightbox.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  } else if (event.key === 'Escape') {
    closeLightbox();
  } else if (event.key === 'ArrowLeft') {
    stepLightbox(-1);
  } else if (event.key === 'ArrowRight') {
    stepLightbox(1);
  }
});

// 滚过首屏后导航浮起成白色贴纸条
function initNavScroll() {
  if (!siteNav) return;
  const sync = () => siteNav.classList.toggle('is-scrolled', window.scrollY > 26);
  sync();
  window.addEventListener('scroll', sync, { passive: true });
}

function initMascot() {
  if (!mascot) return;
  if (mascotAudio) mascotAudio.volume = 0.42;

  const holdDelay = 420;
  const dragThreshold = 7;
  const clickComboWindow = 620;
  const shortAudioCooldown = 120;
  const storageKey = 'deepseek-mascot-position';
  const preferenceKey = 'deepseek-mascot-preferences';
  const tools = document.querySelector('#mascot-tools');
  const muteButton = document.querySelector('#mascot-mute');
  const hideButton = document.querySelector('#mascot-hide');
  const restoreButton = document.querySelector('#mascot-restore');
  let preferences = { muted: false, collapsed: false };
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey));
    if (saved) preferences = { muted: saved.muted === true, collapsed: saved.collapsed === true };
  } catch (_) { /* 偏好无法读取时仍可正常互动 */ }

  function savePreferences() {
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch (_) { /* 当前会话仍生效 */ }
  }

  function syncPreferences() {
    mascot.hidden = preferences.collapsed;
    tools.hidden = preferences.collapsed;
    restoreButton.hidden = !preferences.collapsed;
    hideButton.setAttribute('aria-expanded', String(!preferences.collapsed));
    if (mascotAudio) mascotAudio.muted = preferences.muted;
    muteButton.setAttribute('aria-pressed', String(preferences.muted));
    muteButton.setAttribute('aria-label', preferences.muted ? '开启看板娘声音' : '静音看板娘');
    muteButton.textContent = preferences.muted ? '开启声音' : '静音';
  }

  muteButton.addEventListener('click', () => {
    preferences.muted = !preferences.muted;
    if (mascotAudio) mascotAudio.pause();
    syncPreferences();
    savePreferences();
  });
  hideButton.addEventListener('click', () => {
    preferences.collapsed = true;
    if (mascotAudio) mascotAudio.pause();
    clearHoldTimer();
    clearBopTimer();
    mascot.classList.remove('is-talking', 'is-holding', 'is-bopping', 'is-combo-bopping');
    syncPreferences();
    savePreferences();
    restoreButton.focus({ preventScroll: true });
  });
  restoreButton.addEventListener('click', () => {
    preferences.collapsed = false;
    syncPreferences();
    restorePosition();
    const rect = mascot.getBoundingClientRect();
    setPosition(rect.left, rect.top);
    savePreferences();
    mascot.focus({ preventScroll: true });
  });
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

  function syncMascotToolsPosition() {
    if (!tools) return;
    const rect = mascot.getBoundingClientRect();
    const toolWidth = tools.offsetWidth;
    const minCenter = toolWidth / 2 + 8;
    const maxCenter = window.innerWidth - toolWidth / 2 - 8;
    const center = Math.min(Math.max(minCenter, rect.left + rect.width / 2), maxCenter);
    tools.style.left = `${center}px`;
    tools.style.top = `${rect.bottom + 6}px`;
    tools.style.right = 'auto';
    tools.style.bottom = 'auto';
    tools.classList.add('is-positioned');
  }

  function clampPosition(x, y) {
    const rect = mascot.getBoundingClientRect();
    const padding = 10;
    const toolsReserve = tools && !tools.hidden ? tools.offsetHeight + 6 : 0;
    return {
      x: Math.min(Math.max(padding, x), window.innerWidth - rect.width - padding),
      y: Math.min(
        Math.max(padding, y),
        window.innerHeight - rect.height - padding - toolsReserve,
      ),
    };
  }

  function setPosition(x, y, persist = false) {
    const position = clampPosition(x, y);
    mascot.style.left = `${position.x}px`;
    mascot.style.top = `${position.y}px`;
    mascot.style.right = 'auto';
    mascot.style.bottom = 'auto';
    syncMascotToolsPosition();
    if (persist) {
      try { localStorage.setItem(storageKey, JSON.stringify(position)); } catch (_) { /* 拖动仍可用 */ }
    }
  }

  function restorePosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
        setPosition(saved.x, saved.y);
      }
    } catch (error) {
      try { localStorage.removeItem(storageKey); } catch (_) { /* 存储不可用 */ }
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
    if (!mascotAudio || preferences.muted || preferences.collapsed) return;
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
    if (mascot.hasPointerCapture(pointerId)) mascot.releasePointerCapture(pointerId);
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
  syncPreferences();
  syncMascotToolsPosition();
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
    if (mascot.hidden) return;
    const rect = mascot.getBoundingClientRect();
    setPosition(rect.left, rect.top, true);
    syncMascotToolsPosition();
  });
}

async function loadStickers() {
  try {
    // 与匿名 preload 保持相同的 CORS 和 credentials 模式，确保响应可复用。
    const response = await fetch('stickers/manifest.json', { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error('manifest unavailable');
    const stickers = await response.json();
    renderStickers(stickers);
    document.querySelector('#wall-empty-title').textContent = '档案室还空着';
    document.querySelector('#wall-empty-message').textContent = '新的表情正在整理，稍后再来看看吧。';
  } catch (error) {
    renderStickers([]);
    document.querySelector('#wall-empty-title').textContent = '表情暂时没有加载出来';
    document.querySelector('#wall-empty-message').textContent = '请检查网络，或点击下方按钮重新加载。';
  }
}

async function reloadStickers() {
  if (stickerCount) {
    stickerCount.hidden = false;
    stickerCount.textContent = '整理中…';
  }
  if (wallEmpty) wallEmpty.hidden = true;
  await loadStickers();
}

if (wallRetry) wallRetry.addEventListener('click', reloadStickers);

initMascot();
initNavScroll();
loadStickers();
