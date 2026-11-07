/** Ground-level first-person locomotion. Coordinates are metres; yaw zero faces
 * +Z and positive pitch looks up. The host owns all DOM input and lifecycle
 * listeners, so native links and browser keyboard shortcuts stay untouched. */
export function createWalkNavigation({
  camera, bounds, obstacles = [], spawn = { x: 0, z: 0, yaw: 0, pitch: 0 },
  eyeHeight = 1.62, radius = .22, speed = 3, waypoints = [],
} = {}) {
  const EPS = 1e-7, CLEARANCE = .006, MAX_DT = .1;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const point = value => ({ x: Number(value?.x), z: Number(value?.z) });
  const valid = value => finite(value?.x) && finite(value?.z);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const angle = value => Math.atan2(Math.sin(value), Math.cos(value));
  if (!bounds || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => finite(bounds[key])) ||
      bounds.maxX - bounds.minX <= radius * 2 || bounds.maxZ - bounds.minZ <= radius * 2 ||
      !valid(spawn) || !finite(eyeHeight) || eyeHeight <= 0 || !finite(radius) || radius <= 0 || !finite(speed) || speed <= 0)
    throw new TypeError('Walking needs finite ground bounds, a valid spawn and positive physical dimensions.');
  const limits = { minX: bounds.minX + radius, maxX: bounds.maxX - radius, minZ: bounds.minZ + radius, maxZ: bounds.maxZ - radius };
  let solids = [], nodes = [], route = [], finalHeading = null, disposed = false;
  let x = spawn.x, z = spawn.z, yaw = finite(spawn.yaw) ? spawn.yaw : 0, pitch = clamp(spawn.pitch || 0, -1.2, 1.2);
  let input = { forward: 0, right: 0, sprint: false }, moving = false, blocked = false, travel = 0;
  const insideBounds = p => p.x >= limits.minX && p.x <= limits.maxX && p.z >= limits.minZ && p.z <= limits.maxZ;
  const insideSolid = (p, box) => p.x > box.minX + EPS && p.x < box.maxX - EPS && p.z > box.minZ + EPS && p.z < box.maxZ - EPS;
  const free = p => valid(p) && insideBounds(p) && !solids.some(box => insideSolid(p, box));

  // Slab intersection tests the whole swept segment, including very thin walls.
  // Collision boxes are expanded by the avatar radius before this test.
  function intersects(a, b, box) {
    let near = 0, far = 1;
    for (const axis of ['x', 'z']) {
      const lo = box[axis === 'x' ? 'minX' : 'minZ'] + EPS;
      const hi = box[axis === 'x' ? 'maxX' : 'maxZ'] - EPS;
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < EPS) { if (a[axis] <= lo || a[axis] >= hi) return false; }
      else {
        let t0 = (lo - a[axis]) / delta, t1 = (hi - a[axis]) / delta;
        if (t0 > t1) [t0, t1] = [t1, t0];
        near = Math.max(near, t0); far = Math.min(far, t1);
        if (near >= far) return false;
      }
    }
    return far > 0 && near < 1;
  }
  function canTravel(a, b) {
    return free(a) && free(b) && !solids.some(box => intersects(a, b, box));
  }
  function cancelRoute() { route = []; finalHeading = null; moving = false; }
  function stop() { input = { forward: 0, right: 0, sprint: false }; cancelRoute(); }
  function setObstacles(value) {
    const next = value.map(box => {
      if (!['minX', 'maxX', 'minZ', 'maxZ'].every(key => finite(box[key])) || box.minX > box.maxX || box.minZ > box.maxZ)
        throw new TypeError('Walking obstacles must be finite XZ rectangles.');
      return { minX: box.minX - radius, maxX: box.maxX + radius, minZ: box.minZ - radius, maxZ: box.maxZ + radius };
    });
    solids = next;
    let previous = { x, z };
    for (const nextPoint of route) {
      if (!canTravel(previous, nextPoint)) { stop(); blocked = true; break; }
      previous = nextPoint;
    }
    if (!free({ x, z })) { stop(); blocked = true; }
    return free({ x, z });
  }
  function setWaypoints(value) { nodes = value.filter(valid).map(point); }
  function findRoute(destination, from = { x, z }) {
    const target = point(destination);
    if (!free(from) || !free(target)) return null;
    if (canTravel(from, target)) return [target];
    // Authored waypoints describe the intended doorway and promenade. Obstacle
    // corners allow recovery after manual walking behind a building or chair.
    const candidates = [...nodes];
    for (const box of solids) for (const cx of [box.minX - CLEARANCE, box.maxX + CLEARANCE])
      for (const cz of [box.minZ - CLEARANCE, box.maxZ + CLEARANCE]) candidates.push({ x: cx, z: cz });
    const graph = [point(from), target, ...candidates.filter(free)];
    const costs = graph.map(() => Infinity), previous = graph.map(() => -1), visited = new Set();
    costs[0] = 0;
    for (let iteration = 0; iteration < graph.length; iteration++) {
      let index = -1;
      for (let i = 0; i < graph.length; i++) if (!visited.has(i) && (index < 0 || costs[i] < costs[index])) index = i;
      if (index < 0 || !Number.isFinite(costs[index])) return null;
      if (index === 1) {
        const result = [];
        for (let i = 1; i !== 0; i = previous[i]) result.unshift(graph[i]);
        return result;
      }
      visited.add(index);
      for (let i = 0; i < graph.length; i++) {
        if (visited.has(i)) continue;
        const cost = costs[index] + distance(graph[index], graph[i]);
        if (cost < costs[i] && canTravel(graph[index], graph[i])) { costs[i] = cost; previous[i] = index; }
      }
    }
    return null;
  }
  function walkRoute(points, finalLook) {
    if (disposed || !Array.isArray(points) || !points.length || points.some(p => !valid(p))) return false;
    let start = { x, z };
    const nextRoute = [];
    for (const destination of points) {
      const segment = findRoute(destination, start);
      if (!segment) { stop(); blocked = true; return false; }
      nextRoute.push(...segment); start = point(destination);
    }
    const last = points.at(-1);
    finalHeading = finite(last.yaw) || finite(last.pitch) ? { yaw: finite(last.yaw) ? last.yaw : null, pitch: finite(last.pitch) ? clamp(last.pitch, -1.2, 1.2) : null } : null;
    if (valid(finalLook)) finalHeading = {
      yaw: Math.atan2(finalLook.x - last.x, finalLook.z - last.z),
      pitch: clamp(Math.atan2((finite(finalLook.y) ? finalLook.y : eyeHeight) - eyeHeight, distance(finalLook, last)), -1.2, 1.2),
    };
    route = nextRoute; input = { forward: 0, right: 0, sprint: false }; blocked = false;
    return true;
  }
  function setInput(value = {}) {
    if (disposed) return;
    input = { forward: finite(value.forward) ? clamp(value.forward, -1, 1) : 0, right: finite(value.right) ? clamp(value.right, -1, 1) : 0, sprint: !!value.sprint };
    if (input.forward || input.right) { cancelRoute(); blocked = false; }
  }
  function rotate(dx = 0, dy = 0) {
    if (disposed) return getState();
    if (finite(dx) && finite(dy)) { cancelRoute(); yaw = angle(yaw + dx); pitch = clamp(pitch + dy, -1.2, 1.2); syncCamera(); }
    return getState();
  }
  function turnToward(heading, dt) {
    const change = angle(heading - yaw), amount = Math.min(Math.abs(change), dt * 2.7);
    yaw = angle(yaw + Math.sign(change) * amount);
  }
  function move(dx, dz, slide) {
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .045));
    const sx = dx / count, sz = dz / count;
    let total = 0;
    for (let i = 0; i < count; i++) {
      const before = { x, z }, next = { x: x + sx, z: z + sz };
      if (canTravel(before, next)) { x = next.x; z = next.z; }
      else if (slide) {
        if (canTravel(before, { x: x + sx, z })) x += sx;
        if (canTravel({ x, z }, { x, z: z + sz })) z += sz;
        blocked = true;
      } else { blocked = true; break; }
      total += distance(before, { x, z });
    }
    travel += total; moving ||= total > EPS;
    return total;
  }
  function setEyeHeight(value) {
    if (!finite(value) || value <= 0) return false;
    eyeHeight = value; syncCamera(); return true;
  }
  function syncCamera() {
    if (!camera) return;
    camera.position.set(x, eyeHeight, z);
    camera.lookAt(x + Math.sin(yaw) * Math.cos(pitch), eyeHeight + Math.sin(pitch), z + Math.cos(yaw) * Math.cos(pitch));
    camera.updateMatrixWorld?.();
  }
  function getState() {
    const routeActive = route.length > 0 || finalHeading !== null;
    return { position: { x, y: eyeHeight, z }, target: { x: x + Math.sin(yaw) * Math.cos(pitch), y: eyeHeight + Math.sin(pitch), z: z + Math.cos(yaw) * Math.cos(pitch) },
      yaw, pitch, moving, travel, routeActive, blocked, mode: routeActive ? 'route' : moving ? 'walking' : 'idle' };
  }
  function update(delta = 0) {
    if (disposed) return getState();
    const dt = finite(delta) ? clamp(delta, 0, MAX_DT) : 0;
    moving = false; blocked = false;
    if (route.length) {
      let budget = speed * dt;
      let heading = null;
      while (route.length && budget > EPS) {
        const next = route[0], remaining = distance({ x, z }, next);
        if (remaining <= EPS) { route.shift(); continue; }
        const amount = Math.min(remaining, budget), dx = (next.x - x) / remaining * amount, dz = (next.z - z) / remaining * amount;
        heading ??= Math.atan2(dx, dz);
        if (!canTravel({ x, z }, { x: x + dx, z: z + dz })) { cancelRoute(); blocked = true; break; }
        move(dx, dz, false); budget -= amount;
        // Render the actual corner before continuing along a new segment.
        // Otherwise the chord between frames can appear to cut through a wall.
        if (remaining <= amount + EPS) { route.shift(); break; }
      }
      if (heading !== null) turnToward(heading, dt);
    } else if (!finalHeading && (input.forward || input.right)) {
      const magnitude = Math.max(1, Math.hypot(input.forward, input.right));
      const step = speed * (input.sprint ? 1.45 : 1) * dt / magnitude;
      move((Math.sin(yaw) * input.forward - Math.cos(yaw) * input.right) * step,
        (Math.cos(yaw) * input.forward + Math.sin(yaw) * input.right) * step, true);
    }
    if (!route.length && finalHeading) {
      const goal = finalHeading;
      if (goal.yaw !== null) turnToward(goal.yaw, dt);
      if (goal.pitch !== null) pitch += clamp(goal.pitch - pitch, -dt * 1.8, dt * 1.8);
      if ((goal.yaw === null || Math.abs(angle(goal.yaw - yaw)) < .002) && (goal.pitch === null || Math.abs(goal.pitch - pitch) < .002)) finalHeading = null;
    }
    syncCamera(); return getState();
  }
  setWaypoints(waypoints);
  setObstacles(obstacles);
  if (!free({ x, z })) throw new RangeError('Walking spawn must be clear of walls and inside the ground boundary.');
  syncCamera();
  return { update, getState, setInput, rotate, stop, cancelRoute, walkRoute, findRoute,
    autoWalkTo: (destination, finalLook) => walkRoute([destination], finalLook),
    setObstacles, setWaypoints, setEyeHeight, canTravel, dispose() { stop(); disposed = true; } };
}
