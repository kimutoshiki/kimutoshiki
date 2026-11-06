import assert from 'node:assert/strict';
import * as T from '../js/vendor/three.module.min.js';
import { createWalkNavigation } from '../scene/home-navigation.js';

const bounds = { minX: -60, maxX: 60, minZ: -12, maxZ: 105 };
const spawn = { x: .7, z: 1.85, yaw: Math.atan2(-.9, -1.85), pitch: -.29 };
const doorX = -1.296, frontZ = 3.4056;
const obstacles = [
  { minX: -2.48, maxX: -2.28, minZ: -.68, maxZ: frontZ },
  { minX: 2.28, maxX: 2.48, minZ: -.68, maxZ: frontZ },
  { minX: -2.48, maxX: 2.48, minZ: -.68, maxZ: -.48 },
  { minX: -2.48, maxX: doorX - .6, minZ: frontZ - .1, maxZ: frontZ + .1 },
  { minX: doorX + .6, maxX: 2.48, minZ: frontZ - .1, maxZ: frontZ + .1 },
  { minX: -.8, maxX: 1.1, minZ: -.3, maxZ: .65 }, // original desk
  { minX: 14, maxX: 24, minZ: 21, maxZ: 29 }, // full-size bank
];
const waypoints = [spawn, { x: doorX, z: 2.6 }, { x: doorX, z: 4.8 }, { x: doorX, z: 9 }, { x: 0, z: 16 }, { x: 0, z: 30 }, { x: 0, z: 46 }];
function make(options = {}) {
  return createWalkNavigation({ bounds, obstacles, spawn, waypoints, ...options });
}
const close = (actual, expected, message, tolerance = 1e-7) => assert(Math.abs(actual - expected) < tolerance, `${message}: ${actual} versus ${expected}`);
const camera = new T.PerspectiveCamera(65, 1, .04, 200), nav = make({ camera });
close(camera.position.y, 1.62, 'Initial eye is at human height');
close(camera.position.x, spawn.x, 'Initial eye starts inside original room');
const direction = camera.getWorldDirection(new T.Vector3());
close(direction.x, Math.sin(spawn.yaw) * Math.cos(spawn.pitch), 'Camera follows the documented +Z yaw convention');
close(direction.y, Math.sin(spawn.pitch), 'Camera pitch matches initial desk view');
assert(!nav.canTravel(spawn, { x: .7, z: 5 }), 'The front wall cannot be walked through');
assert(nav.canTravel({ x: doorX, z: 2.6 }, { x: doorX, z: 4.8 }), 'The doorway is physically open');
assert(!nav.canTravel({ x: doorX + .49, z: 2.6 }, { x: doorX + .49, z: 4.8 }), 'The body radius must fit the doorway');

let crossings = 0, frames = 0;
function finishRoute(controller) {
  let previous = controller.getState().position, count = 0;
  while (controller.getState().routeActive) {
    assert(count++ < 20000, 'A reachable route completes');
    const state = controller.update(1 / 60), next = state.position;
    assert(controller.canTravel(previous, next), 'Every rendered route segment clears walls and furniture');
    assert(Math.hypot(next.x - previous.x, next.z - previous.z) <= 3 / 60 + 1e-7, 'An automatic route walks continuously without teleporting');
    close(next.y, 1.62, 'Walking never flies or changes eye height');
    if ((previous.z < frontZ && next.z >= frontZ) || (previous.z > frontZ && next.z <= frontZ)) {
      assert(Math.abs(next.x - doorX) < .6 - .22, 'House entry and exit both cross the door opening');
      crossings++;
    }
    previous = next; frames++;
  }
}
assert(nav.walkRoute(waypoints.slice(1, 4)));
finishRoute(nav);
close(nav.getState().position.z, 9, 'The outside route reaches the promenade');
assert(nav.autoWalkTo(spawn, { x: -.2, y: 1, z: 0 }));
finishRoute(nav);
close(nav.getState().position.x, spawn.x, 'Return route arrives inside');
close(nav.getState().position.z, spawn.z, 'Return route restores original position');
close(nav.getState().yaw, spawn.yaw, 'Return route ends looking toward the desk', .002);
assert.equal(crossings, 2, 'Leaving and returning each physically cross the door');

