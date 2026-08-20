const stickerGrid = document.querySelector('#sticker-grid');
const lightbox = document.querySelector('#lightbox');
const lightboxImage = document.querySelector('#lightbox-image');
const lightboxMediaShell = document.querySelector('.lightbox-media-shell');
const copyButton = document.querySelector('#copy-button');
const downloadButton = document.querySelector('#download-button');
const actionStatus = document.querySelector('#action-status');

let activeSticker = null;

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

function loadImage(source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve(source);
      } else {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

async function resolveImageSource(sticker) {
  const previewSource = sticker.preview || sticker.original;
  const loadedPreview = await loadImage(previewSource);
  if (loadedPreview) return loadedPreview;
  if (sticker.preview) return loadImage(sticker.original);
  return null;
}

function createStickerCard(sticker, source, index) {
  const card = document.createElement('button');
  card.className = 'sticker-card';
  card.type = 'button';
  card.style.setProperty('--tilt', `${index % 2 === 0 ? 0.4 : -0.4}deg`);
  card.setAttribute('aria-label', '打开表情预览');

  const inner = document.createElement('span');
  inner.className = 'sticker-card-inner';

  const image = document.createElement('img');
  image.src = source;
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';

  inner.appendChild(image);
  card.appendChild(inner);

  if (/\.(gif|apng)$/i.test(sticker.original)) {
    card.classList.add('is-animated');
  }

  card.addEventListener('click', () => openLightbox(sticker));
  return card;
}

async function renderStickers(stickers) {
  stickerGrid.replaceChildren();
  const uniqueStickers = [
    ...new Map(
      stickers
        .filter((sticker) => sticker && sticker.original)
        .map((sticker) => [sticker.original, sticker]),
    ).values(),
  ];
  if (!uniqueStickers.length) return;

  const cards = await Promise.all(
    uniqueStickers.map(async (sticker, index) => {
      const source = await resolveImageSource(sticker);
      return source ? createStickerCard(sticker, source, index) : null;
    }),
  );

  const fragment = document.createDocumentFragment();
  cards.forEach((card) => {
    if (card) fragment.appendChild(card);
  });
  stickerGrid.appendChild(fragment);
}

function openLightbox(sticker) {
  activeSticker = sticker;
  lightboxImage.src = sticker.original;
  lightboxImage.alt = sticker.alt || '表情包大图预览';
  downloadButton.href = sticker.original;
  downloadButton.download = sticker.filename || 'sticker';
  actionStatus.textContent = '';
  lightboxMediaShell.classList.toggle(
    'is-animated',
    /\.(gif|apng)$/i.test(sticker.original),
  );
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
    const response = await fetch(activeSticker.original);
    const blob = await response.blob();
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
