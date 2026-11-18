/** Shared, metre-based plan. The study and its garden meet at the same elevation. */
export const HOME = Object.freeze({
  scale: .36, floorY: 0, eyeHeight: 1.62,
  bounds: { minX: -2.376, maxX: 2.376, minZ: -.58, maxZ: 3.4056 },
  door: { x: -1.296, z: 3.4056, width: 1.2, height: 2.1 },
  spawn: { x: .70, z: 1.85, yaw: Math.atan2(-.9, -1.85), pitch: Math.atan2(-.62, Math.hypot(.9, 1.85)) },
  target: [-.2, 1, 0],
  seated: { position: [0, 1.28, 1.67], target: [0, .815, 0] },
});
export const WORLD_BOUNDS = { minX: -48, maxX: 48, minZ: -8, maxZ: 90 };
/** Wider portrait view keeps the same human eye in the room, never pulls outside. */
export function worldFov(aspect, seated = false) {
  const portrait = Math.max(0, Math.min(1, (1.1 - aspect) / .3));
  return (seated ? 59 : 62) + 16 * portrait;
}
export const WAYPOINTS = [
  { x: .7, z: 1.85 }, { x: -1.296, z: 2.6 }, { x: -1.296, z: 4.8 },
  { x: -1.296, z: 9 }, { x: 0, z: 16 }, { x: 0, z: 30 },
  { x: 0, z: 46 }, { x: 0, z: 70 }, { x: -3, z: 35 },
  { x: 9, z: 23 }, { x: 7, z: 50 },
];
// Metres in two separate local maps. Waseda's X axis follows the main gate
// avenue ENE; Karatsu's X axis is east, Z south. Origins are rendering offsets,
// not a fictional walking route between Tokyo and Saga.
export const REGION_BOUNDS = {
  waseda:{minX:-54,maxX:218,minZ:143,maxZ:323},
  karatsu:{minX:1510,maxX:2584,minZ:415,maxZ:1200},
};
export const CASTLE_CENTER=[2260,570], CASTLE_COURT_Y=40;
export const LANDMARK_SITES = [
  { key:'okuma-auditorium', region:'waseda', title:'大隈講堂', name:'Okuma auditorium architecture', position:[173,263],rotation:-124.5*Math.PI/180,height:38,width:33.74499,depth:29.32435,arrival:[124,241],lookHeight:14 },
  { key:'karatsu-castle', region:'karatsu', title:'唐津城', name:'Five-tier keep', position:CASTLE_CENTER,rotation:0,height:30,foundationY:CASTLE_COURT_Y,width:30,depth:26,arrival:[CASTLE_CENTER[0]+10,CASTLE_CENTER[1]+43],lookHeight:CASTLE_COURT_Y+13.5 },
  { key:'karatsu-bank', region:'karatsu', title:'旧唐津銀行', name:'Landmark architecture', position:[1600,1100],rotation:0,height:14,width:25.131055,depth:20.463466,arrival:[1581.5,1125.5],lookHeight:6.2 },
  { key:'okuma-statue', region:'waseda', title:'大隈重信像', name:'Okuma statue monument', position:[0,230],rotation:Math.PI/2,height:5.01,width:1.5003,depth:1.2753,arrival:[8.45,230.45],lookHeight:3.03 },
];
export const OUTDOOR_VIEWS = {
  'okuma-auditorium': {region:'waseda',district:'大隈講堂前',eye:[124,241],target:[172,14,263]},
  'okuma-statue': {region:'waseda',district:'大隈重信像前',eye:[8.45,230.45],target:[0,3.03,230]},
  'karatsu-castle': {region:'karatsu',district:'唐津城・本丸',eye:[CASTLE_CENTER[0]+10,CASTLE_CENTER[1]+43],target:[CASTLE_CENTER[0],CASTLE_COURT_Y+13.5,CASTLE_CENTER[1]]},
  'karatsu-bank': {region:'karatsu',district:'旧唐津銀行通り',eye:[1581.5,1125.5],target:[1600,6.2,1100]},
};

export function regionalHeight(region,x,z){
  if(region!=='karatsu')return 0;
  const dx=x-CASTLE_CENTER[0],dz=z-CASTLE_CENTER[1]-12;
  // The former island has a flat sandy bailey and falls away to the bay;
  // the gentler south shoulder carries the approach from the lower city.
  const r=Math.hypot(dx/68,dz/(dz>0?99:73));
  const t=Math.max(0,Math.min(1,(1.46-r)/.93));
  return CASTLE_COURT_Y*t*t*(3-2*t);
}
export function districtAt({x,z}){
  if(x>=REGION_BOUNDS.karatsu.minX)
    return Math.hypot(x-CASTLE_CENTER[0],z-CASTLE_CENTER[1])<155?'唐津城・本丸':Math.hypot(x-1600,z-1100)<85?'旧唐津銀行通り':'唐津の城下町';
  if(z>=REGION_BOUNDS.waseda.minZ)return x<35?'大隈重信像前':x>104?'大隈講堂前':'早稲田キャンパス';
  return '屋外';
}
/** Reserve the complete rotated native bounding rectangle before any asset
 * factory finishes. Loading architecture can only shrink these obstacles. */
export const LANDMARK_RESERVATIONS = LANDMARK_SITES.map(site => {
  const c=Math.abs(Math.cos(site.rotation)),s=Math.abs(Math.sin(site.rotation));
  const halfX=(site.width*c+site.depth*s)/2+.05,halfZ=(site.width*s+site.depth*c)/2+.05;
  return {id:'landmark-'+site.key,minX:site.position[0]-halfX,maxX:site.position[0]+halfX,minZ:site.position[1]-halfZ,maxZ:site.position[1]+halfZ};
});
export const REVIEW_VIEWS = {
  seated: { position: HOME.seated.position, target: HOME.seated.target, fov: worldFov(1.5,true) },
  interior: { position: [.70, 1.62, 1.85], target: [-.2, 1, 0], fov: 62 },
  doorway: { position: [-1.296, 1.62, 2.1], target: [-1.296, 1.62, 20], fov: 62 },
  garden: { position: [-1.296, 1.62, 9], target: [0, 6.5, 40], fov: 62 },
  house: { position: [5.8, 1.62, 11], target: [0, 1.5, 1.4], fov: 62 },
};
