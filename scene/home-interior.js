import { createRoom } from './room-model.js';
import { surface, prepareBoxSurfaceUVs, ensureSurfaceUV, SURFACES } from './surface-materials.js';
import { mergeStaticDraws, cacheStaticLocalMatrices } from './static-batching.js';

// One metre is one world unit. The old room is deliberately retained at .36:
// its 2.166-unit writing surface becomes a human .791m desk, and its familiar
// woodwork, window, chair and clock keep their exact authored proportions.
export const HOME_SCALE = .36;
export const HOME_FLOOR_Y = 0;
export const HOME_DOOR = Object.freeze({ x: -1.296, z: 3.4056, width: 1.2, height: 2.1, depth: .22 });
export const HOME_FRONT_WINDOW = Object.freeze({ x: .85, width: 1.4, sill: .8, head: 2.0 });

/** Original study adapted to a continuous, metric, walkable landscape.
 * Collisions are uninflated WORLD Box3s, never floor/ceiling or decoration.
 * The returned cat is the original empty owner; the caller installs its asset.
 * No external image or cat request begins during this synchronous factory.
 */
export function createHomeInterior(T, { onTextureLoad = () => {}, onAssetChange = () => {}, catAsset, loadCatDetail } = {}) {
  let disposed = false, landmarks, clockSnapshot;
  const group = new T.Group(); group.name = 'Home · the original warm study';
  const original = createRoom(T, { worldHome: true, catAsset, loadDetailedCat: loadCatDetail, onCatChange: onAssetChange, onTextureLoad });
  original.lampLight.intensity *= HOME_SCALE * HOME_SCALE;
  original.lampLight.distance *= HOME_SCALE;
  const room = original.group; room.scale.setScalar(HOME_SCALE); room.position.y = .0108; group.add(room);
  const targets = [...original.targets], collisions = [], ownedTextures = new Set(), removed = [];
  const shell = new T.Group(); shell.name = 'Solid house shell and open doorway'; group.add(shell);
  const boxGeo = new T.BoxGeometry(1, 1, 1);
  const mat = (color, roughness = .8, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });
  const plaster = surface(mat('#d0c5b2', .96), 'plaster', { tint: '#d7cbb6', bumpScale: .002 });
  const sage = surface(mat('#58634e', .82), 'plaster', { tint: '#68745c', bumpScale: .001 });
  const walnut = surface(mat('#62432f', .5), 'walnut', { tint: '#b9a58e', bumpScale: .001 });
  const oak = surface(mat('#936a43', .5), 'walnut', { tint: '#d7c09b', bumpScale: .001 });
  const brass = mat('#aa8c53', .36, .78), slate = surface(mat('#48534f'), 'slate', { tint: '#6d7770', bumpScale: .003 });
  const iron = mat('#303731', .62, .64);
  const box = (name, size, position, material = plaster, parent = shell) => {
    const mesh = new T.Mesh(boxGeo, material); mesh.name = name; mesh.scale.set(...size); mesh.position.set(...position);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const solid = (id, min, max) => { const record = { id, box: new T.Box3(new T.Vector3(...min), new T.Vector3(...max)) }; collisions.push(record); return record; };
  const detach = object => { object.removeFromParent(); removed.push(object); };
  // Remove the actual closed wall, all flush panels, old door and sconces.
  // Side walls and the continuous opaque ceiling remain intact.
  for (const object of [...original.envelope.shell.children]) if (object.position.z > 9) detach(object);
  // The old floor extended behind the rear wall; the new slab meets the shell.
  const floor = room.children.find(o => o.isMesh && o.position.y === -.1 && o.scale.x === 13.2);
  if (floor) { floor.name = 'Grounded oak parquet floor'; floor.scale.z = 11.07; floor.position.z = 3.935; }

  const d = HOME_DOOR, left = d.x - d.width / 2, right = d.x + d.width / 2;
  const wallLeft = -2.56, wallRight = 2.56, height = 2.37, frontMin = d.z - d.depth / 2, frontMax = d.z + d.depth / 2;
  const frontWindow = HOME_FRONT_WINDOW, frontWindowLeft = frontWindow.x - frontWindow.width / 2, frontWindowRight = frontWindow.x + frontWindow.width / 2;
  for (const [id, a, b] of [['left', wallLeft, left], ['right', right, wallRight]]) {
    if (id === 'right') {
      // Four solid pieces form a genuine opening all the way through the wall.
      // The collision stays continuous: a glazed window is not a walking exit.
      for (const [from,to] of [[a,frontWindowLeft],[frontWindowRight,b]]) box('Front plaster beside garden window',[to-from,height,d.depth],[(from+to)/2,height/2,d.z]);
      box('Front plaster below garden window',[frontWindow.width,frontWindow.sill,d.depth],[frontWindow.x,frontWindow.sill/2,d.z]);
      box('Front plaster above garden window',[frontWindow.width,height-frontWindow.head,d.depth],[frontWindow.x,(height+frontWindow.head)/2,d.z]);
    } else box(`Front wall ${id} of real opening`, [b - a, height, d.depth], [(a + b) / 2, height / 2, d.z]);
    solid(`home-wall-front-${id}`, [a, 0, frontMin], [b, height, frontMax]);
    // Paint and rails terminate at the jamb: no hidden trim across the opening.
    for (const z of [frontMin - .008, frontMax + .008]) {
      box('Sage front wainscot', [b - a, .40, .016], [(a + b) / 2, .28, z], sage);
      for (const [y, h] of [[.045, .09], [.493, .035]]) box('Timber front rail', [b - a, h, .032], [(a + b) / 2, y, z], walnut);
      const panels = Math.max(1, Math.round((b - a) / .5));
      for (let i = 1; i < panels; i++) box('Wainscot stile', [.014, .37, .027], [a + (b - a) * i / panels, .285, z], oak);
    }
  }
  const gardenWindow = new T.Group(); gardenWindow.name='Recessed oak garden window'; shell.add(gardenWindow);
  const windowHeight=frontWindow.head-frontWindow.sill, windowCenter=(frontWindow.head+frontWindow.sill)/2;
  // Continuous oak reveals expose the physical depth from both sides.
  for(const x of [frontWindowLeft+.0225,frontWindowRight-.0225]) box('Garden window deep jamb',[.045,windowHeight,.235],[x,windowCenter,d.z],oak,gardenWindow);
  for(const y of [frontWindow.sill+.025,frontWindow.head-.025]) box('Garden window deep head and base',[frontWindow.width,.05,.235],[frontWindow.x,y,d.z],oak,gardenWindow);
  // Matching indoor/outdoor architraves surround, rather than fill, the opening.
  for(const z of [frontMin-.027,frontMax+.027]) {
    for(const x of [frontWindowLeft-.0375,frontWindowRight+.0375]) box('Garden window architrave',[.075,windowHeight+.15,.044],[x,windowCenter,z],walnut,gardenWindow);
    for(const y of [frontWindow.sill-.0375,frontWindow.head+.0375]) box('Garden window architrave rail',[frontWindow.width+.15,.075,.044],[frontWindow.x,y,z],walnut,gardenWindow);
  }
  const glassMaterial = new T.MeshStandardMaterial({color:'#dce9e6',roughness:.10,transparent:true,opacity:.10,depthWrite:false});
  const glazing=box('Clear garden window glazing',[frontWindow.width-.09,windowHeight-.10,.008],[frontWindow.x,windowCenter,d.z+.025],glassMaterial,gardenWindow);
  glazing.castShadow=false;glazing.receiveShadow=false;
  box('Garden window central mullion',[.038,windowHeight-.10,.050],[frontWindow.x,windowCenter,d.z+.025],oak,gardenWindow);
  box('Garden window transom',[frontWindow.width-.09,.034,.050],[frontWindow.x,1.47,d.z+.025],oak,gardenWindow);
  box('Projecting oak garden sill',[frontWindow.width+.20,.045,.36],[frontWindow.x,frontWindow.sill-.0125,d.z+.045],oak,gardenWindow);
  box('Garden sill apron',[frontWindow.width+.08,.055,.035],[frontWindow.x,frontWindow.sill-.0625,frontMax+.025],walnut,gardenWindow);
  box('Window brass latch',[.055,.013,.027],[frontWindow.x,1.445,frontMin-.014],brass,gardenWindow);
  box('Opaque lintel above doorway', [d.width, height - d.height, d.depth], [d.x, (height + d.height) / 2, d.z]);
  // Recess lining and casing sit outside the advertised 1.2 × 2.1 clear aperture.
  for (const x of [left - .025, right + .025]) {
    box('Solid oak door jamb', [.05, d.height, d.depth + .025], [x, d.height / 2, d.z], oak);
    for (const z of [frontMin - .03, frontMax + .03]) box('Door architrave', [.085, d.height + .10, .045], [x + (x < d.x ? -.0175 : .0175), (d.height + .10) / 2, z], walnut);
  }
  box('Oak door head', [d.width + .10, .05, d.depth + .025], [d.x, d.height + .025, d.z], oak);
  for (const z of [frontMin - .03, frontMax + .03]) box('Door head moulding', [d.width + .22, .075, .045], [d.x, d.height + .0875, z], walnut);
  // The threshold top is exactly floor level; walking never climbs a box.
  box('Flush oak threshold', [d.width, .04, d.depth + .07], [d.x, -.02, d.z], oak);
  // A real leaf stands open along the garden side of the left jamb.
  const leaf = new T.Group(); leaf.name = 'Open oak entrance door'; leaf.position.set(left - .06, 0, frontMax); shell.add(leaf);
  box('Open door leaf', [.046, 2.06, 1.11], [0, 1.03, .565], walnut, leaf);
  for (const y of [.51, 1.51]) {
    box('Raised door panel', [.054, .80, .88], [0, y, .565], oak, leaf);
    box('Recessed door panel', [.060, .70, .78], [0, y, .565], walnut, leaf);
  }
  for (const y of [.30, 1.05, 1.80]) box('Brass door hinge', [.07, .065, .035], [.016, y, .032], brass, leaf);
  box('Door brass handle', [.10, .028, .12], [.072, 1.0, 1.0], brass, leaf);
  solid('home-open-door', [left - .10, 0, frontMax], [left - .015, 2.06, frontMax + 1.13]);

  // Thick exterior backing joins the retained plaster walls. The rear wall has
  // the same genuine window aperture as the original, not an image-filled box.
  box('West external plaster wall', [.20, height, 4.21], [-2.45, height / 2, 1.385]);
  box('East external plaster wall', [.20, height, 4.21], [2.45, height / 2, 1.385]);
  solid('home-wall-west', [-2.55, 0, -.72], [-2.30, height, frontMax]);
  solid('home-wall-east', [2.30, 0, -.72], [2.55, height, frontMax]);
  const windowLeft = -5.69 * HOME_SCALE, windowRight = -3.41 * HOME_SCALE;
  const sill = 1.56 * HOME_SCALE + .0108, windowTop = 5.76 * HOME_SCALE + .0108;
  for (const [a,b] of [[-2.55, windowLeft], [windowRight, 2.55]]) box('Rear wall beside recessed window', [b-a,height,.20], [(a+b)/2,height/2,-.655]);
  box('Rear wall below real window', [windowRight-windowLeft,sill,.20], [(windowLeft+windowRight)/2,sill/2,-.655]);
  box('Rear wall above real window', [windowRight-windowLeft,height-windowTop,.20], [(windowLeft+windowRight)/2,(windowTop+height)/2,-.655]);
  solid('home-wall-rear', [-2.55,0,-.755], [2.55,height,-.515]);
  for (const x of [windowLeft-.018,windowRight+.018]) box('Window exterior reveal', [.036,windowTop-sill+.072,.25], [x,(windowTop+sill)/2,-.65], oak);
  for (const y of [sill-.018,windowTop+.018]) box('Window exterior sill and head', [windowRight-windowLeft+.108,.036,.27], [(windowLeft+windowRight)/2,y,-.65], oak);
  original.blinds.setRaised(true); original.blinds.update(1, false);
  for (const x of [-2.558,2.558]) {
    box('Exterior sage skirt', [.018,.40,4.18], [x,.24,1.38], sage);
    box('Exterior oak sill', [.035,.065,4.2], [x,.065,1.38], walnut);
  }
  box('Rear sage skirt', [5.12,.40,.018], [0,.24,-.765], sage);
  // Narrow corner boards and a supported frieze finish the house silhouette.
  // They meet the ground and echo the study's walnut-and-oak mouldings.
  for(const x of [-2.525,2.525]) {
    box('Garden facade corner board',[.07,height,.035],[x,height/2,frontMax+.018],walnut);
    box('Side return corner board',[.035,height,.075],[Math.sign(x)*2.568,height/2,frontMax-.02],walnut);
    box('Corner board cap',[.105,.035,.065],[x,height-.0175,frontMax+.023],oak);
  }
  box('Garden facade oak frieze',[5.18,.075,.045],[0,2.3275,frontMax+.023],walnut);
  box('Garden facade fine cornice',[5.20,.025,.060],[0,2.378,frontMax+.025],oak);
  for(const x of [-2.573,2.573]) {
    box('Side eave frieze',[.035,.075,4.25],[x,2.3275,1.385],walnut);
    box('Side sage skirt cap',[.035,.030,4.20],[x,.455,1.385],oak);
  }
  // Restrained pitched roof, closed gable triangles and connected eaves.
  const eaveY = 2.43, ridgeY = 3.18, roofHalf = 2.73, slope = Math.atan2(ridgeY-eaveY,roofHalf);
  for (const side of [-1,1]) {
    const roof = box('Opaque slate roof slope', [Math.hypot(roofHalf,ridgeY-eaveY),.105,4.62], [side*roofHalf/2,(ridgeY+eaveY)/2,1.385], slate);
    roof.rotation.z = -side*slope;
    box('Oak eave fascia', [.065,.14,4.64], [side*roofHalf,eaveY,1.385], walnut);
  }
  const triangle = new T.Shape(); triangle.moveTo(-2.55,eaveY); triangle.lineTo(2.55,eaveY); triangle.lineTo(0,3.13); triangle.closePath();
  const gableGeo = new T.ExtrudeGeometry(triangle,{depth:.12,bevelEnabled:false});
  for (const z of [-.72,3.40]) { const gable = new T.Mesh(gableGeo,plaster); gable.name='Solid plaster gable';gable.position.z=z;gable.castShadow=gable.receiveShadow=true;shell.add(gable); }
  box('Roof ridge cap', [.14,.09,4.68], [0,ridgeY+.04,1.385], slate);

  // Add contact feet rather than shifting the original desktop and its objects.
  // Their top overlaps the old native-unit clearance; every support meets y=0.
  const supports = new T.Group(); supports.name='Ground contact joinery'; group.add(supports);
  for (const x of [-2.82,2.82]) for (const z of [-.69,.64]) box('Writing desk foot contact', [.056,.018,.056], [x*1.022*HOME_SCALE,.009,z*1.065*HOME_SCALE], walnut, supports);
  const chair = room.getObjectByName('Windsor chair'); chair.updateWorldMatrix(true,true);
  for (const x of [-1,1]) for (const z of [-1,1]) { const point=chair.localToWorld(new T.Vector3(x*.54,0,z*.51));box('Windsor chair foot contact',[.033,.026,.033],[point.x,.013,point.z],walnut,supports); }
  for (const x of [-5.34,-3.38]) for (const z of [-.72,2.16]) box('Workbench floor foot',[.036,.022,.036],[x*HOME_SCALE,.011,z*HOME_SCALE],iron,supports);
  solid('home-writing-desk', [-1.165,0,-.355], [1.165,.82,.33]);
  solid('home-window-workbench', [-2.015,0,-.355], [-1.11,.80,.875]);
  group.updateMatrixWorld(true);
  const chairBounds = new T.Box3().setFromObject(chair); collisions.push({id:'home-windsor-chair',box:chairBounds.clone()});

  // Preserve the two distinctive surfaces from the actual original room.
  // Fetches start only through refine(), called after the first scene paint.
  const mapMaterial = mat('#c7aa78', .98), map = new T.Mesh(new T.PlaneGeometry(4.60*1672/941,4.60),mapMaterial);
  map.name='Original Karatsu parchment wall map';map.position.set(1.30,3.74,-1.443);map.receiveShadow=true;room.add(map);
  const rug = room.children.find(o=>o.isMesh&&o.position.x===.20&&o.position.y===-.014&&o.position.z===1.85);
  if(rug){
    rug.name='Original burgundy desk rug';rug.material.color.set('#894c49');
    const uv=rug.geometry.attributes.uv,p=rug.geometry.attributes.position,n=rug.geometry.attributes.normal;
    for(let i=0;i<uv.count;i++)if(Math.abs(n.getY(i))>.5)uv.setXY(i,p.getX(i)/6.2+.5,p.getZ(i)/3.14+.5);
    uv.needsUpdate=true;
  }
  const loader = new T.TextureLoader(); let refined=false;
  function refine() {
    if(refined||disposed)return;refined=true;
    for(const [file,material] of [['atlas/karatsu',mapMaterial],['decor/burgundy-rug',rug?.material]]) {
      if(!material)continue;
      loader.load(new URL('../images/'+file+'.webp',import.meta.url).href,texture=>{
        if(disposed){texture.dispose();return;}ownedTextures.add(texture);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
        const previous=material.map;material.map=texture;previous?.dispose();
        material.color.set('#ffffff');material.needsUpdate=true;onTextureLoad(file);onAssetChange();
      },undefined,()=>{});
    }
  }
  // Prepare physical UVs before batching so lazy materials do not stretch.
  prepareBoxSurfaceUVs(T,group);
  group.traverse(o=>{if(!o.isMesh)return;for(const material of Array.isArray(o.material)?o.material:[o.material]){const spec=SURFACES[material.userData.surface?.key];if(spec)ensureSurfaceUV(T,o.geometry,spec.span);}o.geometry.userData.surfaceUVPrepared=true;});
  const skipRoots = new Set([original.cat.group, original.cat.contactShadow, original.blinds.group, original.clock.group]);
  const protectedObjects = new Set([map, rug, floor].filter(Boolean));
  // Keep selection roots and furniture identities but combine their static parts.
  const preserveGroups = new Set([room.getObjectByName('Writing desk'),chair,room.getObjectByName('Oak and iron window workbench'),...targets.map(t=>t.object)].filter(Boolean));
  const batchReport = mergeStaticDraws(T, group, {byParent:false,skipRoots,protectedObjects,preserveGroups});
  cacheStaticLocalMatrices(shell);
  const metadata = {
    units:'metres', source:'Original room-model.js furniture at uniform .36 scale', scale:HOME_SCALE,
    floorY:0, floorBounds:{min:[-2.376,0,-.576],max:[2.376,0,3.4092]}, ceilingY:2.3328,
    interiorBounds:{min:[-2.30,0,-.515],max:[2.30,2.3328,3.2956]},
    door:{...d,min:[left,0,frontMin],max:[right,d.height,frontMax],thresholdY:0,normal:[0,0,1]},
    window:{min:[windowLeft,sill,-.755],max:[windowRight,windowTop,-.455],transparent:true},
    frontWindow:{...frontWindow,z:d.z,depth:d.depth,min:[frontWindowLeft,frontWindow.sill,frontMin],max:[frontWindowRight,frontWindow.head,frontMax],clearMin:[frontWindowLeft+.045,frontWindow.sill+.05,frontMin],clearMax:[frontWindowRight-.045,frontWindow.head-.05,frontMax],transparent:true,walkable:false,mullionX:frontWindow.x,transomY:1.47},
    spawn:{position:[.70,1.62,1.85],target:[-.2,1,0]},
    walkingRoute:[[.70,0,1.85],[-1.296,0,2.6],[-1.296,0,4.8]],
    desk:{surfaceY:2.167*HOME_SCALE+.0108,bounds:{min:[-1.165,0,-.355],max:[1.165,.82,.33]},miniatureScale:HOME_SCALE},
    cat:{floorY:0,modelScale:.648,sourceOwner:'createRoomCat',nativeRoomScale:HOME_SCALE},
    groundedSupports:{floorY:0,tolerance:.005,deskFeet:4,chairFeet:4,workbenchFeet:4},
    collisions:collisions.map(({id,box})=>({id,min:box.min.toArray(),max:box.max.toArray()})),
    staticBatching:batchReport,
  };
  group.userData.home=metadata;
  let startLandmarks;
  const landmarksReady = new Promise(resolve=>{startLandmarks=resolve;});
  let landmarksStarted=false;
  async function loadMiniatures() {
    if(landmarksStarted||disposed)return landmarksReady;landmarksStarted=true;
    try {
      const { createDeskLandmarks } = await import('./desk-landmarks.js');
      if(disposed){startLandmarks(null);return null;}
      const result = await createDeskLandmarks(T, {waitForFonts:false,yieldBetweenModels:true});
      if(disposed){disposeTree(result.group);startLandmarks(null);return null;}
      landmarks=result;if(clockSnapshot)landmarks.updateClock?.(clockSnapshot);room.add(result.group);group.updateMatrixWorld(true);
      for(const target of result.targets){target.anchor=target.object.localToWorld(new T.Vector3(0,.4,0));targets.push(target);}
      metadata.miniatures=result.targets.map(t=>({id:t.id,position:t.object.getWorldPosition(new T.Vector3()).toArray()}));
      onAssetChange();startLandmarks(result);return result;
    } catch(error) { metadata.miniatureError=String(error);startLandmarks(null);return null; }
  }
  const disposedResources = new Set();
  function disposeTree(root) {
    root.traverse(object=>{
      if(object.geometry&&!disposedResources.has(object.geometry)){disposedResources.add(object.geometry);object.geometry.dispose();}
      for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[]) {
        if(disposedResources.has(material))continue;disposedResources.add(material);
        for(const value of Object.values(material))if(value?.isTexture&&!disposedResources.has(value)){disposedResources.add(value);value.dispose();}
        material.dispose();
      }
    });
  }
  return {
    group,targets,collisions,metadata,cat:original.cat,lampLight:original.lampLight,clock:original.clock,landmarksReady,
    refine,loadMiniatures,
    updateClock(snapshot){clockSnapshot=snapshot;landmarks?.updateClock?.(snapshot);},
    update(delta,enabled=true){return original.blinds.update(delta,enabled);},
    dispose(){
      if(disposed)return;disposed=true;startLandmarks(null);original.dispose();
      // Blinds.dispose() only stops their animation; static house traversal
      // remains the sole owner of their meshes and shared timber materials.
      original.blinds.dispose();
      // Cat assets have a separate owner and must not be disposed a second time
      // by the static house traversal after their skeleton/mixer cleanup.
      // Cat.dispose() also disposes and detaches its separate contact plane.
      original.cat.group.removeFromParent();original.cat.dispose();
      original.photoWall.dispose();disposeTree(group);for(const object of removed)disposeTree(object);
      for(const texture of ownedTextures)if(!disposedResources.has(texture))texture.dispose();
    },
  };
}
