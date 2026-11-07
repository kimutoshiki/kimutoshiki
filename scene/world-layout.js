/** Shared, metre-based plan. The floor never changes elevation on the walk out. */
export const HOME = Object.freeze({
  scale: .36, floorY: 0, eyeHeight: 1.62,
  bounds: { minX: -2.376, maxX: 2.376, minZ: -.58, maxZ: 3.4056 },
  door: { x: -1.296, z: 3.4056, width: 1.2, height: 2.1 },
  spawn: { x: .70, z: 1.85, yaw: Math.atan2(-.9, -1.85), pitch: Math.atan2(-.62, Math.hypot(.9, 1.85)) },
  target: [-.2, 1, 0],
  seated: { position: [0, 1.18, 1.65], target: [0, .86, 0] },
});
export const WORLD_BOUNDS = { minX: -48, maxX: 48, minZ: -8, maxZ: 90 };
/** Wider portrait view keeps the same human eye in the room, never pulls outside. */
export function worldFov(aspect) { return 62 + 16 * Math.max(0, Math.min(1, (1.1 - aspect) / .3)); }
export const WAYPOINTS = [
  { x: .7, z: 1.85 }, { x: -1.296, z: 2.6 }, { x: -1.296, z: 4.8 },
  { x: -1.296, z: 9 }, { x: 0, z: 16 }, { x: 0, z: 30 },
  { x: 0, z: 46 }, { x: 0, z: 70 }, { x: -3, z: 35 },
  { x: 9, z: 23 }, { x: 7, z: 50 },
];
export const LANDMARK_SITES = [
  { key: 'okuma-auditorium', title: '大隈講堂', name: 'Okuma auditorium architecture', position: [-25, 48], rotation: Math.PI * .70, height: 35, width: 31.081174, depth: 27.009272, arrival: [-3, 35], lookHeight: 13 },
  { key: 'karatsu-castle', title: '唐津城', name: 'Five-tier keep', position: [25, 66], rotation: -Math.PI * .82, height: 27, width: 25.481469, depth: 17.621053, arrival: [7, 50], lookHeight: 11 },
  { key: 'karatsu-bank', title: '旧唐津銀行', name: 'Landmark architecture', position: [19, 25], rotation: -Math.PI * .55, height: 14, width: 25.131055, depth: 20.463466, arrival: [6, 20], lookHeight: 5 },
  { key: 'okuma-statue', title: '大隈重信像', name: 'Okuma statue monument', position: [-7, 22], rotation: Math.PI * .78, height: 6.5, width: 1.94655, depth: 1.654568, arrival: [-1.296, 15], lookHeight: 3.4 },
];
/** Reserve the complete rotated native bounding rectangle before any asset
 * factory finishes. Loading architecture can only shrink these obstacles. */
export const LANDMARK_RESERVATIONS = LANDMARK_SITES.map(site => {
  const c=Math.abs(Math.cos(site.rotation)),s=Math.abs(Math.sin(site.rotation));
  const halfX=(site.width*c+site.depth*s)/2+.05,halfZ=(site.width*s+site.depth*c)/2+.05;
  return {id:'landmark-'+site.key,minX:site.position[0]-halfX,maxX:site.position[0]+halfX,minZ:site.position[1]-halfZ,maxZ:site.position[1]+halfZ};
});
export const REVIEW_VIEWS = {
  seated: { position: HOME.seated.position, target: HOME.seated.target, fov: 62 },
  interior: { position: [.70, 1.62, 1.85], target: [-.2, 1, 0], fov: 62 },
  doorway: { position: [-1.296, 1.62, 2.1], target: [-1.296, 1.62, 20], fov: 62 },
  garden: { position: [-1.296, 1.62, 9], target: [0, 6.5, 40], fov: 62 },
  house: { position: [5.8, 1.62, 11], target: [0, 1.5, 1.4], fov: 62 },
};
