# Brown walls, controlled navigation and object actions

This revision responds to the follow-up on the collected room. It keeps the
existing Three.js room, content, four architectural miniatures, cat materials,
photographs and visitor-local clock. No Blender/Meshy model generation, paid
mesh service, structural opening change or replacement room was needed.

## Appearance and layout

- Upper walls use the existing botanical texture tinted walnut brown
  (`#967150`); plaster uses `#9c785a`. The ceiling is warmer and darker too.
- Daytime hemisphere/ambient strengths are 1.50/0.66; nighttime strengths are
  0.43/0.23. Day/night exposure is 1.08/0.98. The desktop lamp strengthens at
  night, while the room's background illumination decreases. Automatic light
  continues to use the same local Date as the clock, not an astronomical or
  weather simulation.
- The CPU fallback has a separate 1.08/0.59 day/night gain. Emissive lamp
  surfaces are now independent of that ambient gain rather than becoming dark
  together with the walls. This does not simulate local light transport.
- Five rugs are pairwise disjoint, including their fringes. The right rug and
  its ottoman move outward; the reading corner moves left and forward; the
  central green rug is smaller. Rug borders and fringe heights match the
  lowered rug surface.
- Birds have a rounded body and breast, separate turning head, reflective eyes,
  articulated wings, overlapping flight feathers, a fanned tail and three toes.
- Daisies have thin curved petals, curved stems, leaves, sepals and modeled
  pollen centers. Leaf materials have fine relief and a restrained waxy finish.
  Existing potted plants move their leaves, not the pot or suspension cords.

## Interaction contract

The room is an object-viewing portfolio, not a walking simulation. The primary
camera keeps the desk and four miniatures as its initial focus. Camera bounds
remain inside the opaque room shell. Vertical pan is locked; horizontal pan is
limited. Room pitch is limited to 0.025–0.34 radians, and the isolated model view
to 0.025–0.48. The former top/bottom presets and zoom multiplier label are removed.
Lens zoom buttons, wheel/pinch zoom and horizontal presets remain.

There are 53 geometry-owned interactive objects. Clicking or tapping one focuses
it in the existing room; a short lens transition completes the approach. A
repeat tap replays its own response without changing the camera again. Close-up
yaw is limited to ±0.38 radians to prevent orbiting behind its mounting wall.

| Object | Response |
| --- | --- |
| Bird | Wing flutter, head turn, tail motion and a small hop |
| Potted/trailing plant or bouquet | Brief stem/leaf sway that settles |
| Cat | Subtle sleeping-head movement |
| Moon mobile | Damped hanging-ornament swing |
| Lamp | Warm local material glow that fades back |
| Framed art, rug, clock or window flowers | Detail view without an unrelated motion |

All actions are available in the existing subject selector for keyboard users.
Enter/Space replays the focused object's response; Escape and “全体へ” restore
the room. Content links and navigation pins retain their existing behavior.
Dragging, multi-touch gestures and cancelled pointers do not trigger an action.
Paused/reduced-motion and CPU fallback retain immediate detail views but suppress
decorative animation. Each action restores its base transform; no timers per
object or cumulative transform drift are introduced.

## Images and performance

Two built-in image-generation requests supply new original surface maps:

| File | Delivered pixels | Bytes |
| --- | --- | --- |
| `images/materials/sparrow-feathers.webp` | 768 × 768 | 202,790 |
| `images/materials/daisy-petal.webp` | 512 × 512 | 18,554 |

Both originals are 1254 × 1254 RGB PNGs. The complete images were resized and
encoded as WebP, not redrawn. Color maps use sRGB; separate relief maps use
non-color data. Exact prompts are in `natural-surface-prompts.md`.

The updated collected decoration has 2,486 instances/primitives, 187,268 triangles
and 378 mesh draws. Compared with the previous version, draw batches are split
where necessary so each clickable/animated object retains its own geometry.
Minute pollen details use shared 20-triangle geometry. The native full-room
software render includes 611,742 triangles. The eleven shared material images
total 926,384 bytes; the nine previous decoration images remain 1,010,052 bytes.

## Verification and scope

- `verify-room-actions.mjs`: 53 geometry-owned actions; 30 animation responses;
  106 desktop/portrait close-ups; visible detail samples and shell containment;
  effect restoration; limits on vertical movement and close-up rotation;
  ten pairwise rug separation checks; generated color/relief loading.
- `verify-3d.mjs`: retained architecture, opaque clock chamber and room shell;
  four horizontal presets; model inspection/return; actual pointer selection,
  drag, pinch, cancellation, keyboard return and paused actions.
- `verify-room-time.mjs`: 1,440 local minutes, midnight and time-zone continuity,
  manual light modes that do not alter the clock, paused CPU refresh and shared
  cat head/body material.
- `verify-surfaces.mjs`: actual CPU texture pixel rendering, low nighttime
  ambient light, independent lamp emission, loading/disposal and transfer budget.
- `verify-decor.mjs`: bounds, supported furniture, shelf separation, original
  content sightlines, retained independent motion and artwork UVs.

Actual software-renderer views of the front, right wall, floor, bird and flowers
were inspected, including daytime and nighttime views. This is not a claim of
browser/device-specific WebGL testing or measured mobile frame rate.

Corrections during review included keeping the clock's body in its own pickable
batch (not only its hands), aiming detail views at actual wall-mounted surfaces
rather than the camera's inset envelope, and retaining emissive lamps under low
nighttime ambient light.
