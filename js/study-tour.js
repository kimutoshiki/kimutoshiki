// Full-size outdoor artwork is requested only for the view currently open.
const scenes = [
  { file: 'okuma-auditorium', name: '大隈講堂', area: '東京・早稲田大学', source:'https://www.waseda.jp/culture/news/2020/04/20/10208/', alt: '早稲田大学の正門側から見た大隈講堂。石畳の向こうに、左手の時計塔と正面の三つのアーチが並ぶ。' },
  { file: 'okuma-statue', name: '大隈重信像', area: '東京・早稲田大学', source:'https://www.waseda.jp/culture/archives/other/2026/04/27/7343/', alt: '紅葉に囲まれた石の台座に、角帽とガウンをまとい、右手に杖を持つ大隈重信が立つ。' },
  { file: 'karatsu-castle', name: '唐津城', area: '佐賀・唐津市', source:'https://www.asobo-saga.jp/spots/detail/83cd698f-0214-46e2-8fbd-3dc0e772f7c5', alt: '唐津城の本丸広場。左の白い塀から石段が石垣の入口へ続き、右寄りに白い天守がそびえる。' },
  { file: 'karatsu-bank', name: '旧唐津銀行', area: '佐賀・唐津市', source:'https://karatsu-bank.jp/', alt: '本町の交差点から見た旧唐津銀行。赤いれんがの壁に白い帯が走り、大きなアーチ窓が並ぶ。' },
];
const imagePath = (file, width) => new URL(`../images/outdoors/${file}-${width}.webp`, import.meta.url).href;

