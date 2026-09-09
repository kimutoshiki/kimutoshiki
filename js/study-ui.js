/* HTML links stay usable before, during, and without 3D loading. */
(() => {
  const study = document.querySelector('.study');
  const dialog = document.getElementById('reader');
  const pins = document.querySelector('.room-pins');
  const status = document.getElementById('room-status');
  const motion = document.getElementById('motion-toggle');
  const nightButton = document.getElementById('night-toggle');
  const canvas = document.getElementById('study-canvas');
  const zoomLevel = document.getElementById('zoom-level');
  canvas.addEventListener('viewchange', event => {
    const zoom = event.detail?.zoom;
    if (zoomLevel && Number.isFinite(zoom)) zoomLevel.textContent = zoom.toFixed(1) + '×';
    const subject=document.getElementById('view-subject');if(subject&&event.detail.subject)subject.value=event.detail.subject;
    const inspecting=event.detail.subject&&event.detail.subject!=='room';study.classList.toggle('is-inspecting',!!inspecting);
    const caption=document.getElementById('inspection-caption');caption.hidden=!inspecting;
    if(inspecting)caption.textContent=subject.selectedOptions[0].textContent+' · 360°鑑賞';
  });
  canvas.addEventListener('roomtimechange', event => {
    const time=document.getElementById('local-time');
    time.textContent=event.detail.label;time.dateTime=event.detail.dateTime;
    document.getElementById('room-time').hidden=false;
    study.dataset.timePhase=event.detail.phase;
  });
  let engine, opener, ready = false, markers = true, lightingMode = 'auto';
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const panels = {
    profile: ['01', 'プロフィール', '机の名札から、これまでの歩みへ。'],
    research: ['02', '研究・活動', '本棚から、学びと実践の記録へ。'],
    blog: ['03', 'ブログ', '開いたノートから、日々の記録へ。'],
    gallery: ['04', '写真', '壁の額縁から、大切な風景へ。'],
    contact: ['05', 'お問い合わせ', '机の手紙から、ご連絡を。']
  };
  const landmarkPanels = {'landmark-okuma-auditorium':'profile','landmark-okuma-statue':'research','landmark-karatsu-castle':'gallery','landmark-karatsu-bank':'blog'};
  function show(id, source) {
    const panelId = landmarkPanels[id] || id;
    const panel = panels[panelId], template = document.getElementById('panel-' + panelId);
    if (!panel || !template || typeof dialog.showModal !== 'function') return false;
    opener = source || document.activeElement;
    document.getElementById('reader-number').textContent = panel[0] + ' / TOSHIKI KIMURA';
    document.getElementById('reader-title').textContent = panel[1];
    document.getElementById('reader-subtitle').textContent = panel[2];
    document.getElementById('reader-body').replaceChildren(template.content.cloneNode(true));
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    engine?.focus?.(id);
    return true;
  }
  document.querySelectorAll('[data-room-open]').forEach(link => link.addEventListener('click', e => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (show(link.dataset.roomOpen, link)) e.preventDefault();
  }));
  document.querySelectorAll('[data-close-reader]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', e => { if (e.target === dialog) { const b=dialog.getBoundingClientRect(); if(e.clientX<b.left || e.clientX>b.right || e.clientY<b.top || e.clientY>b.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { engine?.focus?.(null); opener?.focus?.({preventScroll:true}); });
  function setPinState() { pins.classList.toggle('hidden-pins', !markers); pins.querySelectorAll('a').forEach(a=>a.tabIndex=ready&&markers?0:-1); }
  document.getElementById('markers-toggle').addEventListener('click', e => {markers=!markers;e.currentTarget.setAttribute('aria-pressed',String(markers));setPinState();});
  motion.addEventListener('click', () => {paused=!paused;engine?.setPaused?.(paused);motion.setAttribute('aria-pressed',String(paused));motion.setAttribute('aria-label',paused?'動きを再開する':'動きを止める');});
  nightButton.addEventListener('click', () => {
    const modes=['auto','day','night'],labels={auto:'自動',day:'昼',night:'夜'};
    lightingMode=modes[(modes.indexOf(lightingMode)+1)%modes.length];
    const next=modes[(modes.indexOf(lightingMode)+1)%modes.length];
    engine?.setLightingMode?.(lightingMode);
    nightButton.textContent='光：'+labels[lightingMode];
    const action=next==='auto'?'端末の時刻に合わせた明かりに戻す':labels[next]+'の明かりに切り替える';
    nightButton.setAttribute('aria-label',nightButton.textContent+'。'+action);nightButton.title=action;
  });
  document.getElementById('view-subject').addEventListener('change',e=>engine?.inspect?.(e.target.value));
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>engine?.preset?.(button.dataset.view)));
  document.getElementById('zoom-in').addEventListener('click',()=>engine?.zoom?.(-.7));
  document.getElementById('zoom-out').addEventListener('click',()=>engine?.zoom?.(.7));
  document.getElementById('view-reset').addEventListener('click',()=>engine?.reset?.());
  function failed(error) { console.error('3D scene could not render',error);status.hidden=true;study.classList.add('is-failed');document.getElementById('room-fallback').hidden=false; }
  import('../scene/study.js?v=20260909-clock').then(async ({mountStudy}) => {
    engine = await mountStudy({canvas:document.getElementById('study-canvas'),pins,onSelect:show,onError:failed,onReady(){ready=true;study.classList.add('is-ready');status.hidden=true;setPinState();}});
    engine?.setPaused?.(paused);engine?.setLightingMode?.(lightingMode);
    motion.setAttribute('aria-pressed',String(paused));
    if (engine?.software) {document.getElementById('render-mode').textContent='· シンプル表示';motion.disabled=true;motion.title='この環境では植物や猫の動きを止めています。時計と明かりは時刻に合わせて更新されます';}
  }).catch(failed);
  window.addEventListener('pagehide', e => {if(!e.persisted)engine?.dispose?.();});
})();
