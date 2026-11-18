// Article titles, dates and excerpts come from the same page visitors will read.
// The GLB surface and the accessible reader share one in-flight request, even
// when the rendering module was compiled into its own code-split bundle.
const articleCache=Symbol.for("kimutoshiki.study.notebookArticles");
export function readNotebookArticles(){
  if(!document[articleCache])document[articleCache]=fetch('blog.html',{credentials:'same-origin',cache:'no-cache'}).then(async response=>{
    if(!response.ok)throw new Error('Blog request failed');
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    const articles=[];
    for(const item of doc.querySelectorAll('.blog-item[id]')){
      const text=selector=>item.querySelector(selector)?.textContent.replace(/\s+/g,' ').trim()||'';
      const title=text('.blog-title'),body=text('.blog-content-inner');
      if(!title||!body||/^(本文は)?準備中[。.!！…\s]*$/.test(body))continue;
      const chars=Array.from(body);
      articles.push({title,date:text('.blog-date'),category:text('.cat-badge'),
        excerpt:chars.slice(0,118).join('')+(chars.length>118?'…':''),
        href:'blog.html#'+encodeURIComponent(item.id)});
    }
    if(!articles.length)throw new Error('No published articles');
    return articles;
  }).catch(error=>{delete document[articleCache];throw error;});
  return document[articleCache];
}

export function printNotebookEntries(atlas,posts,index,font){
  const ctx=atlas.getContext('2d');
  function lines(value,x,y,width,size,leading,limit,weight=500){
    ctx.font=weight+' '+size+'px '+font;
    let line='',row=0;const chars=Array.from(value);
    for(let i=0;i<chars.length;i++){
      if(line&&ctx.measureText(line+chars[i]).width>width){
        ctx.fillText(line+(row===limit-1?'…':''),x,y+row*leading);row++;line='';
        if(row===limit)return;
      }
      line+=chars[i];
    }
    if(line)ctx.fillText(line,x,y+row*leading);
  }
  for(const [panel,n] of [[1,index],[2,index],[3,index+1]]){
    const post=posts[n];ctx.save();ctx.translate((panel%2)*512,Math.floor(panel/2)*512);
    ctx.fillStyle='#f1e6c9';ctx.fillRect(0,0,512,512);ctx.textAlign='left';
    ctx.fillStyle='#843f43';ctx.font='600 23px Georgia,serif';ctx.fillText('T. KIMURA  /  JOURNAL',40,49);
    ctx.strokeStyle='#b89770';ctx.beginPath();ctx.moveTo(40,67);ctx.lineTo(472,67);ctx.stroke();
    if(post){
      ctx.fillStyle='#584b3e';lines(post.date+'　'+post.category,40,109,430,23,27,1);
      ctx.fillStyle='#2e342c';lines(post.title,40,169,432,35,47,3,650);
      ctx.fillStyle='#534a3e';lines(post.excerpt,40,321,430,24,34,4);
      ctx.font='18px Georgia,serif';ctx.fillText(String(n+1),456,485);
    }
    ctx.restore();
  }
}
