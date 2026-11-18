import { drawNotebookAtlas, LEAF_START } from './notebook-geometry.js';
import { paintNotebook } from './notebook-render.js';
import { deskNotebook } from './notebook-on-desk.js';

const mincho='"Study Mincho","Yu Mincho","Hiragino Mincho ProN","Noto Serif CJK JP","Study Gothic",serif';
let atlas;
function printedAtlas() {
  if (!atlas) {
    atlas=document.createElement('canvas');
    atlas.width=atlas.height=1024;drawNotebookAtlas(atlas,mincho);
  }
  return atlas;
}

export function presentNotebook({card,artwork,dismiss,setCover,keyboard=false}) {
  const parent=card.parentNode, sibling=card.nextSibling;
  const close=card.querySelector('.study-link-close'), go=card.querySelector('.study-link-go');
  const object=card.querySelector('.study-link-object');
  const originalTitle=object.textContent, originalClose=close.getAttribute('aria-label');
  const dialog=document.createElement('dialog');
  if(typeof dialog.showModal!=='function') return null;
  const canvas=document.createElement('canvas'), ctx=canvas.getContext('2d');
  if(!ctx) return null;
  const pageAtlas=printedAtlas();
  dialog.className='notebook-inspect';dialog.setAttribute('aria-label','旅の手帖');
  const stage=document.createElement('div');stage.className='notebook-stage';
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','緑の布張りの手帖。開いたページに大隈講堂と唐津城のスケッチ。');
  stage.append(canvas);
  const tools=document.createElement('div');tools.className='notebook-tools';
  function button(text) {
    const el=document.createElement('button');el.type='button';el.textContent=text;
    tools.append(el);return el;
  }
  const cover=button('表紙を閉じる'), turn=button('前のページ');
  const stateText=document.createElement('span');
  stateText.className='visually-hidden';stateText.setAttribute('role','status');stage.append(stateText);
  const oldOverflow=document.documentElement.style.overflow;
  const controller=new AbortController(), {signal}=controller;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const inline=motion.matches ? null : deskNotebook(artwork,pageAtlas);
  let progress=motion.matches?1:0,target=1,frame=0,last=0,alive=true,startDelay=0,w=0,h=0,ratio=1;
  function draw() {
    if(w && h) {
      ctx.setTransform(ratio,0,0,ratio,0,0);
      paintNotebook(ctx,pageAtlas,w,h,progress);
    }
    // The enlargement covers the desk, so its book can rest between opening
    // and dismissal. Closing the dialog animates the same pose onto the desk.
    if(inline && !dialog.open)inline.draw(progress);
  }
  function resize() {
    const rect=stage.getBoundingClientRect();
    w=rect.width;h=rect.height;
    ratio=Math.min(2,window.devicePixelRatio||1,1440/Math.max(w,1));
    const bw=Math.max(1,Math.round(w*ratio)), bh=Math.max(1,Math.round(h*ratio));
    if(canvas.width!==bw || canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
    draw();
  }
  function showState() {
    cover.textContent=target===0?'表紙を開く':'表紙を閉じる';
    cover.setAttribute('aria-expanded',String(target!==0));
    turn.disabled=target===0;
    turn.textContent=target===1?'前のページ':'次のページ';
    stage.dataset.position=target===0?'closed':target===1?'spread':'first';
  }
  function arrived() {
    canvas.setAttribute('aria-label',target===0?'金の模様が入った緑の布表紙と赤いしおり。':target===1?'左に大隈講堂の時計塔、右に唐津城を描いた見開き。':'最初のページの覚え書きと、表紙の裏の見返し。');
    stateText.textContent=target===0?'表紙を閉じました。':target===1?'大隈講堂と唐津城のスケッチ。':'最初のページ。覚え書き。';
  }
  function enlarge() {
    if(dialog.open || !alive)return;
    dialog.append(card);card.classList.add('is-notebook');
    object.textContent='旅の手帖';close.setAttribute('aria-label','手帖をしまう');
    card.append(stage,tools);dialog.showModal();document.documentElement.style.overflow='hidden';
    if(keyboard)go.focus({preventScroll:true});else close.focus({preventScroll:true});
    resize();
  }
  function tick(now) {
    frame=0;if(!alive)return;
    const dt=last ? Math.max(0,now-last) : 0;last=now;
    if(startDelay>0 && dt<startDelay)startDelay-=dt;
    else {
      const step=(dt-startDelay)/1860;startDelay=0;
      const change=Math.max(-step,Math.min(step,target-progress));
      progress+=change;
      if(Math.abs(target-progress)<.0001)progress=target;
      draw();
      if(!dialog.open && progress>=.24)enlarge();
    }
    if(progress!==target)frame=requestAnimationFrame(tick);
    else {last=0;arrived();}
  }
  function aim(next) {
    target=next;startDelay=0;showState();
    if(motion.matches){if(frame)cancelAnimationFrame(frame);frame=0;last=0;progress=target;if(!dialog.open)enlarge();draw();arrived();}
    else if(!frame && target!==progress){last=0;frame=requestAnimationFrame(tick);}
  }
  cover.addEventListener('click',()=>{
    const open=target===0;aim(open?1:0);setCover?.(open);
  },{signal});
  turn.addEventListener('click',()=>aim(target===1?LEAF_START:1),{signal});
  dialog.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();}
    else if(event.key==='ArrowLeft' || event.key==='ArrowRight'){
      event.preventDefault();if(target===0)setCover?.(true);aim(event.key==='ArrowRight'?1:LEAF_START);
    }
  },{signal});
  dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();},{signal});
  dialog.addEventListener('click',event=>{
    if(event.target!==dialog)return;
    const rect=dialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dismiss();
  },{signal});
  const onMotion=()=>aim(target);
  motion.addEventListener?.('change',onMotion);
  let observer;
  function release() {
    if(!alive)return;
    alive=false;controller.abort();motion.removeEventListener?.('change',onMotion);
    observer?.disconnect();cancelAnimationFrame(frame);
    if(dialog.open)dialog.close();
    if(inline){inline.draw(progress);inline.fold(motion.matches);}
    object.textContent=originalTitle;close.setAttribute('aria-label',originalClose);
    card.classList.remove('is-notebook');stage.remove();tools.remove();
    if(sibling?.parentNode===parent)parent.insertBefore(card,sibling);else parent.append(card);
    dialog.remove();document.documentElement.style.overflow=oldOverflow;
  }
  try {
    document.body.append(dialog);
    if(!inline || keyboard || motion.matches)enlarge();
    else inline.draw(0);
    showState();
    observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;
    observer?.observe(stage);window.addEventListener('resize',resize,{signal});resize();
    if(document.fonts?.status==='loading')document.fonts.ready.then(()=>{
      drawNotebookAtlas(pageAtlas,mincho);
      if(alive)draw();
    });
    if(!motion.matches){startDelay=140;frame=requestAnimationFrame(tick);}
    else arrived();
  } catch(error) {release();throw error;}
  return release;
}
