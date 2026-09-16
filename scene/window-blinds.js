/** Venetian blinds with a real bottom rail, stacking slats and an operable cord. */
export function createWindowBlinds(T, { group: parent, palette, wx = -4.55, wy = 3.66, ww = 2.28, wh = 4.2, z = -.98 }) {
  const group = new T.Group(); group.name = 'Operable wooden window blinds'; parent.add(group);
  const count = 28, top = wy + wh / 2 - .22, loweredBottom = wy - wh / 2 + .18;
  const spacing = (top - loweredBottom) / (count - 1), stackedStep = .032;
  const slats = new T.InstancedMesh(new T.BoxGeometry(ww + .025, .026, .192), palette.lightWood, count);
  slats.name = 'Individually stacked wooden slats'; slats.castShadow = slats.receiveShadow = true;
  slats.instanceMatrix.setUsage(T.DynamicDrawUsage); group.add(slats);
  const cube = new T.BoxGeometry(1, 1, 1), rod = new T.CylinderGeometry(1, 1, 1, 8);
  function box(size, pos, material) { const mesh = new T.Mesh(cube, material); mesh.scale.set(...size); mesh.position.set(...pos); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh; }
  const bottomRail = box([ww + .06, .082, .205], [wx, loweredBottom - .071, z], palette.wood);
  bottomRail.name = 'Moving bottom rail';
  const cordMaterial = new T.MeshStandardMaterial({ color: '#b8ac91', roughness: 1 });
  const cords = [-.72, .72].map(offset => { const mesh = new T.Mesh(rod, cordMaterial); mesh.position.x = wx + offset; mesh.position.z = z + .125; group.add(mesh); return mesh; });
  const pullCord = new T.Mesh(rod, cordMaterial); pullCord.name = 'Blind pull cord';
  pullCord.scale.set(.010, top - (wy - wh / 2 + .48), .010); pullCord.position.set(wx + ww / 2 - .10, (top + wy - wh / 2 + .48) / 2, z + .21); group.add(pullCord);
  const handle = new T.Mesh(new T.CapsuleGeometry(.041, .115, 4, 12), palette.darkWood);
  handle.name = 'Click to raise or lower the blinds'; handle.position.set(pullCord.position.x, wy - wh / 2 + .44, z + .21); handle.castShadow = true; group.add(handle);
  const handleBand = new T.Mesh(new T.CylinderGeometry(.043, .043, .018, 12), palette.brass); handleBand.position.y = -.015; handle.add(handleBand);
  const temp = new T.Object3D(); let openness = 0, target = 0, elapsed = 0, disposed = false;
  function pose() {
    const bottom = loweredBottom + (top - stackedStep * (count - 1) - loweredBottom) * openness;
    for (let i = 0; i < count; i++) {
      const originalY = top - i * spacing, stackY = bottom + (count - 1 - i) * stackedStep;
      const stacked = stackY > originalY;
      temp.position.set(wx, Math.max(originalY, stackY), z);
      // Gathered slats lie flat and form a compact stack below the valance.
      temp.rotation.set(stacked ? 0 : -.34 * (1 - Math.min(1, openness * 1.3)), 0, 0); temp.updateMatrix(); slats.setMatrixAt(i, temp.matrix);
    }
    slats.instanceMatrix.needsUpdate = true; slats.computeBoundingSphere();
    bottomRail.position.y = bottom - .07;
    for (const cord of cords) { cord.scale.set(.008, top - bottom + .035, .008); cord.position.y = (top + bottom) / 2; }
    const pull = Math.abs(target - openness) > .001 ? Math.sin(Math.min(elapsed / .4, 1) * Math.PI) * .10 : 0;
    handle.position.y = wy - wh / 2 + .44 - pull;
    pullCord.scale.y = top - handle.position.y; pullCord.position.y = (top + handle.position.y) / 2;
    group.userData.blindsRaised = target === 1; group.userData.openness = openness;
  }
  function setRaised(value) { target = value ? 1 : 0; elapsed = 0; group.userData.blindsRaised = !!value; }
  function toggle() { setRaised(!target); }
  group.userData.roomAction = { kind: 'blinds', label: '木製ブラインド', onActivate: toggle };
  pose();
  return {
    group, slats, bottomRail, handle, toggle, setRaised,
    get openness() { return openness; },
    get moving() { return Math.abs(target - openness) > .0005; },
    update(delta, enabled = true) {
      if (disposed || Math.abs(target - openness) < .0005) return false;
      elapsed += Math.min(Math.max(delta, 0), .1);
      openness = enabled ? openness + (target - openness) * (1 - Math.exp(-Math.min(delta, .1) * 4.7)) : target;
      if (Math.abs(target - openness) < .0005) openness = target;
      pose(); return true;
    },
    dispose() { disposed = true; },
  };
}
