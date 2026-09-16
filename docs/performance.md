# Study performance — 16 September 2026

The optimization preserves all source photographs, texture dimensions, geometry
triangles, material objects, UVs, shadow resolutions, pixel ratio and animation
cadence. No asset was recompressed for this change.

## Measured result

Comparison with `87feb0b`, in the same Chromium browser at 1280 × 720, fixed desk
view, daylight override, animation enabled. Values are the last 120 drawn frames
after loading settles, measured through the actual WebGL2 context. The moving
cat and 100 ms shadow cadence introduce some variation between samples.

| Metric | Before | After |
| --- | ---: | ---: |
| Frame callback CPU | 36.61 ms | 8.64 ms |
| Drawn frame interval | 54.58 ms | 33.33 ms |
| Approximate displayed FPS | 18.3 | 30.0 |
| GL draw submissions, including shadows | 1,624.3 | 737.6 |
| GPU elapsed time | 10.27 ms | 10.05 ms |
| Live GL textures | 88 | 88 |

These are local measurements, not a guarantee for every device. GPU rendering
quality is unchanged; the main improvement is removing CPU submission and
interaction work. The existing roughly 30 FPS animation budget is retained.

## Changes

- Merge compatible, opaque static parts by exact material, vertex layout and
  render state. Miniatures: 544 → 115 draw objects. Other room geometry:
  770 → 627. Combined: 1,314 → 742 before culling and shadow passes. All 674,226
  triangles remain. Expanding selected instances trades about 6 MB of geometry
  buffers for fewer submissions. Named parts, animation owners, custom raycasts,
  transparent parts and original cat meshes remain independent.
- Cache rigid miniature local matrices and wall bounds/projections. A stationary
  wall update performs no repeated DOM queries, world transforms or frustum work.
- Use a refitted spatial tree for pointer and label occlusion rays. Final hits
  still use the original Three.js triangle raycast. Bone-local bounds conservatively
  enclose animated cat vertices without repeatedly skinning every vertex.
  In 273 repeated queries: 8,510.72 → 938.00 ms, with detailed raycast calls
  240,513 → 10,032. 542 rays match object, instance, triangle, hit point and target.
- Coalesce pointer movement to the latest position once per rendered frame.
  Clicks remain immediate. Refresh the spatial index after geometry/LOD changes.
- Stop hidden room animation and redundant rendering/shadow redraws in a static
  inspection view or while paused. Camera controls, image completion and local
  clock/light changes still render when needed. Background-tab suspension stays.
- Share identical linear-color-space bump samplers while preserving each
  material's bump strength. Keep texture failure and disposal handling.
- Replace rotating loading introductions with one short waiting message.

## Reproduce

Run `node scripts/preview.mjs --host 127.0.0.1 --port 4173 --performance`, then open
`http://127.0.0.1:4173/?performance=1`. Only this explicit local preview option
inserts `scripts/performance-audit.js`; the production page has no instrumentation.
Use the same viewport, camera, lighting and animation settings for both versions.
The timer-query extension is optional; GPU time is unavailable if unsupported.

`npm test` runs all twelve checks. They cover every merged vertex position/normal,
UV/color attributes, exact ray results, all object actions, four clock faces,
drawers, moving blinds, original/full cat LODs, local time, photo loading,
accessible wall links, touch/zoom/inspection controls, resource disposal and
zero redundant draws across thirty static frames.
