/* Native page links and the poster work before this optional world starts. */
(() => {
  const world = document.getElementById('main');
  const canvas = document.getElementById('world-canvas');
  const places = document.getElementById('world-places');
  const controls = document.getElementById('world-live-controls');
  const motion = document.getElementById('world-motion');
  const motionLabel = document.getElementById('world-motion-label');
  const lighting = document.getElementById('world-lighting');
  const lightingLabel = document.getElementById('world-lighting-label');
  const caption = document.getElementById('world-caption');
  const captionName = document.getElementById('world-caption-name');
  const captionLink = document.getElementById('world-caption-link');
  const status = document.getElementById('world-status');
  const help = document.getElementById('world-help');
  const focusButtons = [...document.querySelectorAll('[data-world-focus]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const subjects = {
    'landmark-karatsu-castle': { label: '唐津城', href: 'photos.html', link: '写真を見る' },
    'landmark-karatsu-bank': { label: '旧唐津銀行', href: 'blog.html', link: 'ブログを読む' },
    'landmark-okuma-auditorium': { label: '大隈講堂', href: 'profile.html', link: 'プロフィールを見る' },
    'landmark-okuma-statue': { label: '大隈重信像', href: 'research.html', link: '研究・活動を見る' },
    cat: { label: '歩く猫' },
  };
  let engine, disposed = false, firstFrame = false, failed = false, motionChosen = false;
  let state = { catReady: false, landmarksReady: false, paused: reducedMotion.matches, lightingMode: 'auto', focus: 'world' };
  function showFocus(id) {
    const subject = subjects[id];
    caption.hidden = !subject;
    if (!subject) { if (!failed) status.textContent = firstFrame ? '全景を表示しています。' : ''; return; }
    captionName.textContent = subject.label;
    captionLink.hidden = !subject.href;
    if (subject.href) {
      captionLink.href = subject.href;
      captionLink.replaceChildren(document.createTextNode(subject.link + ' '), Object.assign(document.createElement('span'), { textContent: '↗' }));
      captionLink.lastElementChild.setAttribute('aria-hidden', 'true');
    }
    status.textContent = subject.label + 'を表示しています。';
  }
  function syncState(next = {}) {
    state = { ...state, ...next };
    if (!failed && subjects[state.focus]) world.classList.add('is-focused');
    else world.classList.remove('is-focused');
    focusButtons.forEach(button => { button.disabled = failed || !engine || !(button.dataset.worldFocus === 'cat' ? state.catReady : state.landmarksReady); });
    motion.setAttribute('aria-pressed', String(state.paused));
    motion.setAttribute('aria-label', state.paused ? '動きを再開する' : '動きを止める');
    motionLabel.textContent = state.paused ? '動きを再開' : '動きを止める';
    const labels = { auto: '自動', day: '昼', night: '夜' }, nextMode = { auto: 'day', day: 'night', night: 'auto' };
    lightingLabel.textContent = labels[state.lightingMode] || labels.auto;
    lighting.setAttribute('aria-label', '光：' + lightingLabel.textContent + '。' + labels[nextMode[state.lightingMode] || 'day'] + 'に切り替える');
    showFocus(state.focus);
  }
  function fail(error) {
    if (disposed || failed) return;
    failed = true;
    console.warn('The landscape remains available as a still image:', error);
    world.classList.remove('is-live', 'is-focused');
    controls.hidden = true;
    canvas.tabIndex = -1;
    canvas.setAttribute('aria-hidden', 'true');
    help.hidden = true;
    focusButtons.forEach(button => { button.disabled = true; });
    caption.hidden = true;
    engine?.dispose?.();
    engine = undefined;
    status.textContent = '各ページは上のメニューからご覧いただけます。';
  }
  function ready() {
    if (disposed || failed) return;
    firstFrame = true;
    canvas.tabIndex = 0;
    canvas.removeAttribute('aria-hidden');
    help.hidden = false;
    world.classList.add('is-live');
    controls.hidden = false;
  }
  canvas.addEventListener('worldstate', event => syncState(event.detail));
  focusButtons.forEach(button => button.addEventListener('click', () => {
    if (!engine || button.disabled) return;
    engine.focus?.(button.dataset.worldFocus);
    state.focus = button.dataset.worldFocus;
    showFocus(state.focus);
    places.open = false;
    canvas.focus({ preventScroll: true });
  }));
  motion.addEventListener('click', () => {
    if (!engine) return;
    motionChosen = true;
    state.paused = !state.paused;
    engine.setPaused?.(state.paused);
    syncState();
  });
  lighting.addEventListener('click', () => {
    if (!engine) return;
    state.lightingMode = { auto: 'day', day: 'night', night: 'auto' }[state.lightingMode] || 'auto';
    engine.setLightingMode?.(state.lightingMode);
    syncState();
  });
  document.getElementById('world-reset').addEventListener('click', () => {
    engine?.reset?.(); state.focus = 'world'; showFocus('world'); places.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && places.open) { places.open = false; places.querySelector('summary').focus(); }
  });
  reducedMotion.addEventListener?.('change', event => {
    if (motionChosen) return;
    state.paused = event.matches; engine?.setPaused?.(state.paused); syncState();
  });
  syncState();
  // Yield the first paint to HTML, typography and the small real-world poster.
  // The bundled engine has no render-blocking script or module-preload chain.
  let launchTimer;
  const launchFrame = requestAnimationFrame(() => {
    launchTimer = setTimeout(async () => {
      if (disposed) return;
      try {
        // Keep the immediately usable poster on devices without WebGL2,
        // without downloading or parsing the optional landscape engine.
        const rendererContext = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
        if (!rendererContext) { fail(new Error('WebGL2 is unavailable')); return; }
        const { mountWorld } = await import('../scene/world.bundle.js?v=20261106-world1');
        if (disposed) return;
        const mounted = await mountWorld({ canvas, rendererContext, onReady: ready, onError: fail, onSelect: id => { state.focus = id; showFocus(id); }, onProgress() {} });
        if (disposed || failed) { mounted?.dispose?.(); return; }
        engine = mounted;
        engine?.setPaused?.(state.paused);
        syncState(engine?.getState?.() || {});
        if (firstFrame && !failed) controls.hidden = false;
      } catch (error) { fail(error); }
    }, 0);
  });
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    disposed = true; cancelAnimationFrame(launchFrame); clearTimeout(launchTimer); engine?.dispose?.();
  });
})();
