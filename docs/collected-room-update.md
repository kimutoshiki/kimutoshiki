# Collected room decoration — 2026-09-09

The clock label is now 「現在の時刻」. The visitor-local clock and automatic
morning/day/evening/night lighting continue unchanged.

Four built-in image-generation requests guided this update: a furnished room
concept, an original art atlas, a textile/wicker atlas and a botanical wallpaper.
The first concept was used to model individual objects in Three.js. After the
first geometry pass, actual software-renderer views showed oversized rug
repetition, intersecting side shelves and unnecessary flower geometry. The
second pass corrected those issues and completed the larger floor rug. The
final wallpaper request then supplied the remaining wallcovering. Exact prompts
and original output dimensions are in `decor-generation-prompts.md`.

## Generated images and geometry

- Four botanical/bird/moon/pear artworks sit inside real wood-and-brass frames.
- Two cubby cabinets hold ceramic birds, little houses, pitchers, vases and books.
  Longer side ledges and asymmetrical art groups continue toward the entrance.
- A slim rear cabinet, low entrance console, two tea tables, two velvet ottomans,
  baskets with draped throws, and mushroom lamps add floor-level collections.
- A burgundy rug beneath the desk and layered green/round rugs cover wider floor
  areas. The original rug now uses normalized top-face UVs so the whole motif
  appears once, rather than repeating once per world unit.
- Five botanical wallpaper panels sit inside the existing opaque walls. They
  preserve the rear window opening, original photographs, door and wall lamps.
- Cupped leaves, daisies, crescent mobiles and a pleated pendant have 12 independent
  moving groups. Static geometry is batched; changing animation time sways only
  these groups. Paused/reduced-motion and software fallback keep them still.
- Generated images supply surface art and material appearance. Furniture, handles,
  vessels, flowers, leaves and ornaments have actual 3D geometry. Mirrors use
  silver-blue material; they do not compute live room reflections.

The original four architectural miniatures, cat geometry and material, photograph
aspect ratios, content links and 0.65–6× controls are retained.

## Images delivered to the site

Atlas A is 1254×1254; its four 627×627 quadrants were scaled to 512×512.
Atlas B has a slightly offset horizontal boundary, so its actual usable regions
were extracted independently. Coordinates below are `[left, top, width, height]`.

| File in images/decor | Source | Source region | Delivery dimensions |
| --- | --- | --- | --- |
| botanical-berries.webp | Art atlas | [0,0,627,627] | 512×512 |
| songbird-print.webp | Art atlas | [627,0,627,627] | 512×512 |
| moon-garden.webp | Art atlas | [0,627,627,627] | 512×512 |
| pear-blossom.webp | Art atlas | [627,627,627,627] | 512×512 |
| burgundy-rug.webp | Textile atlas | [0,0,627,609] | 768×768 |
| forest-rug.webp | Textile atlas | [628,0,626,603] | 640×640 |
| honey-wicker.webp | Textile atlas | [0,622,627,632] | 512×512 |
| forest-velvet.webp | Textile atlas | [632,617,622,637] | 512×512 |
| botanical-wallpaper.webp | Wallpaper | Whole 1254×1254 image | 768×768 |

The nine runtime images total 1,010,052 bytes. Existing material images are reused
for walnut, burgundy linen and leaves. Concept and implementation images in
`docs/concepts/` are review artifacts and are not requested by the homepage.
No image-generation model-version claim is made; the built-in tool has no version
selector.

## Validation

The finished decoration has 1,743 primitives/instances, 162,022 triangles and 156
mesh draw calls, excluding the pre-existing room. This is about 35.5% fewer
triangles than the first pass (251,212), chiefly by reducing tessellation for tiny
flower petals and centers while retaining the larger object's smooth geometry.

`verify-decor.mjs` checks generated-image loading/disposal, artwork UVs, batching
budget, physical room bounds, floor contact, side-shelf separation and ten initial
content sightlines. It also checks independent animation and a held pose.
`verify-3d.mjs` verifies the actual scene/controls and original model geometry,
including 130 checked control frames, all five isolated inspection subjects,
room closure and return, raycast-based selection and portrait zoom behavior.
`verify-room-time.mjs` verifies local time, midnight, timezones, paused software
refresh, and the shared head/body material with the new decoration present.

Native canvas software-renderer views of the front, side walls, entrance and floor
were inspected through three iterations. A final night render confirms the warmer
software path remains readable. These are genuine geometry renders, not generated
website screenshots. Browser/device-specific WebGL rendering has not been tested.
