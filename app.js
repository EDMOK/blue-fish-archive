const stickerGrid = document.querySelector('#sticker-grid');
const lightbox = document.querySelector('#lightbox');
const lightboxImage = document.querySelector('#lightbox-image');
const lightboxMediaShell = document.querySelector('.lightbox-media-shell');
const copyButton = document.querySelector('#copy-button');
const downloadButton = document.querySelector('#download-button');
const actionStatus = document.querySelector('#action-status');

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
    { threshold: 0.12 },
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
  card.setAttribute('aria-label', '打开表情预览');

  const inner = document.createElement('span');
  inner.className = 'sticker-card-inner';

  const source = sticker.preview || sticker.original;
  const image = document.createElement('img');
  image.src = source;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
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
  if (!uniqueStickers.length) return;

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

loadStickers();
