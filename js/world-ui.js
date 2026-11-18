/* The illustration and menu are native HTML. The renderer starts only on an explicit 3D selection. */
(() => {
  const byId = id => document.getElementById(id);
  const world = byId('main'), canvas = byId('world-canvas');
  const stand = byId('world-stand'), standLabel = byId('world-stand-label'), entryNote = byId('world-entry-note');
  const homePanel = byId('home-panel'), homeMenu = byId('home-menu'), homeIntro = byId('home-intro'), homeEntry = byId('home-entry');
  const clock = byId('world-clock'), phaseLabel = byId('world-time-phase');
  const seat = byId('world-seat'), retry = byId('world-retry'), retryRow = byId('world-retry-row');
  const places = byId('world-places'), settings = byId('world-settings');
  const controls = byId('world-live-controls'), help = byId('world-help');
  const travel = byId('world-travel'), travelLabel = byId('world-travel-label');
  const motion = byId('world-motion'), motionLabel = byId('world-motion-label');
  const lighting = byId('world-lighting'), lightingLabel = byId('world-lighting-label');
  const caption = byId('world-caption'), captionName = byId('world-caption-name'), captionLink = byId('world-caption-link');
  const status = byId('world-status'), locationName = byId('world-location-name');
  const focusButtons = [...document.querySelectorAll('[data-world-focus]')];
  const walkButtons = [...document.querySelectorAll('[data-walk]')];
  const deskButtons = [...document.querySelectorAll('[data-desk-action]')];
  const deskFeedback = byId('world-prop-feedback');
  const mode2D = byId('study-mode-2d'), mode3D = byId('study-mode-3d'), modeStatus = byId('study-mode-status');
  const standDetail = stand.querySelector('small');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const subjects = {
    'landmark-karatsu-castle': { label: '唐津城', href: 'photos.html', link: '写真を見る' },
    'landmark-karatsu-bank': { label: '旧唐津銀行', href: 'blog.html', link: 'ブログを読む' },
    'landmark-okuma-auditorium': { label: '大隈講堂', href: 'research.html', link: '研究・活動を見る' },
    'landmark-okuma-statue': { label: '大隈重信像', href: 'profile.html', link: 'プロフィールを見る' },
    cat: { label: '書斎の猫' },
  };
  const districts = { '大隈講堂前': 'okuma-auditorium', '大隈重信像前': 'okuma-statue', '唐津城・本丸': 'karatsu-castle', '旧唐津銀行通り': 'karatsu-bank' };
  let mode = '2d', engine, rendererContext, disposed = false, firstFrame = false, motionChosen = false;
  let backend = 'native', requestedPlace = null, visitingEngine = null;
  let launching = false, pageSuspended = false, session = 0, modeRevision = 0, loadFailures = 0, wantsSeat = false, seatTimer, clockTimer;
  let viewportObserver, canvasVisible = true, tour, tourImport, lastDeskAction = 0;
  const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function updateClock() {
    const now = new Date(), label = clockFormat.format(now), hour = Number(label.slice(0, 2));
    clock.textContent = label; clock.setAttribute('datetime', now.toISOString());
    const phase = hour < 6 || hour >= 19 ? 'night' : hour < 8 || hour >= 16 ? 'dusk' : 'day';
    phaseLabel.textContent = phase === 'night' ? '夜間' : phase === 'dusk' ? (hour < 8 ? '朝' : '夕方') : '日中';
  }
  function scheduleClock() { clearTimeout(clockTimer); updateClock(); if (!disposed && !document.hidden) clockTimer = setTimeout(scheduleClock, 60000 - Date.now() % 60000 + 20); }
  let state = { catReady: false, landmarksReady: false, outdoorsReady: false, outdoorsLoading: false, paused: reducedMotion.matches, lightingMode: 'auto', seated: true, standing: false, focus: 'room', mode: 'inside', travel: false };
  let announcement = '';
  const held = new Map();
  let assistiveTimer, keyClickTimer, keyClickButton;
  function announce(text) {
    if (text === announcement) return;
    announcement = text; status.textContent = text;
  }
  function syncState(next = {}) {
    if (disposed || mode !== '3d') return;
    state = { ...state, ...next };
    const ready = !!engine && firstFrame && !state.seated && state.posture !== 'standing-up' && state.posture !== 'sitting-down';
    stand.disabled = !engine || !firstFrame || !state.seated;
    for (const button of deskButtons) {
      button.disabled = stand.disabled;
      button.setAttribute('aria-pressed', String(!!state.deskProps?.[button.dataset.deskAction]));
    }
    if (state.deskActionSequence && state.deskActionSequence !== lastDeskAction) {
      lastDeskAction = state.deskActionSequence;
      deskFeedback.textContent = state.deskStatus;
    }
    seat.disabled = !ready;
    if (wantsSeat && state.seated && engine) { clearTimeout(seatTimer); seatTimer = setTimeout(returnToHome, 0); }
    travel.disabled = !ready || (!state.outdoorsReady && !state.outdoorsError && state.mode !== 'outside' && !state.travel);
    focusButtons.forEach(button => { button.disabled = !ready || !(button.dataset.worldFocus === 'cat' ? state.catReady : state.landmarksReady && state.outdoorsReady); });
    walkButtons.forEach(button => { button.disabled = !ready; });
    travelLabel.textContent = state.travel ? '移動を止める' : state.mode === 'outside' ? '部屋へ戻る' : !state.outdoorsReady ? (state.outdoorsError ? '屋外を再読み込み' : '屋外を読み込み中…') : '外へ歩く';
    travel.classList.toggle('is-travelling', !!state.travel);
    retryRow.hidden = !state.outdoorsReady || !state.outdoorsError || state.landmarksReady;
    retry.disabled = !engine || !firstFrame || state.outdoorsLoading;
    locationName.textContent = state.mode === 'outside' ? (state.district || '屋外') : '書斎';
    motion.setAttribute('aria-pressed', String(state.paused));
    motion.setAttribute('aria-label', state.paused ? '風景と猫の動きを再開する' : '風景と猫の動きを止める');
    motionLabel.textContent = state.paused ? '停止中' : '動いています';
    lightingLabel.textContent = {auto:'現在の時刻', day:'昼を眺める', night:'夜を眺める'}[state.lightingMode];
    lighting.setAttribute('aria-label', '光：' + lightingLabel.textContent + '。クリックで切り替え');
    const subject = subjects[state.focus];
    caption.hidden = !firstFrame || state.seated || !subject;
    if (subject) {
      captionName.textContent = subject.label + (state.travel ? 'へ移動中' : '');
      captionLink.hidden = !subject.href;
      if (subject.href) { captionLink.href = subject.href; captionLink.textContent = subject.link + ' ↗'; }
    }
    if (firstFrame && state.seated) announce('書斎を表示しています。机の小物を選ぶか、席を立って外を歩けます。');
    else if (firstFrame && state.posture === 'standing-up') announce('席を立っています。');
    else if (firstFrame) announce(state.travel ? (subject?.label || (state.mode === 'inside' ? '屋外' : '書斎')) + 'へ歩いています。途中で止められます。' : (subject?.label || locationName.textContent) + '。ドラッグで見回し、矢印キーで歩けます。');
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
  function modeChanged() {
    window.dispatchEvent(new Event('study-mode-change'));
  }
  function applyMode(next) {
    mode = next;
    modeRevision++;
    world.dataset.displayMode = next;
    mode2D.setAttribute('aria-pressed', String(next === '2d'));
    mode3D.setAttribute('aria-pressed', String(next === '3d'));
  }
  function showIllustration(message = '') {
    applyMode('2d');
    requestedPlace = null; visitingEngine = null;
    releasePad(); closePanels();
    wantsSeat = false; clearTimeout(seatTimer);
    engine?.stopMovement?.();
    engine?.setStudyActive?.(false);
    engine?.setRenderingActive?.(false);
    world.classList.remove('is-rendered', 'is-loading');
    showHome(true);
    controls.hidden = help.hidden = caption.hidden = true;
    canvas.tabIndex = -1; canvas.setAttribute('aria-hidden', 'true');
    for (const button of [...deskButtons, ...walkButtons, ...focusButtons, seat, travel, retry]) button.disabled = true;
    stand.disabled = false; standLabel.textContent = '外をのぞいてみる';
    if (standDetail) standDetail.textContent = '早稲田と唐津の4か所';
    modeStatus.textContent = message; entryNote.hidden = true;
    modeChanged();
  }
  function fail(error) {
    if (disposed) return;
    const showMessage = mode === '3d';
    session++; loadFailures++; launching = false; firstFrame = false;
    releasePad(); engine?.stopMovement?.();
    engine?.dispose?.(); engine = undefined;
    if (rendererContext?.isContextLost?.()) rendererContext = undefined;
    backend = 'native';
    lastDeskAction = 0;
    const message = showMessage ? '3Dを読み込めませんでした。2Dで表示しています。「3D」を選ぶと、もう一度読み込みます。' : '';
    showIllustration(message);
    console.warn('Unable to open the 3D study:', error);
  }
  function showHome(show) {
    homePanel.hidden = !show; homeMenu.hidden = !show; homeIntro.hidden = !show; homeEntry.hidden = !show;
    world.classList.toggle('is-walking', !show);
    controls.hidden = show || !firstFrame; help.hidden = show || !firstFrame;
    if (mode === '3d' && engine && firstFrame) window.dispatchEvent(new Event('resize'));
    const skip = document.querySelector('.skip-link'); if (skip) skip.href = show ? '#home-menu' : '#walking-navigation';
  }
  function returnToHome() {
    if (disposed || mode !== '3d' || !wantsSeat || !engine || !state.seated) return;
    wantsSeat = false; releasePad(); closePanels(); caption.hidden = true;
    // Keep the renderer, model instances and decoded textures for the next rise.
    showHome(true); stand.disabled = false; standLabel.textContent = '席を立つ';
    stand.focus({ preventScroll: true }); announce('席に戻りました。各ページのメニューをご利用いただけます。');
  }
  function ready() {
    if (disposed) return;
    firstFrame = true;
    if (mode !== '3d') return;
    canvas.tabIndex = 0; canvas.removeAttribute('aria-hidden');
    world.classList.add('is-rendered'); world.classList.remove('is-loading');
    modeStatus.textContent = backend === 'software' ? '3Dモデルを表示しています。' : ''; entryNote.hidden = true;
    syncState(); modeChanged();
    visitRequestedPlace();
  }
  canvas.addEventListener('worldstate', event => { if (engine || launching) syncState(event.detail); });
  canvas.addEventListener('study-notebook-set', ({ detail }) => {
    if (mode !== '3d' || !firstFrame || !engine || !state.seated || typeof detail?.open !== 'boolean') return;
    if (engine.getState().deskProps?.notebook !== detail.open) engine.interactDesk('notebook',{reveal:false});
  });
  canvas.addEventListener('study-look',({detail})=>{
    if(mode==='3d'&&firstFrame&&state.seated)engine?.look?.(detail.dx,detail.dy);
  });
  canvas.addEventListener('study-object-action',event=>{
    const {id,source}=event.detail||{};
    if(!engine||mode!=='3d'||!state.seated||!['notebook','letter'].includes(id))return;
    event.preventDefault();
    if(engine.getState().deskProps?.[id])canvas.dispatchEvent(new CustomEvent('studysubject',{detail:{key:id==='notebook'?'blog':'contact',type:'select',source}}));
    else engine.interactDesk(id,{source});
  });
  for (const button of deskButtons) button.addEventListener('click', () => {
    if (!engine || button.disabled || !state.seated) return;
    engine.interactDesk(button.dataset.deskAction,{source:button});
  });
  travel.addEventListener('click', () => {
    if (!engine || travel.disabled) return;
    releasePad(); closePanels();
    if (state.outdoorsError && !state.outdoorsReady) engine.prewarmExterior?.();
    else if (state.travel) engine.stopMovement?.();
    else if (state.mode === 'outside') engine.returnHome?.();
    else engine.leave?.();
    refresh(); canvas.focus({ preventScroll: true });
  });
  retry.addEventListener('click', () => {
    if (!engine || retry.disabled || retryRow.hidden) return;
    engine.prewarmExterior?.(); refresh();
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
    requestedPlace = null; visitingEngine = null; releasePad(); closePanels(); wantsSeat = true;
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
      if (!engine || disposed || mode !== '3d' || button.disabled || event.button > 0) return;
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
      if (!engine || disposed || mode !== '3d' || button.disabled || event.ctrlKey || event.altKey || event.metaKey || ![' ', 'Enter'].includes(event.key)) return;
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
      if (!engine || disposed || mode !== '3d' || button.disabled || event.detail !== 0 || keyClickButton === button || [...held.keys()].some(key => key !== 'assistive')) return;
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
    if (mode !== '3d' || event.key !== 'Escape') return;
    releasePad(); engine?.stopMovement?.(); refresh();
    const opened = places.open ? places : settings.open ? settings : null;
    closePanels(); opened?.querySelector('summary')?.focus();
  });
  window.addEventListener('blur', releasePad);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releasePad(); clearTimeout(clockTimer);
      engine?.setStudyActive?.(false); engine?.setRenderingActive?.(false);
    } else if (!disposed && !pageSuspended) {
      scheduleClock();
      if (mode === '3d') {
        if (engine) resumeEngine();
        else launch();
      }
    }
  });
  reducedMotion.addEventListener?.('change', event => {
    if (motionChosen || disposed) return;
    state.paused = event.matches; engine?.setPaused?.(state.paused); syncState();
  });
  async function openGarden(key) {
    const revision = modeRevision;
    try {
      tourImport ??= import('./study-tour.js?v=20261118-atelier1');
      const { createGardenTour } = await tourImport;
      if (disposed || mode !== '2d' || revision !== modeRevision) return;
      tour ??= createGardenTour(stand, { onExplore: key => {
        if (!subjects['landmark-' + key]) return;
        requestedPlace = key;
        select3D();
        visitRequestedPlace();
      } });
      tour.open(key);
    } catch {
      tourImport = undefined;
      if (!disposed && mode === '2d' && revision === modeRevision) modeStatus.textContent = '外の景色を読み込めませんでした。もう一度ボタンを押してください。';
    }
  }
  stand.addEventListener('click', () => {
    if (disposed) return;
    if (mode === '2d') { openGarden(); return; }
    if (!engine || !firstFrame || !state.seated) return;
    requestedPlace = null; visitingEngine = null; wantsSeat = false; releasePad(); closePanels(); showHome(false);
    if (engine.standUp?.() === false) { showHome(true); return; }
    refresh(); canvas.focus({ preventScroll: true });
  });
  function visitRequestedPlace() {
    if (!requestedPlace || !firstFrame || !engine || mode !== '3d' || document.hidden || pageSuspended) return;
    if (visitingEngine === engine) return;
    const key = requestedPlace, currentEngine = engine;
    visitingEngine = engine; wantsSeat = false;
    releasePad(); closePanels(); showHome(false);
    refresh(); canvas.focus({ preventScroll: true });
    Promise.resolve().then(() => {
      if (requestedPlace !== key || visitingEngine !== currentEngine) return false;
      return key === 'garden' ? currentEngine.leave() : currentEngine.explorePlace(key);
    }).catch(() => false).then(arrived => {
      if (disposed || requestedPlace !== key || visitingEngine !== currentEngine) return;
      visitingEngine = null;
      if (document.hidden || pageSuspended) return;
      if (arrived === false) {
        if (backend === 'native') { backendFailed(new Error('Outdoor arrival failed')); return; }
        showIllustration('この場所を開けませんでした。「外をのぞいてみる」からもう一度選んでください。');
        stand.focus({ preventScroll: true });
      } else requestedPlace = null;
    });
  }
  function resumeEngine() {
    engine.setStudyActive?.(true);
    engine.setRenderingActive?.(canvasVisible && !document.hidden);
    state = { ...state, ...engine.getState() };
    wantsSeat = state.posture === 'sitting-down' || state.posture === 'returning-to-seat';
    showHome(state.seated);
    if (firstFrame) ready();
    refresh();
  }
  function backendFailed(error) {
    if (disposed) return;
    if (backend === 'software') { fail(error); return; }
    // A disabled/lost WebGL context or a failed native import can still use a
    // real perspective scene with the browser's ordinary Canvas 2D backend.
    if (!requestedPlace && mode === '3d' && state.mode === 'outside') {
      requestedPlace = districts[state.district] || 'garden';
    }
    session++; launching = false; firstFrame = false; backend = 'software'; visitingEngine = null;
    releasePad(); engine?.stopMovement?.(); engine?.dispose?.(); engine = undefined;
    lastDeskAction = 0; wantsSeat = false;
    state = { ...state, seated: true, posture: 'seated', mode: 'inside', travel: false, focus: 'room', deskActionSequence: 0 };
    if (mode !== '3d') return;
    world.classList.remove('is-rendered'); world.classList.add('is-loading');
    showHome(true); stand.disabled = true;
    canvas.tabIndex = -1; canvas.setAttribute('aria-hidden', 'true');
    for (const button of [...deskButtons, ...walkButtons, ...focusButtons, seat, travel, retry]) button.disabled = true;
    modeStatus.textContent = '書斎の3Dモデルを読み込んでいます…';
    if (!pageSuspended && !document.hidden) launch();
  }
  // Some browsers offer WebGL2 through a CPU driver. The textured Canvas
  // renderer draws the same walks much faster on those devices.
  async function launch() {
    if (disposed || launching || engine || mode !== '3d' || pageSuspended || document.hidden) return;
    launching = true;
    const id = ++session, kind = backend;
    const current = () => !disposed && id === session;
    try {
      let mount;
      if (kind === 'native') {
        rendererContext ??= canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
        if (!rendererContext || rendererContext.isContextLost?.()) throw new Error('WebGL2 is unavailable');
        const url = '../scene/world.bundle.js?v=20261118-atelier1' + (loadFailures ? '&retry=' + loadFailures : '');
        const { mountWorld } = await import(url);
        mount = mountWorld;
      } else {
        const url = './blender-software-world.js?v=20261118-atelier1' + (loadFailures ? '&retry=' + loadFailures : '');
        const { mountSoftwareWorld } = await import(url);
        mount = mountSoftwareWorld;
      }
      if (!current() || mode !== '3d' || pageSuspended || document.hidden) return;
      const mounted = await mount({ canvas, rendererContext, seated: true, autoTime: true, reducedMotion: state.paused,
        onReady: () => { if (current()) ready(); },
        onError: error => { if (current()) backendFailed(error); },
        onSelect: focus => { if (current()) syncState({ focus }); },
      });
      if (!current()) { mounted?.dispose?.(); return; }
      if (!mounted || (kind === 'native' && mounted.getState?.().webgl === false)) {
        mounted?.dispose?.(); throw new Error('The 3D study could not start');
      }
      engine = mounted;
      if (state.lightingMode !== 'auto') engine.setLightingMode?.(state.lightingMode);
      engine.setPaused?.(state.paused);
      if (mode === '3d' && !pageSuspended && !document.hidden) resumeEngine();
      else {
        engine.setStudyActive?.(false);
        engine.setRenderingActive?.(false);
      }
    } catch (error) {
      if (current()) backendFailed(error);
    } finally {
      if (current()) launching = false;
    }
  }
  function select3D() {
    if (disposed || mode === '3d') return;
    applyMode('3d');
    standLabel.textContent = '席を立つ';
    if (standDetail) standDetail.textContent = '早稲田と唐津を歩く';
    if (engine) resumeEngine();
    else {
      modeStatus.textContent = '3Dの書斎を読み込んでいます…';
      world.classList.add('is-loading');
      stand.disabled = true;
      modeChanged();
      launch();
    }
  }
  mode2D.addEventListener('click', () => {
    if (disposed || mode === '2d') return;
    const place = state.mode === 'outside' && districts[state.district];
    showIllustration(); announce('2Dの書斎を表示しています。');
    if (place) openGarden(place);
  });
  mode3D.addEventListener('click', select3D);
  showIllustration(); scheduleClock();
  if (typeof IntersectionObserver !== 'undefined') {
    viewportObserver = new IntersectionObserver(entries => {
      canvasVisible = entries.some(entry => entry.isIntersecting);
      engine?.setRenderingActive?.(mode === '3d' && canvasVisible && !document.hidden);
    }, { rootMargin: '120px' });
    viewportObserver.observe(canvas);
  }
  window.addEventListener('pagehide', event => {
    releasePad(); engine?.stopMovement?.(); clearTimeout(clockTimer);
    if (event.persisted) {
      pageSuspended = true;
      engine?.setStudyActive?.(false); engine?.setRenderingActive?.(false);
      return;
    }
    disposed = true; session++; clearTimeout(seatTimer);
    viewportObserver?.disconnect(); tour?.destroy(); engine?.dispose?.();
  });
  window.addEventListener('pageshow', () => {
    if (disposed) return;
    pageSuspended = false;
    scheduleClock();
    if (mode === '3d') {
      if (engine) resumeEngine();
      else launch();
    }
  });
})();
