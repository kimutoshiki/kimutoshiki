// Small sprays of leaves on several intersecting planes let the sky show
// through real branched crowns. Both species share the same geometry per grove.
export function createLeafSprays(T,pine) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=192;
  const ctx=canvas.getContext('2d');
  let seed=pine?16235:58104;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function twig(ax,ay,bx,by,width,color) {
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.stroke();
  }
  const gold=['#6e873f','#8c9e43','#a8ac4c','#beb34e','#dad06b','#dbcc62','#e2d47e'];
  const green=['#204b40','#2d5a45','#345f49','#436a4e','#577954','#698655','#71945a'];
  const palette=pine?green:gold;
  // Draw from the central spine towards its many small forked stems.
  for(let shoot=0;shoot<22;shoot++) {
    const along=shoot/22;
    const side=shoot%2===0?-1:1;
    const sx=94+5*Math.sin(along*3),sy=174-along*136;
    const ex=sx+side*(30+49*Math.sin(Math.PI*(along*.82+.05)))*(.70+random()*.31);
    const ey=sy-(12+random()*25+along*10);
    twig(sx,sy,ex,ey,pine?1.7:2.1,pine?'#5f6044':'#817446');
    const count=pine?65:17;
    for(let i=0;i<count;i++) {
      const t=.12+random()*.92;
      const x=sx+(ex-sx)*t,y=sy+(ey-sy)*t;
      const sign=i%2===0?1:-1;
      const angle=Math.atan2(ey-sy,ex-sx)+sign*((pine?.37:.56)+random()*.72);
      const length=pine?4+random()*9:4.0+random()*5.5;
      const px=x+Math.cos(angle)*length,py=y+Math.sin(angle)*length;
      const color=palette[Math.floor(random()*palette.length)];
      if(pine) {
        twig(x,y,px,py,.58+random()*.64,color);
      } else {
        const opening=.49+random()*.28;
        ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,y);
        for(let j=0;j<=6;j++) {
          const offset=(j/3-1)*opening;
          const reach=length*(j===3?.78:.92+random()*.08);
          ctx.lineTo(x+Math.cos(angle+offset)*reach,y+Math.sin(angle+offset)*reach);
        }
        ctx.closePath();ctx.fill();
      }
    }
  }
  twig(94,179,99,38,pine?1.35:2.25,pine?'#626849':'#8f7e45');
  const texture=new T.CanvasTexture(canvas);
  texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=2;
  const material=new T.MeshStandardMaterial({map:texture,alphaTest:pine?.23:.38,side:T.DoubleSide,roughness:1,metalness:0});
  material.name=pine?'Wind-shaped sprays of black pine needles':'Individual fan-shaped ginkgo leaves';
  return {texture,material};
}

export function branchCards(T) {
  const positions=[],normals=[],uvs=[],indices=[];
  function add(cx,cy,cz,width,height,angle,tilt) {
    const first=positions.length/3,cos=Math.cos(angle),sin=Math.sin(angle);
    const dx=Math.cos(tilt)*cos,dy=Math.sin(tilt),dz=Math.cos(tilt)*sin;
    const right=[-sin,0,cos];
    for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]) {
      const x=(u-.5)*width,y=(v-.5)*height;
      positions.push(cx+x*right[0]+y*dx,cy+y*dy,cz+x*right[2]+y*dz);
      normals.push(cos*.18,.9837,sin*.18);uvs.push(u,v);
    }
    indices.push(first,first+1,first+2,first,first+2,first+3);
  }
  function finish(){
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    g.setAttribute('normal',new T.BufferAttribute(Int8Array.from(normals,v=>Math.round(v*127)),3,true));
    g.setAttribute('uv',new T.BufferAttribute(Uint8Array.from(uvs,v=>v*255),2,true));g.setIndex(indices);g.computeBoundingSphere();return g;
  }
  return {add,finish};
}
