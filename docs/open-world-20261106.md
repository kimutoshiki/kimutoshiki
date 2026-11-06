# Coastal personal world — 6 November 2026

The homepage replaces the enclosed study with a broad coastal landscape. Only
the owner's original animated cat and four Waseda/Karatsu architectural subjects
occupy the world: Okuma Auditorium, the Okuma Shigenobu statue, Karatsu Castle
and the former Karatsu Bank. The basalt headland, sea, distant ridges and small
coastal pine stand are Karatsu-inspired scenery, not a geographic map or a
literal reconstruction of Karatsu.

## Presentation and useful first paint

Native HTML navigation to all five existing pages is available immediately.
The opening image is rendered from the actual authored geometry with shadows:
71,832 bytes for desktop and 28,930 bytes for the portrait image. It remains
usable with JavaScript disabled or WebGL unavailable. The optional live canvas
replaces the image only when ready; failure retains the image and native links.
There is no CPU 3D renderer fallback in this homepage.

The live runtime constructs and draws procedural terrain before awaiting any
image/model request. Complete original architectural models then form the first
useful hero frame, without waiting for image textures, fonts or the cat. Surface
refinement and cat loading follow that frame. The homepage request graph no
longer includes the study's furniture, photo walls, wallpaper, decorative objects
or old room loading sequence. Existing content pages remain accessible normally.

## Composition, physical support and rendering

The open basalt plaza extends approximately x −24..24 and z −20..18, with its
walking surface at y 0.05. A broad arrival stair connects a lower sea terrace;
layered cliffs descend to −12.7 and the sea is at −10. Three smoothly shaded
ridge layers and uneven clustered pine crowns provide background depth.

Monument centers are auditorium [−12, −7], castle [13, −9], bank [9, 8] and statue
[−4, 5] in x/z. Their foundations begin at y 0.049 against the y 0.05 paving,
with a controlled 1 mm inset. The cat's body floor is y 0.052 and its contact
plane y 0.051. Its effective source scale is 6×, keeping it readable in the
large landscape. Original monument geometry remains intact; uniform transforms
and compatible static merging provide world placement and lower submission cost.

The production camera starts at [38, 25, 48], looking at [0, 3, 0], with a
43-degree perspective field of view. Portrait distance adapts to aspect ratio.
Orbit/focus/zoom retain finite camera positions and avoid occupied monument
bounds. The camera explores an open composition rather than entering a room.

One shadow-casting directional light uses intensity 3.2 at [−30, 55, 30], a
2048 maximum shadow map and PCF soft filtering. Real paving, architecture and
sea receive shadows. Fog density is 0.0036. Moving shadow refresh is limited to
10 Hz; the live draw budget is at most 30 FPS. Paused/unchanged views and hidden
tabs suppress unnecessary work. These settings are budgets, not measured FPS.

## Geometry, asset and loading budgets

| Component | Budget/result |
| --- | --- |
| Landscape | 28,360 triangles; 13 draw objects |
| Four monuments | 279,868 triangles; 115 draw objects |
| Generated landscape textures | Four maps, maximum 512 px; no external requests |
| Overview cat | 498,248 bytes; 20,884 triangles |
| Previous room cat | 3,340,500 bytes; 213,534 triangles |
| Original optional detailed cat | 8,813,840 bytes; approximately 1.5 million triangles |

The overview cat reduces transferred bytes by about 85% and triangles by about
90% relative to the previous room version. It preserves the supplied coat,
37-bone rig and six authored animation clips. The original full-detail asset
is unchanged and loads only for explicit cat focus. Reset returns to the small
world version. Delayed/aborted loading cannot resurrect a disposed scene.
The ocean uses one material with analytic GPU waves and a shared procedural
relief sampler, without a reflection render target or particle system.

## Source/build integration

`npm run build:world` uses esbuild to produce a tree-shaken, split ESM runtime
and lazy chunks under `scene/`. Source modules remain inspectable. Emitted files
stay in that directory so `import.meta.url` references continue resolving to
sibling `models/`, `images/` and `js/vendor/draco/` resources. Deployment serves
the repository root as the site root; `CNAME` remains `kimutoshiki.com`.
No production Node server or package installation is required by visitors.

## Verification and limits

`node scripts/verify-world.mjs` passed 12 groups of checks. They cover synchronous
terrain/architecture readiness, original model geometry, foundation contact,
resource disposal, progressive asset behavior, real shadow configuration, cat
rig/LOD ownership, pause/input/resize/background behavior, failure recovery,
6,144 camera positions, and initial HTML/native navigation/poster budgets.
The integrated 14-script run (13 retained geometry/interaction checks and the
new world check) passes. A fifteenth UI check also passes: unsupported or
throwing WebGL2 contexts cause zero engine imports and preserve the accessible
poster/navigation. The old navigation assertion now verifies the five native
links rather than requiring obsolete wall-label markup. Final source-world and
UI regressions were rerun after context reuse was added.

Desktop and portrait posters were reviewed using actual geometry and a Blender
96-sample shadowed render. This is offline render evidence. Browser/WebGL tools
were unavailable, so no actual WebGL visual test, device FPS, GPU timing or
browser loading-time measurement is claimed. No skill gate is represented as
approved by this report. Implementation and review preparation are complete.
Automatic approval review rejected merging this substantially redesigned version
into main because the previous publication approval covered the earlier release.
PR #6 remains reviewable, and explicit authorization to publish this version is
the remaining step. The production site is still the preceding study release.
