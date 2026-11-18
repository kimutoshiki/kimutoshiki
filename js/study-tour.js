// Load the four garden views individually when someone opens the illustrated tour.
const scenes = [
  { file: 'okuma-auditorium', name: '大隈講堂', area: '早稲田大学をモチーフにした庭' },
  { file: 'okuma-statue', name: '大隈重信像', area: '早稲田大学をモチーフにした庭' },
  { file: 'karatsu-castle', name: '唐津城', area: '唐津市をモチーフにした庭' },
  { file: 'karatsu-bank', name: '旧唐津銀行', area: '唐津市をモチーフにした庭' },
];
const asset = file => new URL('../images/world/tour/' + file + '.webp', import.meta.url).href;

export function createGardenTour(stand) {
  const controller = new AbortController(), { signal } = controller;
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = new URL('../css/study-tour.css', import.meta.url).href;
  document.head.append(sheet);
  const dialog = document.createElement('dialog');
  dialog.className = 'study-tour';
  dialog.setAttribute('aria-labelledby', 'tour-title');
  dialog.innerHTML = `<header class="tour-top"><h2 id="tour-title">庭の景色</h2><button type="button" class="tour-close" autofocus>席に戻る <span aria-hidden="true">↩</span></button></header>
    <div class="tour-view"><img alt=""><p class="tour-load" role="status"></p><button type="button" class="tour-retry" hidden>もう一度読み込む</button></div>
    <div class="tour-bottom"><div class="tour-place" aria-live="polite" aria-atomic="true"><span class="tour-area"></span><h3></h3></div>
    <div class="tour-steps"><button type="button" class="tour-prev"><span aria-hidden="true">←</span> 前へ</button><span class="tour-count"></span><button type="button" class="tour-next">次へ <span aria-hidden="true">→</span></button></div></div>`;
  const find = selector => dialog.querySelector(selector);
  const picture = find('img'), load = find('.tour-load'), retry = find('.tour-retry');
  const close = find('.tour-close');
  let index = 0;
  function show(next) {
    index = (next + scenes.length) % scenes.length;
    const scene = scenes[index];
    find('.tour-place h3').textContent = scene.name;
    find('.tour-area').textContent = scene.area;
    find('.tour-count').textContent = (index + 1) + ' / ' + scenes.length;
    load.textContent = '景色を読み込んでいます…';
    retry.hidden = true;
    picture.hidden = true;
    picture.alt = '3Dの庭にある' + scene.name;
    picture.src = asset(scene.file);
  }
  picture.addEventListener('load', () => { picture.hidden = false; load.textContent = ''; }, { signal });
  picture.addEventListener('error', () => {
    if (!dialog.open) return;
    load.textContent = 'この景色を読み込めませんでした。';
    retry.hidden = false;
  }, { signal });
  retry.addEventListener('click', () => show(index), { signal });
  find('.tour-prev').addEventListener('click', () => show(index - 1), { signal });
  find('.tour-next').addEventListener('click', () => show(index + 1), { signal });
  close.addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  }, { signal });
  dialog.addEventListener('close', () => {
    picture.removeAttribute('src');
    stand.focus({ preventScroll: true });
  }, { signal });
  document.body.append(dialog);
  return {
    open() {
      if (dialog.open) return;
      dialog.showModal();
      show(index);
    },
    destroy() { controller.abort(); if (dialog.open) dialog.close(); dialog.remove(); sheet.remove(); },
  };
}
