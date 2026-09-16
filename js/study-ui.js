/* Navigation remains useful while the room prepares, and if WebGL is unavailable. */
(() => {
  const study = document.querySelector('.study');
  const reader = document.getElementById('reader');
  const pins = document.querySelector('.room-pins');
  const status = document.getElementById('room-status');
  const canvas = document.getElementById('study-canvas');
  const settings = document.getElementById('room-settings');
  const settingsToggle = document.getElementById('settings-toggle');
  const movement = document.getElementById('free-movement');
  const movementControls = document.getElementById('movement-controls');
  const subject = document.getElementById('view-subject');
  const motion = document.getElementById('motion-toggle');
  const nightButton = document.getElementById('night-toggle');
  let engine, opener, ready = false, markers = false, lightingMode = 'auto';
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let galleryModule;
  const gallery = () => galleryModule ||= import('./photo-gallery.js?v=20260916-cat3');
  const intros = ['木村紀喜。佐賀県唐津市出身。', '早稲田大学教職大学院で学んでいます。', '子どもたちの「前向きに生きる力」を育てたい。', '授業づくりと、教育研究に取り組んでいます。'];
  let introIndex = 0;
  const introTimer = setInterval(() => {
    if (status.hidden) return;
    introIndex = (introIndex + 1) % intros.length;
    const line = document.getElementById('loading-intro');
    line.textContent = intros[introIndex];
    document.getElementById('loading-index').textContent = String(introIndex + 1).padStart(2, '0') + ' / 04';
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) line.animate([{opacity:0, transform:'translateY(5px)'},{opacity:1, transform:'translateY(0)'}], {duration:450});
  }, 3000);
  function finishLoading() { clearInterval(introTimer); clearTimeout(slowTimer); status.hidden = true; }
  // A delayed renderer must never obscure the working navigation indefinitely.
  const slowTimer = setTimeout(() => { finishLoading(); document.getElementById('room-fallback').hidden = false; }, 18000);
  const panels = {
    profile: ['01', 'プロフィール', ''], research: ['02', '研究・活動', ''], blog: ['03', 'ブログ', ''],
    gallery: ['04', '写真', '旅先と、日々の風景。'], contact: ['05', 'お問い合わせ', '']
  };
  const landmarkPanels = {'landmark-okuma-auditorium':'profile','landmark-okuma-statue':'research','landmark-karatsu-castle':'gallery','landmark-karatsu-bank':'blog'};
  function show(id, source) {
    if (id.startsWith('nav-')) {
      const href = {profile:'profile.html',research:'research.html',blog:'blog.html',gallery:'photos.html',contact:'contact.html'}[id.slice(4)];
      if (href) {location.assign(href);return true;}
    }
    if (id.startsWith('photo-')) {
      gallery().then(module => module.openPhotoById(id.slice(6), source)).catch(() => { location.href = 'photos.html'; });
      return true;
    }
    const panelId = landmarkPanels[id] || id;
    const panel = panels[panelId], template = document.getElementById('panel-' + panelId);
    if (!panel || !template || typeof reader.showModal !== 'function') return false;
    opener = source || document.activeElement;
    document.getElementById('reader-number').textContent = panel[0] + ' / TOSHIKI KIMURA';
    document.getElementById('reader-title').textContent = panel[1];
    const subtitle = document.getElementById('reader-subtitle');
    subtitle.textContent = panel[2]; subtitle.hidden = !panel[2];
    const body = document.getElementById('reader-body');
    body.replaceChildren(template.content.cloneNode(true));
    if (panelId === 'gallery') gallery().then(module => module.populateGallery(body.querySelector('[data-photo-gallery]'))).catch(() => {});
    if (settings.open) settings.close();
    if (!reader.open) reader.showModal();
    reader.scrollTop = 0;
    return true;
  }
  document.querySelectorAll('[data-room-open]').forEach(link => link.addEventListener('click', event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (show(link.dataset.roomOpen, link)) event.preventDefault();
  }));
  document.querySelectorAll('[data-close-reader]').forEach(button => button.addEventListener('click', () => reader.close()));
  reader.addEventListener('close', () => { opener?.focus?.({preventScroll:true}); });
  function closeOnBackdrop(dialog) {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    });
  }
  closeOnBackdrop(reader); closeOnBackdrop(settings);
  settingsToggle.addEventListener('click', () => {
    if (settings.open) settings.close();
    else { settings.showModal(); settingsToggle.setAttribute('aria-expanded', 'true'); }
  });
  document.getElementById('settings-close').addEventListener('click', () => settings.close());
  settings.addEventListener('close', () => {settingsToggle.setAttribute('aria-expanded','false');settingsToggle.focus({preventScroll:true});});
  function setPinState() {
    pins.classList.toggle('hidden-pins', !markers);
    pins.querySelectorAll('a').forEach(link => link.tabIndex = ready && markers ? 0 : -1);
  }
  document.getElementById('markers-toggle').addEventListener('click', event => {
    markers = !markers;
    event.currentTarget.setAttribute('aria-pressed', String(markers));
    event.currentTarget.setAttribute('aria-label', markers ? '案内を非表示にする' : '案内を表示する');
    document.getElementById('markers-label').textContent = markers ? '表示' : '非表示';
    setPinState();
  });
  function updateMotion() {
    motion.setAttribute('aria-pressed', String(paused));
    motion.setAttribute('aria-label', paused ? '動きを再開する' : '動きを止める');
    document.getElementById('motion-label').textContent = paused ? '停止中' : '再生中';
  }
  motion.addEventListener('click', () => {paused = !paused;engine?.setPaused?.(paused);updateMotion();});
  updateMotion();
  nightButton.addEventListener('click', () => {
    const modes = ['auto','day','night'], labels = {auto:'自動',day:'昼',night:'夜'};
    lightingMode = modes[(modes.indexOf(lightingMode) + 1) % modes.length];
    const next = modes[(modes.indexOf(lightingMode) + 1) % modes.length];
    engine?.setLightingMode?.(lightingMode);
    document.getElementById('lighting-label').textContent = labels[lightingMode];
    nightButton.setAttribute('aria-label', '光：' + labels[lightingMode] + '。' + labels[next] + 'に切り替える');
  });
  movement.addEventListener('change', () => {
    engine?.setFreeMovement?.(movement.checked);
    movementControls.disabled = !movement.checked;
    study.classList.toggle('free-movement', movement.checked);
    if (!movement.checked) { subject.value = 'room'; document.getElementById('inspection-caption').hidden = true; }
  });
  subject.addEventListener('change', event => {
    if (!movement.checked) return;
    event.target.value.startsWith('object-') ? engine?.activate?.(event.target.value) : engine?.inspect?.(event.target.value);
  });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {if (movement.checked) engine?.preset?.(button.dataset.view);}));
  document.getElementById('zoom-in').addEventListener('click', () => engine?.zoom?.(-.7));
  document.getElementById('zoom-out').addEventListener('click', () => engine?.zoom?.(.7));
  document.getElementById('view-reset').addEventListener('click', () => engine?.reset?.());
  canvas.addEventListener('viewchange', event => {
    const value = event.detail.action || event.detail.subject;
    if (value && [...subject.options].some(option => option.value === value)) subject.value = value;
    const caption = document.getElementById('inspection-caption');
    caption.hidden = !movement.checked || !value || value === 'room';
    caption.textContent = event.detail.label || subject.selectedOptions[0]?.textContent || '';
  });
  canvas.addEventListener('roomtimechange', event => {
    const time = document.getElementById('local-time');
    time.textContent = event.detail.label; time.dateTime = event.detail.dateTime;
    document.getElementById('room-time').hidden = false;
    study.dataset.timePhase = event.detail.phase;
  });
  canvas.addEventListener('roomloadprogress', event => {
    const progress = Number(event.detail?.progress);
    if (Number.isFinite(progress)) status.querySelector('.loading-rule > span').style.transform = `scaleX(${Math.max(.04, Math.min(1, progress))})`;
  });
  function failed(error) {
    console.error('3D scene could not render', error);
    finishLoading(); study.classList.add('is-failed'); document.getElementById('room-fallback').hidden = false;
  }
  import('../scene/study.js?v=20260916-cat3').then(async ({mountStudy}) => {
    engine = await mountStudy({canvas,pins,onSelect:show,onError:failed,onReady() {
      ready = true; study.classList.add('is-ready'); finishLoading(); document.getElementById('room-fallback').hidden = true; setPinState();
    }});
    engine?.setPaused?.(paused); engine?.setLightingMode?.(lightingMode); engine?.setFreeMovement?.(movement.checked);
    const actionOptions = document.createElement('optgroup'); actionOptions.label = '小物';
    const counts = new Map();
    for (const action of engine?.getActions?.() || []) {
      const count = (counts.get(action.label) || 0) + 1; counts.set(action.label, count);
      const option = document.createElement('option'); option.value = action.id; option.textContent = action.label + (count > 1 ? ' ' + count : ''); actionOptions.append(option);
    }
    if (actionOptions.children.length) subject.append(actionOptions);
    if (engine?.software) {document.getElementById('render-mode').textContent = 'シンプル表示';motion.disabled = true;}
  }).catch(failed);
  window.addEventListener('pagehide', event => {if(!event.persisted){engine?.dispose?.();clearInterval(introTimer);clearTimeout(slowTimer);}});
})();
