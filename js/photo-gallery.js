let catalogPromise;
const catalog = () => catalogPromise ||= import('../scene/photo-catalog.js?v=20260916-perf1').then(module => module.PHOTO_CATALOG);
let viewer, activePhoto, allPhotos, previousFocus;
function makeViewer() {
  if (viewer) return viewer;
  viewer = document.createElement('dialog');
  viewer.className = 'photo-viewer'; viewer.setAttribute('aria-labelledby', 'photo-viewer-title');
  viewer.innerHTML = '<div class="photo-viewer-top"><span class="photo-counter"></span><button class="photo-close" aria-label="写真を閉じる">×</button></div><div class="photo-viewer-image"></div><div class="photo-viewer-bottom"><button class="photo-prev" aria-label="前の写真">←</button><div><h2 id="photo-viewer-title"></h2></div><button class="photo-next" aria-label="次の写真">→</button></div>';
  document.body.append(viewer);
  viewer.querySelector('.photo-close').addEventListener('click', () => viewer.close());
  viewer.querySelector('.photo-prev').addEventListener('click', () => step(-1));
  viewer.querySelector('.photo-next').addEventListener('click', () => step(1));
  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  });
  viewer.addEventListener('close', () => {
    viewer.querySelector('.photo-viewer-image').replaceChildren();
    previousFocus?.focus?.({preventScroll:true});
  });
  return viewer;
}
function step(direction) {
  const index = allPhotos.findIndex(photo => photo.id === activePhoto.id);
  showPhoto(allPhotos[(index + direction + allPhotos.length) % allPhotos.length]);
}
function showPhoto(photo) {
  activePhoto = photo;
  const dialog = makeViewer(), image = document.createElement('img');
  image.alt = photo.originalName.replace(/\.[^.]+$/, '').replace('＠', ' / '); image.width = photo.width; image.height = photo.height;
  image.decoding = 'async'; image.src = photo.full || photo.src;
  const imageArea = dialog.querySelector('.photo-viewer-image');
  imageArea.style.setProperty('--photo-placeholder', `url("${photo.thumb}")`); imageArea.replaceChildren(image);
  image.addEventListener('load', () => { if (activePhoto.id === photo.id) imageArea.style.removeProperty('--photo-placeholder'); }, {once:true});
  image.addEventListener('error', () => {if (image.getAttribute('src') !== photo.src) image.src = photo.src;}, {once:true});
  dialog.querySelector('#photo-viewer-title').textContent = photo.location;
  dialog.querySelector('.photo-counter').textContent = String(allPhotos.indexOf(photo) + 1).padStart(2,'0') + ' / ' + String(allPhotos.length).padStart(2,'0');
  if (!dialog.open) dialog.showModal();
}
export async function openPhotoById(id, source) {
  allPhotos = await catalog();
  const photo = allPhotos.find(item => item.id === id);
  if (!photo) return false;
  previousFocus = source?.focus ? source : document.activeElement;
  if (typeof HTMLDialogElement === 'undefined') { location.href = photo.full || photo.src; return true; }
  showPhoto(photo); return true;
}
export async function populateGallery(container) {
  if (!container) return;
  try {
    const photos = await catalog();
    if (!container.isConnected) return;
    const fragment = document.createDocumentFragment();
    for (const photo of photos) {
      const figure = document.createElement('figure'); figure.className = 'gallery-photo';
      const link = document.createElement('a'); link.href = photo.full || photo.src; link.setAttribute('aria-label', photo.location + 'の写真を大きく見る');
      const image = document.createElement('img'); image.src = photo.thumb; image.alt = photo.originalName.replace(/\.[^.]+$/, '').replace('＠', ' / '); image.width = photo.width; image.height = photo.height; image.loading = 'lazy'; image.decoding = 'async';
      link.append(image);
      link.addEventListener('click', event => {
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); openPhotoById(photo.id, link);
      });
      const caption = document.createElement('figcaption');
      const copy = document.createElement('div'), location = document.createElement('strong');
      location.textContent = photo.location;
      copy.append(location); caption.append(copy); figure.append(link, caption); fragment.append(figure);
    }
    container.replaceChildren(fragment);
  } catch (error) {
    const message = document.createElement('p'); message.className = 'gallery-status'; message.textContent = '写真を読み込めませんでした。';
    const retry = document.createElement('button'); retry.className = 'gallery-retry'; retry.textContent = 'もう一度読み込む';
    retry.addEventListener('click', () => {catalogPromise = null;populateGallery(container);});
    container.replaceChildren(message, retry); console.error('Photo catalog could not load', error);
  }
}
