# Original study and walkable garden

The homepage now starts **inside the owner's original study**, at a 1.62 m eye
height. The previous aerial island composition misrepresented the requested
experience. The new scene retains the study's walnut desk, Windsor chair,
cream plaster, sage panels, Karatsu parchment map, burgundy rug, four desktop
miniatures and original animated cat. A real doorway connects the room to a
continuous garden containing the four large Karatsu/Waseda subjects.

## Space and movement

One unit is one metre throughout the home and garden. The original room's
geometry is uniformly scaled by 0.36; its writing surface is approximately
0.79 m high. The retained furniture proportions and palette provide continuity
with the original homepage. The entrance is a domestic 1.2 m × 2.1 m opening,
with wall depth, oak jambs, an open leaf and a flush threshold. Both the rear
window and new front window are actual openings with transparent glazing.

The first-person camera stays at human eye height. WASD, arrow keys and the
onscreen direction buttons move on the ground; dragging looks around. The
“外へ歩く” command travels through the doorway. Landmark destinations and
“部屋へ戻る” follow collision-checked routes and can be stopped at any time.
Manual movement takes over immediately. There is no aerial orbit or scene
teleport presented as walking through the door.

Building footprints are reserved before their models load. A visitor who starts
walking immediately cannot enter a future building and become trapped when its
geometry arrives.

The garden uses continuous terrain and flush stone paths. Ten overlapping
footprints are combined into a single paving surface, eliminating double
surfaces and rectangular shading artifacts. The building models
retain their original proportions and complete geometry, with presentation
plinths removed. Approximate heights are 35 m for Okuma Auditorium, 27 m for
Karatsu Castle, 14 m for the former Karatsu Bank and 6.5 m for the Okuma statue
including its pedestal. These are scale targets for an authored personal world,
not a surveyed reconstruction of the actual sites. Furniture, doorways,
benches and the approximately 0.48 m high original cat provide human-scale cues.

## Rendering and loading

Native page navigation and a small responsive room poster appear before the
optional 3D engine. The final posters are 99,306 bytes for desktop and 48,354 bytes
for portrait. The first live frame contains the furnished room without
waiting for images, the cat, outside landmarks or web fonts. Textures, desktop
miniatures and outdoor architecture refine after this frame. Unsupported WebGL
retains the poster and native links without importing the engine.

The garden has a 2048 px directional shadow map, while the room uses a separate
1024 px window-light shadow map. Actual openings admit the window light. Moving
the cat refreshes the compact room shadow; the static garden shadow is reused.
The frame budget is approximately 30 FPS, with DPR capped at 1.6. Unchanged
paused scenes avoid redraws, and hidden tabs stop rendering. These are rendering
budgets, not measured device FPS or loading-time results.

Trees use individual instanced leaf blades rather than opaque polyhedral crowns.
The garden stays within 200,000 rendered triangles, 24 draw objects and
250,000 bytes of shared geometry. The original 498,248-byte lightweight cat rig
loads first; the existing detailed asset loads only on explicit cat focus.
The four architectural source files and both original cat assets are unchanged.

The interface returns to cream, wood, brass and sage tones. A compact name and
five native page links leave the room visible. The main control changes between
walking outside, stopping and returning home. Touch direction buttons support
pointer cancellation, keyboard activation and release on lost focus.

## Review evidence

The following images are rendered from the actual scene geometry and materials,
using the shared production camera coordinates. They are **offline Blender
renders**, not screenshots from a browser. The responsive initial-view posters
are recorded, with source and output hashes, in
[world-poster-manifest.json](world-poster-manifest.json).

The room posters retain their captured source hashes. The exterior reviews use
a later snapshot containing the paving union and pre-load collision reservations;
the manifest explicitly records this distinction instead of assigning new source
hashes to older pixels. Camera positions, the cat pose and captured lights agree
between the two snapshots.

| View | Evidence |
| --- | --- |
| Starting room | [Desktop poster](../images/world/poster.webp) |
| Starting room on a portrait viewport | [Portrait poster](../images/world/poster-mobile.webp) |
| Through the real doorway | [Doorway](reviews/home-to-garden/doorway.webp) |
| Garden at human eye height | [Garden](reviews/home-to-garden/exterior.webp) |
| Returning to the house | [House](reviews/home-to-garden/house.webp) |

The complete `npm test` run passed all 16 scripts, covering retained legacy
checks plus walking, current world and current UI verification. The new
navigation checks exercise swept collisions,
doorway crossings, diagonal movement, route planning and cancellation. Current
world checks use the real original geometry and cat skeleton to check scale,
ground contact, all four destinations and return routes, first-frame readiness,
shadow coverage, disposal and graphics-context failure. UI checks execute the
actual interface code with an event-capable DOM fixture and a stubbed engine
import to exercise readiness races, mobile input and fallback behavior.

No browser/WebGL control tool is available in the current environment. Therefore
these checks and offline renders do not establish actual WebGL appearance,
mobile GPU performance or browser loading time. No human review gate is
represented as approved by this report.

## Source and reproduction

- `scene/home-interior.js` adapts the original room and owns its openings.
- `scene/home-navigation.js` owns ground movement, collision and route planning.
- `scene/world-layout.js` shares dimensions, destinations and review cameras.
- `scene/world.js` integrates progressive loading, lighting and controls.
- `scripts/world-poster/` reproduces actual-geometry offline review images.
- `npm run build:world` writes content-hashed ESM chunks and reports their size.

Legacy room factories keep their default behavior; the new homepage uses an
optional home mode. The production site remains a static GitHub Pages site.
