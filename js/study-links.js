// Native menu and illustration links stay usable before this enhancement loads.
const pages = {
  profile: {page:'プロフィール',object:'大隈重信像'},
  research: {page:'研究・活動',object:'大隈講堂の時計塔'},
  blog: {page:'ブログ',object:'緑のノート'},
  photos: {page:'写真',object:'唐津城'},
  contact: {page:'お問い合わせ',object:'机の上の封筒'},
};

// Silhouettes traced on the 3:2 study illustration. The original artwork uses
// the same crop in all responsive image files. Fractions reference its pixels.
const outlines = {
  profile: [[.387,.475],[.398,.392],[.408,.388],[.402,.343],[.401,.306],[.41,.282],[.407,.271],[.423,.265],[.43,.279],[.424,.289],[.434,.302],[.436,.35],[.427,.385],[.439,.394],[.448,.477]],
  research: [[.211,.465],[.217,.329],[.24,.321],[.246,.385],[.327,.381],[.344,.397],[.342,.442],[.357,.45],[.354,.48],[.217,.482]],
  blog: [[.361,.485],[.499,.487],[.516,.551],[.506,.561],[.348,.565],[.346,.546]],
  photos: [[.491,.473],[.504,.419],[.519,.415],[.519,.385],[.538,.378],[.541,.346],[.552,.341],[.554,.322],[.568,.32],[.58,.302],[.59,.32],[.602,.336],[.599,.349],[.613,.367],[.607,.387],[.625,.404],[.622,.423],[.642,.442],[.647,.485],[.493,.487]],
  contact: [[.535,.515],[.632,.505],[.655,.546],[.548,.557]],
};
function illustratedObjectAt(artwork,event) {
  const image=artwork.querySelector('img');
  if(!image?.naturalWidth) return null;
  const rect=image.getBoundingClientRect();
  if(!rect.width || !rect.height) return null;
  const css=getComputedStyle(image), w=image.naturalWidth, h=image.naturalHeight;
  const scale=css.objectFit==='contain' ? Math.min(rect.width/w,rect.height/h) : Math.max(rect.width/w,rect.height/h);
  const width=css.objectFit==='fill' ? rect.width : w*scale, height=css.objectFit==='fill' ? rect.height : h*scale;
  const [px,py]=css.objectPosition.split(/\s+/);
  function offset(token,space) {
    if(token?.endsWith('%')) return space*parseFloat(token)/100;
    if(token?.endsWith('px')) return parseFloat(token);
    if(token==='left'||token==='top')return 0;
    if(token==='right'||token==='bottom')return space;
    return space/2;
  }
  const x=(event.clientX-rect.left-offset(px,rect.width-width))/width;
  const y=(event.clientY-rect.top-offset(py,rect.height-height))/height;
  if(x>=.141 && x<=.237 && y>=.47 && y<=.532) return 'profile';
  for(const [key,polygon] of Object.entries(outlines)) {
    let inside=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const [ax,ay]=polygon[i], [bx,by]=polygon[j];
      if((ay>y)!==(by>y) && x < (bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
    }
    if(inside) return key;
  }
  return null;
}

export function mountStudyLinks(world) {
  const frame=world.querySelector('.desk-view'), artwork=world.querySelector('#study-artwork');
  const menu=world.querySelector('#home-menu'), canvas=world.querySelector('#world-canvas');
  if (!frame || !menu || !artwork || !canvas) return null;
  const illustrated=[...artwork.querySelectorAll('a[data-illustration-link]')];
  const menuLinks=[...menu.querySelectorAll('a[data-study-link]')];
  const keyOf=el=>el?.dataset.studyLink || el?.dataset.illustrationLink || el?.dataset.liveLink;
  const layer=document.createElement('div');
  layer.className='study-link-layer';layer.hidden=true;layer.setAttribute('role','group');layer.setAttribute('aria-label','机の上のメニュー');
  frame.append(layer);
  const card=document.createElement('div');
  card.className='study-link-card';card.id='study-link-card';card.hidden=true;card.setAttribute('role','group');
  const object=document.createElement('span');object.className='study-link-object';
  const go=document.createElement('a');go.className='study-link-go';
  const close=document.createElement('button');close.className='study-link-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','案内を閉じる');
  card.append(object,go,close);frame.append(card);
  const controller=new AbortController(), {signal}=controller;
  const on=(el,event,listener)=>el.addEventListener(event,listener,{signal});
  let selected=null,hovered=null,focused=null,opener=null;
  let points={},seated=true,mode=null;
  const live=new Map();
  // Copy the same marker artwork/label used by the illustrated view. A real
  // link in the card follows selection, leaving the first notebook tap free.
  for(const original of illustrated){
    const key=keyOf(original);
    if (!pages[key]) continue;
    const pin=document.createElement('button');
    pin.type='button';pin.className='study-pin study-live-pin';pin.dataset.liveLink=key;
    pin.setAttribute('aria-label',pages[key].object+'・'+pages[key].page+'の案内');
    pin.setAttribute('aria-controls',card.id);pin.setAttribute('aria-expanded','false');
    pin.replaceChildren(...[...original.childNodes].map(node=>node.cloneNode(true)));
    pin.hidden=true;live.set(key,pin);layer.append(pin);
  }
  const pins=[...illustrated,...live.values()], all=[...menuLinks,...pins];
  function highlight() {
    const key=hovered || focused || selected;
    for(const el of all) el.classList.toggle('is-linked',!!key && keyOf(el)===key);
  }
  let viewer=null, revision=0, loadingNotebook=false;
  function releaseNotebook() {
    revision++;loadingNotebook=false;
    viewer?.();viewer=null;
  }
  function hideCard(returnFocus=false) {
    releaseNotebook();
    if (returnFocus && selected && opener?.isConnected) opener.focus({preventScroll:true});
    selected=null;opener=null;card.hidden=true;artwork.removeAttribute('data-notebook-open');
    for(const pin of pins) pin.setAttribute('aria-expanded','false');
    highlight();
  }
  function select(key,source,moveFocus=false) {
    if (!pages[key] || mode==='off' || key==='blog' && selected===key && viewer) return;
    const link=menuLinks.find(el=>keyOf(el)===key);
    if (!link) return;
    hovered=null;
    if(focused!==key) focused=null;
    if(selected!==key) releaseNotebook();
    selected=key;opener=source || (mode==='live' ? live.get(key) : illustrated.find(el=>keyOf(el)===key));
    card.setAttribute('aria-label',pages[key].object+'の案内');
    object.textContent=pages[key].object;
    go.href=link.href;go.textContent=pages[key].page+'へ';
    card.hidden=false;
    artwork.toggleAttribute('data-notebook-open',mode==='illustration' && key==='blog');
    for(const pin of pins) pin.setAttribute('aria-expanded',String(key===keyOf(pin)));
    highlight();
    if(key==='blog' && !viewer && !loadingNotebook) {
      const request=++revision;
      loadingNotebook=true;
      // Keep the ordinary card and its native link usable while importing.
      import('./notebook-view.js?v=20261118-atelier1').then(({presentNotebook})=>{
        if(request!==revision || selected!=='blog' || signal.aborted)return;
        loadingNotebook=false;
        const setCover=mode==='live' ? open=>canvas.dispatchEvent(new CustomEvent('study-notebook-set',{detail:{open}})) : null;
        viewer=presentNotebook({card,artwork:mode==='illustration' ? artwork : null,setCover,dismiss:()=>hideCard(true),keyboard:moveFocus});
      }).catch(()=>{if(request===revision)loadingNotebook=false;});
    }
    if (moveFocus && !viewer) go.focus({preventScroll:true});
  }
  function updateLivePositions() {
    if (mode!=='live') return;
    for(const [key,button] of live) {
      const point=points[key];
      button.hidden=!point;
      if(!point) continue;
      button.style.left=(point[0]*100)+'%';button.style.top=(point[1]*100)+'%';
      button.dataset.side=point[0]>.64 ? 'right' : 'left';
    }
    if (selected && !points[selected] && !viewer) hideCard();
  }
  function synchronizeMode() {
    const walking=world.classList.contains('is-walking');
    const next=world.dataset.displayMode!=='3d' ? 'illustration' :
      !walking && seated && world.classList.contains('is-rendered') ? 'live' : 'off';
    if(next!==mode) {hideCard();hovered=null;focused=null;mode=next;highlight();}
    layer.hidden=mode!=='live';
    if(!layer.hidden) updateLivePositions();
  }
  for(const el of all){
    const key=keyOf(el);
    if (!pages[key]) continue;
    on(el,'pointerenter',e=>{if(e.pointerType!=='touch'){hovered=key;highlight();}});
    on(el,'pointerleave',()=>{if(hovered===key){hovered=null;highlight();}});
    on(el,'focus',()=>{focused=key;highlight();});
    on(el,'blur',()=>{if(focused===key){focused=null;highlight();}});
  }
  // A marker occupies real screen space on top of a mesh. Treat a drag which
  // starts on the marker exactly like a drag which starts on the canvas.
  let swallowed=null;
  for(const pin of live.values()){
    let held=null;
    on(pin,'pointerdown',event=>{
      if(event.button!==0||held||mode!=='live')return;
      swallowed=null;
      held={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
      pin.setPointerCapture?.(event.pointerId);
    });
    on(pin,'pointermove',event=>{
      if(!held||held.id!==event.pointerId||mode!=='live')return;
      const x=event.clientX-held.x,y=event.clientY-held.y;
      if(!held.moved&&Math.hypot(x,y)<6)return;
      held.moved=true;swallowed=pin;held.x=event.clientX;held.y=event.clientY;
      const rect=canvas.getBoundingClientRect();
      if(rect.width&&rect.height)canvas.dispatchEvent(new CustomEvent('study-look',{detail:{dx:-2.7*x/rect.width,dy:1.7*y/rect.height}}));
    });
    const end=event=>{if(held?.id===event.pointerId)held=null;};
    on(pin,'pointerup',end);on(pin,'pointercancel',end);on(pin,'lostpointercapture',end);
  }
  for(const el of pins){
    const key=keyOf(el);
    el.setAttribute('aria-controls',card.id);el.setAttribute('aria-expanded','false');
    on(el,'click',event=>{
      if(swallowed===el && event.detail!==0){event.preventDefault();swallowed=null;return;}
      // Preserve modifier clicks and a second activation on an illustration link.
      if(event.ctrlKey || event.metaKey || event.shiftKey || event.altKey ||
         (selected===key && el.tagName==='A')) return;
      event.preventDefault();
      if(mode==='live' && ['blog','contact'].includes(key)){
        const handled=!canvas.dispatchEvent(new CustomEvent('study-object-action',{cancelable:true,
          detail:{id:key==='blog'?'notebook':'letter',source:el}}));
        if(handled)return;
      }
      select(key,el,event.detail===0);
    });
  }
  on(artwork,'pointermove',event=>{
    if(mode!=='illustration' || event.pointerType==='touch' || event.target.closest('a,button')) return;
    const key=illustratedObjectAt(artwork,event);
    artwork.style.cursor=key?'pointer':'';
    if(hovered!==key){hovered=key;highlight();}
  });
  on(artwork,'pointerleave',()=>{artwork.style.cursor='';hovered=null;highlight();});
  on(artwork,'click',event=>{
    if(mode!=='illustration' || event.target.closest('a,button')) return;
    const key=illustratedObjectAt(artwork,event);
    if(!key) {hideCard();return;}
    const anchor=illustrated.find(el=>keyOf(el)===key);
    if(selected===key && anchor) anchor.click();
    else select(key,anchor);
  });
  on(close,'click',()=>hideCard(true));
  on(document,'keydown',e=>{if(e.key==='Escape' && !card.hidden){e.preventDefault();hideCard(true);}});
  on(canvas,'study-notebook-open',event=>{if(mode==='live')select('blog',event.detail?.source || canvas);});
  on(canvas,'studyprojection',({detail})=>{points=detail?.points || {};updateLivePositions();});
  on(canvas,'studysubject',({detail})=>{
    if(mode!=='live' || !detail) return;
    if(detail.type==='hover'){hovered=pages[detail.key]?detail.key:null;highlight();}
    if(detail.type==='select' && pages[detail.key]) select(detail.key,detail.source||canvas,detail.source?.matches?.(':focus-visible')||false);
  });
  on(canvas,'worldstate',({detail})=>{
    if(typeof detail?.seated==='boolean') seated=detail.seated;
    synchronizeMode();
  });
  on(window,'study-mode-change',synchronizeMode);
  const observer=new MutationObserver(synchronizeMode);
  observer.observe(world,{attributes:true,attributeFilter:['class','data-display-mode']});
  observer.observe(artwork,{attributes:true,attributeFilter:['hidden','aria-hidden','class']});
  synchronizeMode();
  return ()=>{controller.abort();observer.disconnect();releaseNotebook();card.remove();layer.remove();};
}

if(typeof document!=='undefined'){
  const root=document.getElementById('main');
  if(root) mountStudyLinks(root);
}
