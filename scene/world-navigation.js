/** Orbit a continuous landscape; the camera never enters an enclosed room. */
export function createWorldNavigation(T) {
  const home = new T.Vector3(0, 3, 0), center = home.clone(), position = new T.Vector3();
  const base = new T.Vector3(38, 22, 48), homeRadius = base.length();
  const homeYaw = Math.atan2(base.x, base.z), homePitch = Math.asin(base.y / homeRadius);
  let yaw = homeYaw, pitch = homePitch, radius = homeRadius, aspect = 1.6, subject = 'world', focusSize = 1, obstacles = [];
  const clamp = T.MathUtils.clamp;
  function update() {
    const portraitScale = subject === 'world' ? clamp(.975 / aspect, 1, 1.9) : clamp(.8 / aspect, 1, 1.65);
    const distance = radius * portraitScale;
    position.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(distance).add(center);
    position.y = Math.max(.6, position.y);
    // A close orbit around one building can otherwise enter its neighbour.
    // Keep the eye above the actual occupied envelope, including when following
    // the cat. This changes only the eye, never the authored landmark positions.
    for (const obstacle of obstacles) if (obstacle.id !== subject && obstacle.box.containsPoint(position)) position.y = Math.max(position.y, obstacle.box.max.y + .6);
    return { position, target: center, subject, radius, yaw, pitch };
  }
  function reset() { center.copy(home); yaw = homeYaw; pitch = homePitch; radius = homeRadius; subject = 'world'; return update(); }
  return {
    update, reset,
    setObstacles(value) { obstacles = value.map(({ id, box }) => ({ id, box: box.clone().expandByScalar(.35) })); return update(); },
    resize(value) { if (Number.isFinite(value) && value > 0) aspect = value; return update(); },
    rotate(dx, dy) { yaw -= dx; pitch = clamp(pitch + dy, .12, 1.12); return update(); },
    zoom(delta) { if (Number.isFinite(delta)) radius = clamp(radius * Math.exp(delta * .18), subject === 'world' ? 38 : focusSize * 1.12, subject === 'world' ? 110 : focusSize * 5); return update(); },
    focus(id, bounds) {
      if (!bounds || id === 'world') return reset();
      const size = bounds.getSize(new T.Vector3()); bounds.getCenter(center);
      focusSize = Math.max(size.x, size.y, size.z, 1.4);
      radius = focusSize * 1.8; yaw = .32; pitch = id === 'cat' ? .24 : .25; subject = id;
      return update();
    },
    follow(point) { if (subject === 'cat') center.copy(point); },
  };
}