export function createGardenTour(stand, { onExplore } = {}) {
  const controller = new AbortController(), { signal } = controller;
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = new URL('../css/study-tour.css?v=20261118-survey2', import.meta.url).href;
  document.head.append(sheet);
  const dialog = document.createElement('dialog');
  dialog.className = 'study-tour';
  dialog.setAttribute('aria-labelledby', 'tour-title');
  dialog.innerHTML = `<header class="tour-top"><h2 id="tour-title">窓の外へ</h2><button type="button" class="tour-close" autofocus>席に戻る <span aria-hidden="true">↩</span></button></header>
    <div class="tour-view"><img alt="" hidden><p class="tour-load" role="status"></p><button type="button" class="tour-retry" hidden>もう一度読み込む</button></div>
    <div class="tour-bottom"><div class="tour-place" aria-live="polite" aria-atomic="true"><div class="tour-meta"><span class="tour-area"></span><a class="tour-source" target="_blank" rel="noopener noreferrer">現地の資料 ↗</a></div><h3></h3></div>
    <button type="button" class="tour-explore">この場所を3Dで歩く <span aria-hidden="true">↗</span></button>
    <div class="tour-steps"><button type="button" class="tour-prev" aria-label="前の景色"><span aria-hidden="true">←</span></button><span class="tour-count"></span><button type="button" class="tour-next" aria-label="次の景色"><span aria-hidden="true">→</span></button></div></div>`;
  const find = selector => dialog.querySelector(selector);
  const view = find('.tour-view'), load = find('.tour-load'), retry = find('.tour-retry');
  const explore = find('.tour-explore');
  if (!onExplore) explore.hidden = true;
  let index = 0, entering = false, swipe;
  let clearArrival;
  function bridgeToWorld(scene) {
    clearArrival?.();
    const artwork = view.querySelector('img');
    const frame = document.querySelector('.desk-view'), world = document.getElementById('main');
    if (!artwork.currentSrc || artwork.hidden || !frame || !world) return;
    const veil = document.createElement('div');
    veil.className = 'tour-arrival';
    const image = document.createElement('img');
    image.src = artwork.currentSrc;
    image.alt = '';
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.textContent = scene.name + 'に移動しています…';
    veil.append(image, status);
    frame.append(veil);
    const arrival = new AbortController();
    let cleanupTimer;
    function clear() {
      clearTimeout(cleanupTimer);
      arrival.abort();
      veil.remove();
      clearArrival = null;
    }
    function reveal() {
      if (veil.classList.contains('is-arrived')) return;
      veil.classList.add('is-arrived');
      clearTimeout(cleanupTimer);
      cleanupTimer = setTimeout(clear, 450);
    }
    document.addEventListener('worldstate', event => {
      const state = event.detail;
      if (state?.outdoorsError) clear();
      else if (state?.mode === 'outside') {
        const received = state.renderer === 'software'
          ? state.renderedDistrict === 'landmark-' + scene.file
          : state.photoPlace === scene.file && state.placeArtReady;
        if (received || state.placeArtError) reveal();
      }
    }, { capture: true, signal: arrival.signal });
    window.addEventListener('study-mode-change', () => {
      if (world.dataset.displayMode === '2d') clear();
    }, { signal: arrival.signal });
    clearArrival = clear;
    cleanupTimer = setTimeout(reveal, 9000);
  }
  function show(next, refresh = false) {
    index = (next + scenes.length) % scenes.length;
    const scene = scenes[index], picture = document.createElement('img');
    find('.tour-place h3').textContent = scene.name;
    find('.tour-area').textContent = scene.area;
    find('.tour-source').href = scene.source;
    find('.tour-count').textContent = (index + 1) + ' / ' + scenes.length;
    load.textContent = '景色を読み込んでいます…';
    retry.hidden = true;
    picture.alt = scene.alt;
    picture.hidden = true;
    picture.draggable = false;
    picture.width = 1536; picture.height = 1024;
    const succeed = () => {
      if (!dialog.open || !view.contains(picture)) return;
      picture.hidden = false;
      load.textContent = '';
    };
    const fail = () => {
      if (!dialog.open || !view.contains(picture)) return;
      load.textContent = '景色を読み込めませんでした。';
      retry.hidden = false;
    };
    // Replacing the element also isolates callbacks from rapid arrow presses.
    view.querySelector('img').replaceWith(picture);
    picture.addEventListener('load', succeed, { once: true });
    picture.addEventListener('error', fail, { once: true });
    const suffix = '?v=survey2' + (refresh ? '&retry=' + Date.now() : '');
    picture.sizes = '(max-width: 620px) 100vw, min(96vw, 85rem)';
    picture.srcset = [768, 1280, 1536].map(width => imagePath(scene.file, width) + suffix + ' ' + width + 'w').join(', ');
    picture.src = imagePath(scene.file, 1280) + suffix;
  }
  retry.addEventListener('click', () => show(index, true), { signal });
  find('.tour-prev').addEventListener('click', () => show(index - 1), { signal });
  find('.tour-next').addEventListener('click', () => show(index + 1), { signal });
  find('.tour-close').addEventListener('click', () => dialog.close(), { signal });
  explore.addEventListener('click', () => {
    entering = true;
    bridgeToWorld(scenes[index]);
    dialog.close();
    onExplore?.(scenes[index].file);
  }, { signal });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  }, { signal });
  view.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' && !e.target.closest('button')) swipe = [e.pointerId, e.clientX, e.clientY];
  }, { signal });
  view.addEventListener('pointercancel', () => { swipe = null; }, { signal });
  view.addEventListener('pointerup', e => {
    if (!swipe || swipe[0] !== e.pointerId) return;
    const dx = e.clientX - swipe[1], dy = e.clientY - swipe[2];
    swipe = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) show(index + (dx < 0 ? 1 : -1));
  }, { signal });
  dialog.addEventListener('close', () => {
    if (!entering) stand.focus({ preventScroll: true });
  }, { signal });
  document.body.append(dialog);
  return {
    open(place) {
      if (dialog.open) return;
      const target = scenes.findIndex(scene => scene.file === place);
      if (target >= 0) index = target;
      entering = false;
      dialog.showModal();
      show(index);
    },
    destroy() { clearArrival?.(); controller.abort(); if (dialog.open) dialog.close(); dialog.remove(); sheet.remove(); },
  };
}