const straight = make({ obstacles: [], spawn: { x: 0, z: 10, yaw: 0 } });
const diagonal = make({ obstacles: [], spawn: { x: 0, z: 10, yaw: 0 } });
straight.setInput({ forward: 1 }); diagonal.setInput({ forward: 1, right: 1 });
for (let i = 0; i < 60; i++) { straight.update(1 / 60); diagonal.update(1 / 60); }
close(straight.getState().travel, 3, 'Normal walking speed is three metres per second');
close(diagonal.getState().travel, straight.getState().travel, 'Diagonal movement cannot run faster');
for (const hz of [10, 30, 60, 120]) {
  const instance = make({ obstacles: [], spawn: { x: 0, z: 10, yaw: .32 } });
  instance.setInput({ forward: 1 });
  for (let i = 0; i < hz * 3; i++) instance.update(1 / hz);
  close(instance.getState().travel, 9, `Frame-independent distance at ${hz} Hz`);
}
const beforePause = straight.getState().position;
straight.update(30);
assert(Math.hypot(straight.getState().position.x - beforePause.x, straight.getState().position.z - beforePause.z) <= .300001, 'A resumed tab cannot jump ahead by its elapsed pause');
const thinWall = make({ spawn: { x: 0, z: 10, yaw: 0 }, obstacles: [{ minX: -10, maxX: 10, minZ: 10.3, maxZ: 10.301 }] });
thinWall.setInput({ forward: 1, sprint: true });
for (let i = 0; i < 30; i++) thinWall.update(9);
assert(thinWall.getState().position.z <= 10.08 + 1e-7, 'Swept collisions stop sprinting through millimetre-thick walls');
assert(thinWall.getState().blocked);
const slider = make({ spawn: { x: 0, z: 10, yaw: 0 }, obstacles: [{ minX: -10, maxX: 10, minZ: 10.3, maxZ: 10.301 }] });
slider.setInput({ forward: 1, right: 1 });
for (let i = 0; i < 30; i++) slider.update(1 / 60);
assert(slider.getState().position.x < -.9 && slider.getState().position.z <= 10.080001, 'Manual movement slides along a wall');
const edge = make({ obstacles: [], spawn: { x: 59.7, z: 104.7, yaw: Math.PI / 4 } });
edge.setInput({ forward: 1 });
for (let i = 0; i < 100; i++) edge.update(.1);
assert(edge.getState().position.x <= 59.78 && edge.getState().position.z <= 104.78, 'The player cannot walk off the ground boundary');

const detour = make({ spawn: { x: 20, z: 34, yaw: 0 } });
assert(detour.autoWalkTo({ x: 20, z: 17 }), 'A route recovers from manual walking behind a large landmark');
finishRoute(detour);
const dynamic = make({ obstacles: [], spawn: { x: 0, z: 10, yaw: 0 } });
assert(dynamic.autoWalkTo({ x: 0, z: 20 })); dynamic.update(.1);
dynamic.setObstacles([{ minX: -60, maxX: 60, minZ: 11, maxZ: 12 }]);
assert(!dynamic.getState().routeActive && dynamic.getState().blocked, 'A new obstruction safely cancels an existing route');
assert(!dynamic.autoWalkTo({ x: 0, z: 20 }), 'An unreachable destination does not jump through obstacles');
dynamic.setObstacles([]);
assert(dynamic.autoWalkTo({ x: 0, z: 20 }), 'A stopped route can be retried after the obstruction clears');
dynamic.setInput({ right: 1 });
assert(!dynamic.getState().routeActive, 'Manual movement immediately takes over from automatic walking');
dynamic.stop(); const stopped = dynamic.getState(); dynamic.update(.1);
assert.deepEqual(dynamic.getState().position, stopped.position, 'The shared blur/hidden/Escape/pointercancel stop method clears held input');
assert(dynamic.autoWalkTo({ x: 0, z: 20 })); dynamic.cancelRoute();
assert(!dynamic.getState().routeActive, 'Escape can cancel a route');
dynamic.rotate(0, 100); close(dynamic.getState().pitch, 1.2, 'The view cannot flip vertically');
dynamic.setInput({ forward: 1 }); dynamic.dispose(); const disposed = dynamic.getState().position;
dynamic.update(.1); assert.deepEqual(dynamic.getState().position, disposed, 'Disposed navigation cannot keep moving');
assert.throws(() => make({ spawn: { x: 0, z: 0 } }), /spawn/, 'An occupied initial position is rejected');
console.log(JSON.stringify({ result: 'PASS', frames, doorCrossings: crossings, checks: ['Human eye height and initial room pose', 'Continuous physical doorway crossing in both directions', 'Swept body collisions, wall sliding, furniture and terrain bounds', 'Normalised diagonal movement and frame-independent speed', 'Safe route planning around full-size landmarks', 'Dynamic obstruction, cancellation, retry and lifecycle stop', 'Real Three.js camera orientation'] }, null, 2));
