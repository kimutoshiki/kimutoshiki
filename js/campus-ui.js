/* Navigation and content stay functional without the 3D renderer. */
(() => {
'use strict';
const $=(s,c=document)=>c.querySelector(s), $$=(s,c=document)=>[...c.querySelectorAll(s)];
const nav=$('#navigation'),menu=$('#menuToggle'),mobile=matchMedia('(max-width:1180px)');
function close(){nav.classList.remove('active');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','メニューを開く');}
menu?.addEventListener('click',()=>{const open=!nav.classList.contains('active');nav.classList.toggle('active',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'メニューを閉じる':'メニューを開く');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('active')){close();menu?.focus();}});
nav?.addEventListener('click',e=>{if(e.target.closest('a'))close();});
mobile.addEventListener('change',close);
const items=$$('.blog-item');
function openPost(item,open){const head=$('.blog-header',item),content=$('.blog-content',item);head.setAttribute('aria-expanded',String(open));content.hidden=!open;}
items.forEach(item=>{const head=$('.blog-header',item),content=$('.blog-content',item);if(!head||!content)return;head.id=item.id+'-header';content.id=item.id+'-content';head.setAttribute('role','button');head.tabIndex=0;head.setAttribute('aria-controls',content.id);content.setAttribute('role','region');content.setAttribute('aria-labelledby',head.id);openPost(item,false);const toggle=()=>openPost(item,head.getAttribute('aria-expanded')!=='true');head.addEventListener('click',toggle);head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}});});
const filters=$$('.filter-btn');
filters.forEach(b=>{b.type='button';b.setAttribute('aria-pressed',String(b.classList.contains('active')));b.addEventListener('click',()=>{filters.forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});items.forEach(item=>item.hidden=b.dataset.filter!=='all'&&item.dataset.category!==b.dataset.filter);});});
function hashPost(){const item=items.find(x=>'#'+x.id===location.hash);if(item){items.forEach(x=>x.hidden=false);filters.forEach(b=>{b.classList.toggle('active',b.dataset.filter==='all');b.setAttribute('aria-pressed',String(b.dataset.filter==='all'));});openPost(item,true);requestAnimationFrame(()=>item.scrollIntoView({block:'start'}));}}
window.addEventListener('hashchange',hashPost);hashPost();
const list=$('#homeNewsList');
if(list)fetch('blog.html').then(r=>{if(!r.ok)throw Error(r.status);return r.text();}).then(html=>{const doc=new DOMParser().parseFromString(html,'text/html');const posts=$$('.blog-item',doc).slice(0,Number(list.dataset.limit)||5);if(!posts.length)return;const fragment=document.createDocumentFragment();posts.forEach(post=>{const li=document.createElement('li');li.className='news-item';const a=document.createElement('a');a.className='news-link';a.href='blog.html#'+post.id;[['news-date',$('.blog-date',post)?.textContent],['news-cat cat-'+post.dataset.category,$('.cat-badge',post)?.textContent],['news-title',$('.blog-title',post)?.textContent],['news-arrow','→']].forEach(([cls,txt])=>{const span=document.createElement('span');span.className=cls;span.textContent=txt||'';a.append(span);});li.append(a);fragment.append(li);});list.replaceChildren(fragment);}).catch(()=>{});
})();
