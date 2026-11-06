# Study refinement — 6 November 2026

The existing Three.js portfolio room now uses deeper walnut, quieter olive
joinery, a leather writing inset and a parquet floor. The animated supplied cat
and all four original desk monuments remain the scene's principal objects.
Source/cache version: `20261106-craft1`.

## Existing-room contract and scope

This is a portfolio viewed through an orbit/inspection camera, not a walking
simulation. The opaque shell, real rear window aperture, photo collection,
content links and keyboard/touch controls remain. The camera stays inside the
existing envelope: minimum `[-6.22, 0.22, -1.19]`, maximum
`[6.22, 6.25, 9.12]`. Its active perspective field of view is 50 degrees, near/far planes
are 0.025/80, and the initial focus remains the writing desk. Room pitch stays
within 0.025–0.34 radians; isolated-object inspection permits up to 0.48.

The cat retains its supplied meshes, coat materials, skeleton and authored
animation clips. The monuments remain 大隈講堂, 大隈重信像, 唐津城 and 旧唐津銀行;
their original architectural geometry and uniform scale are preserved. Their
mounts and material finishes receive the additional detail. All 30 photographs,
five rugs, drawers, moving blinds and object-specific interactions remain.

The user's request explicitly authorizes design choices for supporting objects
and removal of unrelated decoration. That is the recorded Function-stage scope
authorization, not an assertion that the skill's separate design/review gates
have been approved. This is an in-place procedural-source revision. No Blender
composition, Meshy request, model export, paid service or new external asset
submission was performed. Form work is revised source only. WebGL Runtime visual
approval remains pending; no production deployment is authorized by this report.

## Appearance and geometry

- Walnut, olive paint, subdued brass and stoneware have distinct roughness and
  relief. A small generated leather grain supports the desk inset. Alternating
  parquet replaces the previous floor drawing at the same 1024 × 1024 size.
- Side-wall backing meets the shell; raised rails and front panels add actual
  depth. Toy houses become books. Two decorative mushroom lights become
  brass-stemmed enamel reading lamps. Unused decoration builders and their
  geometry allocations are removed.
- Monument mounts gain shaped edges, brass-backed plaques and fasteners. Stone,
  masonry, roof and bronze material separation is refined. Miniature draw objects
  remain 115; mounting detail adds 432 triangles and 16,864 geometry-buffer bytes.
- Sun and desk-light normal bias is 0.006 to reduce detached contact shadows.
  Twelve furniture-foot contact patches share one instanced draw. Four narrow
  cornice strips provide restrained ambient contact. These use small generated
  textures, without another shadow-map or screen-space postprocessing pass.

## Loading and rendering budgets

No new external image or model download is introduced. Existing surface WebPs
sum to 926,384 bytes. Remaining decorative textile images sum to 524,950 bytes.
The room cat remains 3,340,500 bytes; its optional full-detail version remains
8,813,840 bytes and is requested only for a sufficiently close visible view.
The leather roughness texture is 128 × 128; the reflection environment remains
256 × 128. The new cornice contact texture is 8 × 64 and foot contacts reuse the
existing 128 × 128 contact map.

Supersampling targets 4.2 million framebuffer pixels, capped at 2× and never
below native 1× CSS resolution. A native viewport larger than the target can
therefore exceed it. Sun shadow resolution remains at most 4096, limited by device
capability; the desk shadow remains 1024. The existing 100 ms moving-shadow cadence
and approximately 30 FPS animation budget are retained. Hidden tabs and unchanged
paused/inspection views avoid redundant work. These are implementation budgets,
not measured device frame rates.

Room construction no longer waits for cat download/decode. The original cat is
installed when available; its controls stay disabled until that point. Late
results after disposal are released. Initial room readiness requires at least
two frames and front-photo/navigation readiness, with a 10-second readiness
escape; the UI also has an 18-second fallback. Photo requests remain limited to
two concurrent loads, and other wall photographs/maps stay visibility-driven.

## Verification and remaining review

The complete 13-check Node suite passed after integration. It covered
preservation of geometry attributes and ray hits, photo loading,
room bounds, real owned actions, all five non-overlapping rugs, cat animation and
LOD, clocks, controls, and disposal. Syntax and whitespace checks also passed.
The progressive-loading check additionally covers delayed/failed cat loading,
immediate paused picking after installation, and disposal of late responses.
A focused regression passes for DPR-only monitor changes: the paused view draws
once at the new ratio, then performs zero extra draws across three unchanged
frames. The full 13-check run and this final focused regression both pass.

CPU fallback renders were generated for front/day, front/night, side/back views,
cat and monument close-ups. The front day/night images were visually inspected
for composition, material separation and retained hero visibility. Software
rasterization cannot validate WebGL shadow bias, reflections, GPU timing or
browser-specific behavior. No GPU benchmark is claimed. Final WebGL runtime
visual approval and production deployment remain pending.

Review images use the actual CPU fallback, with the original cat texture pixels
and all visible photo requests settled. They are review evidence only and are
not requested by the production page:

- [Previous front view](concepts/refinement-20261106-before.webp)
- [Refined front view, day](concepts/refinement-20261106-day.webp)
- [Refined front view, night](concepts/refinement-20261106-night.webp)
- [Refined right wall](concepts/refinement-20261106-right.webp)
