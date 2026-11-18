// Still views from the same 3D scene, requested only on devices using the image tour.
const scenes = [
  { file: 'okuma-auditorium', name: '大隈講堂', area: '早稲田大学をモチーフにした庭' },
  { file: 'okuma-statue', name: '大隈重信像', area: '早稲田大学をモチーフにした庭' },
  { file: 'karatsu-castle', name: '唐津城', area: '唐津市をモチーフにした庭' },
  { file: 'karatsu-bank', name: '旧唐津銀行', area: '唐津市をモチーフにした庭' },
];
const props = {
  notebook: { bit: 1, label: 'ノート', messages: ['ノートを閉じました。', 'ノートを開きました。'] },
  lamp: { bit: 2, label: 'ライト', messages: ['ライトをつけました。', 'ライトを消しました。'] },
  drawer: { bit: 4, label: '引き出し', messages: ['引き出しを閉じました。', '引き出しを開きました。'] },
};
const validPhase = value => ['day', 'dusk', 'night'].includes(value) ? value : 'day';
const asset = file => new URL('../images/world/tour/' + file + '.webp', import.meta.url).href;

function makeGarden(stand, signal) {
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
    destroy() { if (dialog.open) dialog.close(); dialog.remove(); },
  };
}

export function mountStudyTour({ phase = 'day', hotspots = {} } = {}) {
  const world = document.getElementById('main'), frame = world.querySelector('.desk-view');
  const picture = frame.querySelector('.world-poster'), original = picture.querySelector('img');
  const stand = document.getElementById('world-stand'), label = document.getElementById('world-stand-label');
  const sublabel = stand.querySelector('small'), hint = world.querySelector('.look-hint');
  const note = document.getElementById('world-entry-note'), feedback = document.getElementById('world-prop-feedback');
  const buttons = [...world.querySelectorAll('[data-desk-action]')];
  const controller = new AbortController(), { signal } = controller;
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet'; sheet.href = new URL('../css/study-tour.css', import.meta.url).href;
  document.head.append(sheet);

  const originalPicture = [...picture.childNodes];
  const originalHint = [...hint.childNodes];
  const originalText = { label: label.textContent, sublabel: sublabel.textContent, feedback: feedback.textContent };
  const originalButtons = buttons.map(button => [button, button.disabled, button.getAttribute('aria-pressed')]);
  const noteHidden = note.hidden, standDisabled = stand.disabled;
  let light = validPhase(phase), mask = 0, shownLight = '', shownMask = 0;
  let active = false, pending = null, garden, resize;
  const targets = document.createElement('div');
  targets.className = 'study-hotspots';
  // These pointer hit areas duplicate the keyboard-accessible controls below the image.
  targets.setAttribute('aria-hidden', 'true');

  function placeTargets() {
    const box = picture.getBoundingClientRect();
    const image = picture.querySelector('img');
    if (!image?.naturalWidth || !box.width || !box.height) return;
    const fits = [box.width / image.naturalWidth, box.height / image.naturalHeight];
    const scale = getComputedStyle(image).objectFit === 'contain' ? Math.min(...fits) : Math.max(...fits);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    for (const hit of targets.children) {
      const [x, y] = hotspots[hit.dataset.prop];
      hit.style.left = ((box.width - width) / 2 + x * width) + 'px';
      hit.style.top = ((box.height - height) / 2 + y * height) + 'px';
    }
  }
  function activate() {
    active = true;
    world.classList.add('has-study-tour');
    picture.hidden = false;
    stand.disabled = false; label.textContent = '庭の景色を見る'; sublabel.textContent = '早稲田と唐津の4か所';
    note.hidden = true; hint.textContent = '軽量表示'; feedback.textContent = '机の小物を選ぶと、画像が切り替わります。';
    for (const b of buttons) {
      b.disabled = false;
      b.addEventListener('click', () => toggle(b.dataset.deskAction), { signal });
    }
    for (const [name, point] of Object.entries(hotspots)) {
      if (!props[name] || !Array.isArray(point) || point.length < 2) continue;
      const hit = document.createElement('button');
      hit.type = 'button'; hit.tabIndex = -1; hit.className = 'study-hotspot'; hit.dataset.prop = name;
      hit.title = props[name].label;
      hit.addEventListener('click', () => toggle(name), { signal });
      targets.append(hit);
    }
    frame.append(targets);
    if (typeof ResizeObserver === 'function') { resize = new ResizeObserver(placeTargets); resize.observe(frame); }
    else window.addEventListener('resize', placeTargets, { signal });
    stand.addEventListener('click', () => { garden ??= makeGarden(stand, signal); garden.open(); }, { signal });
  }
  function render(message) {
    // A second tap while an image is loading supersedes it, even if it returns to the current view.
    if (pending) { pending.onload = pending.onerror = null; pending.removeAttribute('src'); pending = null; }
    if (shownLight === light && shownMask === mask) return;
    const wantedLight = light, wantedMask = mask;
    const image = new Image();
    pending = image; image.decoding = 'async'; image.alt = ''; image.width = 1152; image.height = 780;
    image.onload = () => {
      if (signal.aborted || pending !== image) return;
      image.onload = image.onerror = null;
      pending = null; shownMask = wantedMask; shownLight = wantedLight;
      picture.replaceChildren(image);
      if (!active) activate();
      for (const b of buttons) {
        const name = b.dataset.deskAction, bit = props[name]?.bit;
        if (bit) b.setAttribute('aria-pressed', String(name === 'lamp' ? !(mask & bit) : Boolean(mask & bit)));
      }
      if (message) feedback.textContent = message;
      placeTargets();
    };
    image.onerror = () => {
      if (signal.aborted || pending !== image) return;
      pending = null; mask = shownMask;
      if (active) feedback.textContent = '画像を読み込めませんでした。もう一度、小物を選んでください。';
    };
    image.src = asset(wantedLight + '-' + wantedMask);
  }
  function toggle(name) {
    const prop = props[name];
    if (!prop) return;
    mask ^= prop.bit;
    render(prop.messages[Number(Boolean(mask & prop.bit))]);
  }

  render();
  return {
    setPhase(next) { if (!signal.aborted && validPhase(next) !== light) { light = validPhase(next); render(); } },
    destroy() {
      controller.abort(); resize?.disconnect(); garden?.destroy();
      if (pending) { pending.onload = pending.onerror = null; pending.removeAttribute('src'); }
      targets.remove(); sheet.remove();
      if (!active) return;
      world.classList.remove('has-study-tour');
      picture.replaceChildren(...originalPicture);
      hint.replaceChildren(...originalHint);
      label.textContent = originalText.label; sublabel.textContent = originalText.sublabel;
      feedback.textContent = originalText.feedback; note.hidden = noteHidden; stand.disabled = standDisabled;
      for (const [button, disabled, pressed] of originalButtons) {
        button.disabled = disabled;
        if (pressed === null) button.removeAttribute('aria-pressed'); else button.setAttribute('aria-pressed', pressed);
      }
    },
  };
}
