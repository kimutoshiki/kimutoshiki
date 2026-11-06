/* Native page navigation and the small room poster are usable before WebGL. */
(() => {
  const byId = id => document.getElementById(id);
  const world = byId('main'), canvas = byId('world-canvas');
  const places = byId('world-places'), settings = byId('world-settings');
  const controls = byId('world-live-controls'), help = byId('world-help');
  const travel = byId('world-travel'), travelLabel = byId('world-travel-label');
  const motion = byId('world-motion'), motionLabel = byId('world-motion-label');
  const lighting = byId('world-lighting'), lightingLabel = byId('world-lighting-label');
  const caption = byId('world-caption'), captionName = byId('world-caption-name'), captionLink = byId('world-caption-link');
  const status = byId('world-status'), locationName = byId('world-location-name');
  const focusButtons = [...document.querySelectorAll('[data-world-focus]')];
  const walkButtons = [...document.querySelectorAll('[data-walk]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const subjects = {
    'landmark-karatsu-castle': { label: '唐津城', href: 'photos.html', link: '写真を見る' },
    'landmark-karatsu-bank': { label: '旧唐津銀行', href: 'blog.html', link: 'ブログを読む' },
    'landmark-okuma-auditorium': { label: '大隈講堂', href: 'profile.html', link: 'プロフィールを見る' },
    'landmark-okuma-statue': { label: '大隈重信像', href: 'research.html', link: '研究・活動を見る' },
    cat: { label: '書斎の猫' },
  };
  let engine, disposed = false, firstFrame = false, failed = false, motionChosen = false;
  let state = { catReady: false, landmarksReady: false, paused: reducedMotion.matches, lightingMode: 'day', focus: 'room', mode: 'inside', travel: false };
  let announcement = '';
  const held = new Map();
  let assistiveTimer, keyClickTimer, keyClickButton;
  function announce(text) {
    if (text === announcement) return;
    announcement = text; status.textContent = text;
  }
  function syncState(next = {}) {
    if (disposed || failed) return;
    state = { ...state, ...next };
    const ready = !!engine && firstFrame;
    travel.disabled = !ready;
    focusButtons.forEach(button => { button.disabled = !ready || !(button.dataset.worldFocus === 'cat' ? state.catReady : state.landmarksReady); });
    walkButtons.forEach(button => { button.disabled = !ready; });
    travelLabel.textContent = state.travel ? '移動を止める' : state.mode === 'outside' ? '部屋へ戻る' : '外へ歩く';
    travel.classList.toggle('is-travelling', !!state.travel);
    locationName.textContent = state.mode === 'outside' ? '庭' : '書斎';
    motion.setAttribute('aria-pressed', String(state.paused));
    motion.setAttribute('aria-label', state.paused ? '猫の動きを再開する' : '猫の動きを止める');
    motionLabel.textContent = state.paused ? '停止中' : '動いています';
    lightingLabel.textContent = state.lightingMode === 'night' ? '夜' : '昼';
    lighting.setAttribute('aria-label', '光を' + (state.lightingMode === 'night' ? '昼' : '夜') + 'に切り替える');
    const subject = subjects[state.focus];
    caption.hidden = !subject;
    if (subject) {
      captionName.textContent = subject.label + (state.travel ? 'へ移動中' : '');
      captionLink.hidden = !subject.href;
      if (subject.href) { captionLink.href = subject.href; captionLink.textContent = subject.link + ' ↗'; }
    }
    if (firstFrame) announce(state.travel ? (subject?.label || (state.mode === 'inside' ? '庭' : '書斎')) + 'へ歩いています。途中で止められます。' : (subject?.label || locationName.textContent) + '。ドラッグで見回し、矢印キーで歩けます。');
  }
  function sendPadInput() {
    const directions = new Set(held.values());
    walkButtons.forEach(button => button.classList.toggle('is-held', directions.has(button.dataset.walk)));
    engine?.setMovement?.({ forward: Number(directions.has('forward')) - Number(directions.has('back')), right: Number(directions.has('right')) - Number(directions.has('left')) });
  }
  function clearAssistive(send = true) {
    clearTimeout(assistiveTimer); assistiveTimer = undefined;
    if (held.delete('assistive') && send) sendPadInput();
  }
  function releasePad() {
    const hadInput = held.size > 0;
    clearAssistive(false);
    clearTimeout(keyClickTimer); keyClickButton = undefined;
    if (!hadInput) return;
    held.clear(); sendPadInput();
  }
  function closePanels() { places.open = false; settings.open = false; }
  function refresh() { syncState(engine?.getState?.() || {}); }
  function fail(error) {
    if (disposed || failed) return;
    failed = true;
    console.warn('The study remains available as a still image:', error);
    releasePad(); closePanels();
    world.classList.remove('is-live'); world.classList.add('is-fallback');
    controls.hidden = true; help.hidden = true; caption.hidden = true;
    canvas.tabIndex = -1; canvas.setAttribute('aria-hidden', 'true');
    travel.disabled = true;
    [...focusButtons, ...walkButtons].forEach(button => { button.disabled = true; });
    engine?.dispose?.(); engine = undefined;
    announce('各ページは上のメニューからご覧いただけます。');
  }
  function ready() {
    if (disposed || failed) return;
    firstFrame = true; canvas.tabIndex = 0; canvas.removeAttribute('aria-hidden');
    world.classList.add('is-live'); controls.hidden = false; help.hidden = false;
    syncState();
  }
  canvas.addEventListener('worldstate', event => syncState(event.detail));
  travel.addEventListener('click', () => {
    if (!engine || travel.disabled) return;
    releasePad(); closePanels();
    if (state.travel) engine.stopMovement?.();
    else if (state.mode === 'outside') engine.returnHome?.();
    else engine.leave?.();
    refresh(); canvas.focus({ preventScroll: true });
  });
  focusButtons.forEach(button => button.addEventListener('click', () => {
    if (!engine || button.disabled) return;
    releasePad(); closePanels(); engine.focus?.(button.dataset.worldFocus);
    refresh(); canvas.focus({ preventScroll: true });
  }));
  motion.addEventListener('click', () => {
    if (!engine) return;
    motionChosen = true; state.paused = !state.paused;
    engine.setPaused?.(state.paused); refresh();
  });
  lighting.addEventListener('click', () => {
    if (!engine) return;
    state.lightingMode = state.lightingMode === 'night' ? 'day' : 'night';
    engine.setLightingMode?.(state.lightingMode); refresh();
  });
  byId('world-reset').addEventListener('click', () => {
    if (!engine) return;
    releasePad(); closePanels(); engine.returnHome?.(); refresh(); canvas.focus({ preventScroll: true });
  });
  // Buttons are usable with touch, mouse, switch access and a keyboard. Capture
  // release/cancel always clears held movement, even outside the button bounds.
  walkButtons.forEach(button => {
    button.addEventListener('pointerdown', event => {
      if (!engine || disposed || failed || button.disabled || event.button > 0) return;
      event.preventDefault(); clearAssistive(false); closePanels();
      held.set('pointer:' + event.pointerId, button.dataset.walk);
      button.setPointerCapture?.(event.pointerId); sendPadInput();
    });
    const releasePointer = event => {
      if (held.delete('pointer:' + event.pointerId)) sendPadInput();
    };
    button.addEventListener('pointerup', releasePointer);
    button.addEventListener('pointercancel', releasePointer);
    button.addEventListener('lostpointercapture', releasePointer);
    button.addEventListener('keydown', event => {
      if (!engine || disposed || failed || button.disabled || event.ctrlKey || event.altKey || event.metaKey || ![' ', 'Enter'].includes(event.key)) return;
      event.preventDefault(); clearAssistive(false); clearTimeout(keyClickTimer); keyClickButton = button;
      held.set('key:' + button.dataset.walk, button.dataset.walk); sendPadInput();
    });
    button.addEventListener('keyup', event => {
      if (![' ', 'Enter'].includes(event.key)) return;
      if (held.delete('key:' + button.dataset.walk)) {
        event.preventDefault(); sendPadInput();
        // A keyboard-generated click in this same event turn is already handled.
        keyClickTimer = setTimeout(() => { keyClickButton = undefined; }, 0);
      }
    });
    button.addEventListener('click', event => {
      if (!engine || disposed || failed || button.disabled || event.detail !== 0 || keyClickButton === button || [...held.keys()].some(key => key !== 'assistive')) return;
      clearAssistive(false); closePanels(); held.set('assistive', button.dataset.walk); sendPadInput();
      assistiveTimer = setTimeout(() => { clearAssistive(); }, 180);
    });
    button.addEventListener('blur', () => {
      clearAssistive();
      if (keyClickButton === button) { clearTimeout(keyClickTimer); keyClickButton = undefined; }
      if (held.delete('key:' + button.dataset.walk)) sendPadInput();
    });
    button.addEventListener('contextmenu', event => event.preventDefault());
  });
  // New input elsewhere takes over from a click-only nudge before it reaches
  // the canvas, page navigation or another control.
  for (const type of ['pointerdown', 'keydown', 'click']) document.addEventListener(type, () => clearAssistive(), true);
  for (const [current, other] of [[places, settings], [settings, places]]) {
    current.addEventListener('toggle', () => { if (current.open) { other.open = false; releasePad(); engine?.stopMovement?.(); refresh(); } });
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    releasePad(); engine?.stopMovement?.(); refresh();
    const opened = places.open ? places : settings.open ? settings : null;
    closePanels(); opened?.querySelector('summary')?.focus();
  });
  window.addEventListener('blur', releasePad);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releasePad(); });
  reducedMotion.addEventListener?.('change', event => {
    if (motionChosen || failed || disposed) return;
    state.paused = event.matches; engine?.setPaused?.(state.paused); syncState();
  });
  syncState();
  let launchTimer;
  const launchFrame = requestAnimationFrame(() => {
    launchTimer = setTimeout(async () => {
      if (disposed) return;
      try {
        const rendererContext = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
        if (!rendererContext) { fail(new Error('WebGL2 is unavailable')); return; }
        const { mountWorld } = await import('../scene/world.bundle.js?v=20261106-home2');
        if (disposed) return;
        const mounted = await mountWorld({ canvas, rendererContext, reducedMotion: reducedMotion.matches, onReady: ready, onError: fail, onSelect: id => syncState({ focus: id }) });
        if (disposed || failed) { mounted?.dispose?.(); return; }
        engine = mounted; engine?.setPaused?.(state.paused); engine?.setLightingMode?.('day');
        refresh();
      } catch (error) { fail(error); }
    }, 0);
  });
  window.addEventListener('pagehide', event => {
    releasePad(); engine?.stopMovement?.();
    if (event.persisted) return;
    disposed = true; cancelAnimationFrame(launchFrame); clearTimeout(launchTimer); engine?.dispose?.();
  });
})();
