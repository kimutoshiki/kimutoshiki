/* A native homepage first. WebGL is imported only after the visitor stands up. */
(() => {
  const byId = id => document.getElementById(id);
  const world = byId('main'), canvas = byId('world-canvas');
  const stand = byId('world-stand'), standLabel = byId('world-stand-label'), entryNote = byId('world-entry-note');
  const homePanel = byId('home-panel'), homeMenu = byId('home-menu'), homeIntro = byId('home-intro'), homeEntry = byId('home-entry');
  const clock = byId('world-clock'), phaseLabel = byId('world-time-phase');
  const seat = byId('world-seat');
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
  let launching = false, session = 0, wantsSeat = false, seatTimer, clockTimer;
  const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let posterPhase = '';
  function updateClock() {
    const now = new Date(), label = clockFormat.format(now), hour = Number(label.slice(0, 2));
    clock.textContent = label; clock.setAttribute('datetime', now.toISOString());
    const phase = hour < 6 || hour >= 19 ? 'night' : hour < 8 || hour >= 16 ? 'dusk' : 'day';
    phaseLabel.textContent = phase === 'night' ? '夜の書斎' : phase === 'dusk' ? (hour < 8 ? '朝の書斎' : '夕暮れの書斎') : '昼の書斎';
    if (phase !== posterPhase) {
      posterPhase = phase;
      const photo = document.querySelector('.world-poster img'), mobile = document.querySelector('.world-poster source');
      if (mobile) mobile.srcset = 'images/world/seated-' + phase + '-mobile.webp';
      if (photo) photo.src = 'images/world/seated-' + phase + '.webp';
    }
  }
  function scheduleClock() { clearTimeout(clockTimer); updateClock(); if (!disposed && !document.hidden) clockTimer = setTimeout(scheduleClock, 60000 - Date.now() % 60000 + 20); }
  let state = { catReady: false, landmarksReady: false, paused: reducedMotion.matches, lightingMode: 'auto', seated: true, standing: false, focus: 'room', mode: 'inside', travel: false };
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
    const ready = !!engine && firstFrame && !state.seated && state.posture !== 'standing-up' && state.posture !== 'sitting-down';
    seat.disabled = !ready;
    if (wantsSeat && state.seated && engine) { clearTimeout(seatTimer); seatTimer = setTimeout(returnToStill, 0); }
    travel.disabled = !ready;
    focusButtons.forEach(button => { button.disabled = !ready || !(button.dataset.worldFocus === 'cat' ? state.catReady : state.landmarksReady); });
    walkButtons.forEach(button => { button.disabled = !ready; });
    travelLabel.textContent = state.travel ? '移動を止める' : state.mode === 'outside' ? '部屋へ戻る' : '外へ歩く';
    travel.classList.toggle('is-travelling', !!state.travel);
    locationName.textContent = state.mode === 'outside' ? '庭' : '書斎';
    motion.setAttribute('aria-pressed', String(state.paused));
    motion.setAttribute('aria-label', state.paused ? '猫の動きを再開する' : '猫の動きを止める');
    motionLabel.textContent = state.paused ? '停止中' : '動いています';
    lightingLabel.textContent = {auto:'現在の時刻', day:'昼を眺める', night:'夜を眺める'}[state.lightingMode];
    lighting.setAttribute('aria-label', '光：' + lightingLabel.textContent + '。クリックで切り替え');
    const subject = subjects[state.focus];
    caption.hidden = !firstFrame || !subject;
    if (subject) {
      captionName.textContent = subject.label + (state.travel ? 'へ移動中' : '');
      captionLink.hidden = !subject.href;
      if (subject.href) { captionLink.href = subject.href; captionLink.textContent = subject.link + ' ↗'; }
    }
    if (firstFrame && state.posture === 'standing-up') announce('席を立っています。');
    else if (firstFrame) announce(state.travel ? (subject?.label || (state.mode === 'inside' ? '庭' : '書斎')) + 'へ歩いています。途中で止められます。' : (subject?.label || locationName.textContent) + '。ドラッグで見回し、矢印キーで歩けます。');
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
    failed = true; launching = false; session++;
    stand.disabled = true; standLabel.textContent = '書斎を眺める';
    entryNote.textContent = 'この環境では散策を起動できません。各ページはメニューからご覧いただけます。';
    world.classList.remove('is-loading'); showHome(true);
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
  function showHome(show) {
    homePanel.hidden = !show; homeMenu.hidden = !show; homeIntro.hidden = !show; homeEntry.hidden = !show;
    const skip = document.querySelector('.skip-link'); if (skip) skip.href = show ? '#home-menu' : '#walking-navigation';
  }
  function returnToStill() {
    if (disposed || !wantsSeat || !engine || !state.seated) return;
    wantsSeat = false; session++; releasePad(); closePanels();
    const previous = engine; engine = undefined; firstFrame = false; previous.dispose?.();
    world.classList.remove('is-live'); controls.hidden = true; help.hidden = true; caption.hidden = true;
    canvas.tabIndex = -1; canvas.setAttribute('aria-hidden', 'true');
    showHome(true); stand.disabled = false; standLabel.textContent = '席を立つ';
    scheduleClock(); stand.focus({ preventScroll: true }); announce('書斎の席に戻りました。各ページをメニューからご覧いただけます。');
  }
  function ready() {
    if (disposed || failed) return;
    firstFrame = true; canvas.tabIndex = 0; canvas.removeAttribute('aria-hidden');
    world.classList.add('is-live'); world.classList.remove('is-loading'); showHome(false); controls.hidden = false; help.hidden = false;
    syncState();
  }
  canvas.addEventListener('worldstate', event => { if (engine || launching) syncState(event.detail); });
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
    state.lightingMode = {auto:'day', day:'night', night:'auto'}[state.lightingMode];
    engine.setLightingMode?.(state.lightingMode); refresh();
  });
  seat.addEventListener('click', () => {
    if (!engine || seat.disabled) return;
    releasePad(); closePanels(); wantsSeat = true;
    if (engine.sitDown?.() === false) wantsSeat = false;
    refresh(); canvas.focus({ preventScroll: true });
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releasePad(); clearTimeout(clockTimer); } else scheduleClock(); });
  reducedMotion.addEventListener?.('change', event => {
    if (motionChosen || failed || disposed) return;
    state.paused = event.matches; engine?.setPaused?.(state.paused); syncState();
  });
  syncState(); scheduleClock();
  stand.addEventListener('click', async () => {
    if (disposed || failed || launching || engine) return;
    launching = true; firstFrame = false; wantsSeat = false;
    state = { ...state, seated: true, standing: false, posture: 'seated', lightingMode: 'auto', focus: 'room', travel: false };
    const currentSession = ++session;
    const active = () => !disposed && !failed && currentSession === session;
    stand.disabled = true; standLabel.textContent = '書斎を開いています…';
    world.classList.add('is-loading'); announce('書斎を開いています。各ページのメニューもご利用いただけます。');
    let started = false;
    function beginWalking() {
      if (!active() || !engine || !firstFrame || started) return;
      started = true; launching = false;
      engine.setPaused?.(state.paused); engine.standUp?.(); refresh(); canvas.focus({ preventScroll: true });
    }
    try {
      const rendererContext = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
      if (!rendererContext) { fail(new Error('WebGL2 is unavailable')); return; }
      const { mountWorld } = await import('../scene/world.bundle.js?v=20261107-seated1');
      if (!active()) return;
      const mounted = await mountWorld({ canvas, rendererContext, seated: true, autoTime: true, reducedMotion: reducedMotion.matches,
        onReady: () => { if (active()) { ready(); beginWalking(); } },
        onError: error => { if (active()) fail(error); },
        onSelect: id => { if (active()) syncState({ focus: id }); },
      });
      if (!active()) { mounted?.dispose?.(); return; }
      engine = mounted; refresh(); beginWalking();
    } catch (error) { if (active()) fail(error); }
  });
  window.addEventListener('pagehide', event => {
    releasePad(); engine?.stopMovement?.(); clearTimeout(clockTimer);
    if (event.persisted) return;
    disposed = true; session++; clearTimeout(seatTimer); engine?.dispose?.();
  });
  window.addEventListener('pageshow', () => { if (!disposed) scheduleClock(); });
})();
