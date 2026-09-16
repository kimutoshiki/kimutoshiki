/** Supplied paper labels sit on the actual wall. The source bitmaps are intact;
 * the mesh outline, rather than edited pixels, removes their studio background. */
export const WALL_LINKS = [
  {id:'profile',label:'プロフィール',href:'profile.html',x:-1.95,y:5.17,angle:.008},
  {id:'research',label:'研究・活動',href:'research.html',x:0,y:5.17,angle:-.006},
  {id:'blog',label:'ブログ',href:'blog.html',x:1.95,y:5.17,angle:.012},
  {id:'gallery',label:'写真',href:'photos.html',x:-.98,y:4.55,angle:-.012},
  {id:'contact',label:'お問い合わせ',href:'contact.html',x:.98,y:4.55,angle:.009},
];
// The original PNGs are 1536 × 1024 and share this paper/tape silhouette.
// These pixel coordinates also drive UVs, picking, and projected accessible links.
const OUTLINE = [[80,319],[504,319],[509,308],[516,298],[514,286],[522,274],[520,265],[528,253],[518,241],[521,236],[1019,231],[1017,241],[1012,254],[1012,267],[1006,276],[1015,285],[1012,299],[1009,310],[1013,319],[1452,319],[1480,325],[1498,342],[1506,361],[1509,381],[1509,600],[1505,619],[1493,635],[1455,669],[1407,713],[1371,739],[1340,748],[82,748],[54,743],[39,730],[30,708],[29,376],[32,355],[47,333],[64,324]];
const SCALE = 1.62 / 1482;
export const WALL_TITLE = Object.freeze({
  src:'/images/navigation/home-title.webp', sourceWidth:2172, sourceHeight:724,
  crop:{x:17,y:191,width:2139,height:346}, width:2.8, y:5.72, z:-1.405,
});
export function createWallNavigation(T, {room, onTextureLoad=()=>{}}={}) {
  const group=new T.Group(); group.name='Paper navigation · on the study wall'; room?.add(group);
  const outline=OUTLINE.map(([x,y])=>new T.Vector2((x-768)*SCALE,(489.5-y)*SCALE));
  const geometry=new T.ShapeGeometry(new T.Shape(outline));
  const position=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<position.count;i++) uv.setXY(i,(position.getX(i)/SCALE+768)/1536,1-(489.5-position.getY(i)/SCALE)/1024);
  uv.needsUpdate=true;
  const loader=new T.TextureLoader(),targets=[],textures=new Set();
  let disposed=false,settled=0,resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  const assetCount=WALL_LINKS.length+1;
  const settle=()=>{settled++;if(settled===assetCount)resolveReady();};
  for(const link of WALL_LINKS) {
    const material=new T.MeshStandardMaterial({color:'#fff9e7',roughness:.93,metalness:0});
    const paper=new T.Mesh(geometry,material);
    paper.name=link.label+' · supplied paper label';
    // Sit just in front of the atlas wallpaper, with enough separation for
    // a soft paper-edge shadow and no overlap with the photographic backing.
    paper.position.set(link.x,link.y,-1.390);paper.rotation.z=link.angle;
    paper.receiveShadow=paper.castShadow=true;
    paper.userData.targetId='nav-'+link.id;paper.userData.wallNavigation=true;
    group.add(paper);
    const anchor=new T.Vector3(link.x,link.y-.043,-1.376);
    targets.push({...link,id:'nav-'+link.id,key:link.id,object:paper,anchor,corners:outline.map(p=>new T.Vector3(p.x,p.y,.006))});
    loader.load(`/images/navigation/${link.id}.webp`,texture=>{
      if(disposed){texture.dispose();return;}
      texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;texture.generateMipmaps=true;
      textures.add(texture);material.map=texture;material.color.set('#ffffff');material.needsUpdate=true;
      settle();onTextureLoad(link.id);
    },undefined,()=>{paper.userData.textureFailed=true;settle();onTextureLoad(link.id);});
  }
  // The lossless asset keeps the source's full resolution and exact alpha.
  // Only UVs omit its transparent border; the supplied lettering is untouched.
  const crop=WALL_TITLE.crop;
  const titleGeometry=new T.PlaneGeometry(WALL_TITLE.width,WALL_TITLE.width*crop.height/crop.width);
  const titleUV=titleGeometry.attributes.uv;
  for(let i=0;i<titleUV.count;i++)titleUV.setXY(i,(crop.x+titleUV.getX(i)*crop.width)/WALL_TITLE.sourceWidth,1-(crop.y+(1-titleUV.getY(i))*crop.height)/WALL_TITLE.sourceHeight);
  titleUV.needsUpdate=true;
  const titleMaterial=new T.MeshStandardMaterial({color:'#ffffff',transparent:true,depthWrite:false,roughness:.85});
  const title=new T.Mesh(titleGeometry,titleMaterial);
  title.name='Supplied bronze wall title';title.position.set(0,WALL_TITLE.y,WALL_TITLE.z);
  title.visible=false;title.castShadow=false;title.raycast=()=>{};
  title.userData.wallTitle={...WALL_TITLE,state:'loading'};group.add(title);
  loader.load(WALL_TITLE.src,texture=>{
    if(disposed){texture.dispose();return;}
    texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;texture.generateMipmaps=true;
    textures.add(texture);titleMaterial.map=texture;titleMaterial.needsUpdate=true;title.visible=true;
    title.userData.wallTitle.state='loaded';settle();onTextureLoad('title');
  },undefined,()=>{
    if(disposed)return;
    title.userData.wallTitle.state='failed';title.visible=false;settle();onTextureLoad('title');
  });
  const projected=new T.Vector3(),worldNormal=new T.Vector3(),direction=new T.Vector3();
  const lastCamera=new T.Matrix4(),lastProjection=new T.Matrix4();
  let lastWidth=0,lastHeight=0,lastHidden,lastSettled=-1;
  function update(camera,container,width,height,{hidden=false}={}) {
    if(disposed||!container)return;
    if(width===lastWidth&&height===lastHeight&&hidden===lastHidden&&settled===lastSettled&&lastCamera.equals(camera.matrixWorld)&&lastProjection.equals(camera.projectionMatrix))return;
    lastCamera.copy(camera.matrixWorld);lastProjection.copy(camera.projectionMatrix);lastWidth=width;lastHeight=height;lastHidden=hidden;lastSettled=settled;
    group.updateWorldMatrix(true,true);
    for(const target of targets) {
      const link=container.querySelector(`[data-wall-link="${target.key}"]`);if(!link)continue;
      target.object.getWorldPosition(projected);direction.copy(camera.position).sub(projected);worldNormal.set(0,0,1).transformDirection(target.object.matrixWorld);
      const points=target.corners.map(corner=>{projected.copy(corner).applyMatrix4(target.object.matrixWorld).project(camera);return{x:(projected.x*.5+.5)*width,y:(-.5*projected.y+.5)*height,z:projected.z};});
      const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
      const off=hidden||worldNormal.dot(direction)<=0||points.every(p=>p.z< -1||p.z>1)||maxX<0||minX>width||maxY<0||minY>height;
      link.style.visibility=off?'hidden':'visible';link.tabIndex=off?-1:0;
      if(off)continue;
      const w=Math.max(1,maxX-minX),h=Math.max(1,maxY-minY);
      link.style.left=minX+'px';link.style.top=minY+'px';link.style.width=w+'px';link.style.height=h+'px';
      link.style.clipPath='polygon('+points.map(p=>`${(p.x-minX)/w*100}% ${(p.y-minY)/h*100}%`).join(',')+')';
      link.classList.toggle('texture-failed',!!target.object.userData.textureFailed);
    }
  }
  return {group,targets,ready,update,get progress(){return settled/assetCount;},dispose(){disposed=true;resolveReady();textures.forEach(texture=>texture.dispose());geometry.dispose();group.traverse(object=>{if(object.isMesh){if(object.geometry!==geometry)object.geometry.dispose();object.material.dispose();}});}};
}
