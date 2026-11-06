/** Complete, opaque room envelope. Camera bounds are inset from these surfaces. */
import { surface } from './surface-materials.js?v=20261106-craft1';
export function completeRoom(T, group, palette) {
  const shell = new T.Group(); shell.name = 'Complete room envelope';
  const cube = new T.BoxGeometry(1,1,1);
  const plaster = new T.MeshStandardMaterial({color:'#d0c5b2',roughness:.96});
  const ceiling = new T.MeshStandardMaterial({color:'#c9bca6',roughness:.97});
  surface(plaster, 'plaster', { tint: '#d7cbb6', bumpScale: .007 });
  surface(ceiling, 'plaster', { tint: '#d2c4ae', bumpScale:.005 });
  const box = (w,h,d,x,y,z,mat=plaster) => {
    const m = new T.Mesh(cube,mat);m.scale.set(w,h,d);m.position.set(x,y,z);
    m.castShadow=m.receiveShadow=true;shell.add(m);return m;
  };
  box(.18,6.7,11.2,6.55,3.25,3.9).name='Right wall';
  box(13.28,6.7,.18,0,3.25,9.46).name='Front wall';
  box(13.28,.20,11.30,0,6.55,3.87,ceiling).name='Ceiling';
  // Full return moldings meet the existing rear cornice; no unbacked sky gaps.
  for(const x of [-6.40,6.40]) {
    box(.12,.20,10.96,x,6.14,3.92,palette.darkWood);
    box(.14,.035,10.96,x,6.29,3.92,palette.lightWood);
    box(.09,.18,10.96,x,.12,3.92,palette.darkWood);
    // The recessed painted backing meets the structural wall; oak rails sit proud.
    box(.08,1.04,10.9,x+Math.sign(x)*.02,.78,3.92,palette.paint);
    for (const y of [.31,1.24]) box(.075,.047,10.9,x-Math.sign(x)*.025,y,3.92,palette.wood);
    box(.025,.015,10.9,x-Math.sign(x)*.065,1.277,3.92,palette.lightWood);
    box(.10,.07,10.96,x,1.34,3.92,palette.lightWood);
    for(let z=-.9;z<9.3;z+=1.28)box(.075,.86,.028,x-Math.sign(x)*.026,.78,z,palette.darkWood);
  }
  for(const y of [.12,1.34,6.14])box(13.0,.12,.13,0,y,9.29,palette.darkWood);
  box(12.98,1.04,.08,0,.78,9.33,palette.paint);
  for (const x of [-.6,1.35,3.30,5.25]) {
    for (const y of [.34,1.20]) box(1.75,.043,.025,x,y,9.277,palette.wood);
    for (const side of [-1,1]) box(.043,.86,.025,x+side*.875,.77,9.277,palette.wood);
  }
  // Flush coffer panels with shallow oak cross beams, supported by the ceiling.
  for(const x of [-4.28,0,4.28])box(.11,.095,10.9,x,6.39,3.88,palette.wood);
  for(const z of [1.5,5.3])box(12.96,.095,.11,0,6.39,z,palette.wood);
  // A closed entrance gives the fourth wall an architectural purpose.
  box(2.00,3.83,.10,-3.6,1.92,9.27,palette.darkWood);
  box(1.72,3.61,.045,-3.6,1.84,9.19,palette.wood);
  for(const y of [1.0,2.7]) {
    box(1.43,1.35,.012,-3.6,y,9.156,palette.darkWood);
    box(1.31,1.23,.016,-3.6,y,9.145,palette.lightWood);
  }
  box(.045,.32,.045,-2.94,1.79,9.09,palette.brass);
  // Brass-backed front-wall sconces; self-lit glass does not add shadow passes.
  const glow=new T.MeshStandardMaterial({color:'#ead5a6',emissive:'#ffe1a6',emissiveIntensity:.35,roughness:.38});
  for(const x of [-5.45,5.75]) {
    box(.24,.48,.07,x,3.35,9.22,palette.brass);
    box(.29,.41,.16,x,3.37,9.10,glow);
    for(const y of [3.14,3.60])box(.33,.035,.20,x,y,9.08,palette.darkBrass);
  }
  group.add(shell);
  return {shell,bounds:{min:new T.Vector3(-6.22,.22,-1.19),max:new T.Vector3(6.22,6.25,9.12)}};
}
