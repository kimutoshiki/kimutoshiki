# Generated surface update — 2026-09-09

Three original raster images were created with the built-in image generation tool
for this site. The callable tool does not expose a model-version selector, so no
specific “2.5” model or release-date claim is made. Actual originals are 1254 ×
1254 pixels despite 2048 × 2048 prompts. They are retained in the image-generation
conversation. No third-party photograph was used as a material texture.

The selected atlas quadrants were extracted, downscaled and encoded as WebP.
Nine delivery textures total 705,040 bytes (about 689 KiB). See
`material-sources/manifest.json` for dimensions, quadrant coordinates and sizes.

## Integration

- Original geometry, model proportions, photographs, text and navigation remain.
- Walnut surfaces cover desk wood, shelves, wall paneling and miniature bases.
- Sandstone, plaster, brick and slate are explicitly tagged in model factories;
  clock faces, glass, bronze vertex colors and copper stay separate.
- Leaf veins use the existing curved leaf geometry and instance color variation.
  Ginger fur now uses one shared material across the sculpted head, body and
  tail, with head UVs scaled to match the visible hair density. Ears use the same
  ginger image with subtle inner-ear vertex color. Ivory paws, the sculpted nose,
  eyelids and whiskers remain. This fixes the older painted face conflicting with
  the generated coat.
- Burgundy woven fabric appears on the chair cushion and throw. The same walnut,
  plaster and linen images appear in photo frames, reading surfaces and footers.
- Rigid box geometry receives UV coordinates scaled to physical dimensions.
  Instances with equal dimensions share a buffer. Existing instance transforms,
  colors, positions and triangles are preserved. Custom roof/stone meshes lacking
  UV coordinates receive normal-based planar UVs without position changes.
- Asset requests start after constructing the first scene. Existing authored
  materials stay visible until a generated map loads; failures preserve them.
  Maps are shared per surface and repeat setting. Loading refreshes paused scenes.
- The legacy campus CPU fallback is replaced with the UV-aware room renderer.
  This prevents textured architectural meshes being mistaken for clock images.
- Less procedural fallback fur painting reduces work before first display.
  Warm-neutral daylight reduces the strong yellow cast over the new albedos.

These are albedo improvements, not newly surveyed building geometry or measured
PBR scans. Existing subtle bump maps remain independent. Slate contains some
baked overlap shading. Architectural UV projection is an approximation; it does
not assert exact brick-course counts. The software fallback supports albedo and time-based brightness/color but
does not reproduce the GPU's bump detail, directional shadows, plant/pet
animation or metal reflections. Both renderers update the clock hands.

## Local time, clock and light correction

`scene/room-time.js` derives lighting and the shelf clock from the same local
`Date` snapshot. The visible 24-hour clock displays that time too. The default
is automatic; the light button cycles automatic → day → night → automatic.
Manual light choices never change the clock. The visitor's device timezone is
used. The cycle is an artistic civil-time schedule, not geolocated sunrise,
seasonal astronomy or live weather: dawn ramps from 06:00 to 08:00, daylight
fades from 17:00 to 20:00, and warm indoor light stays on throughout the night.

Shelf hands are separate pivot meshes, updated once per minute rather than baked
into static detail instances. A fresh Date is sampled during rendering and when
the tab becomes visible. This continues with motion paused or reduced motion
selected. Software rendering refreshes the hands' cached world coordinates and
its brightness/tint, while WebGL refreshes the light direction and shadow map.
The sun returns gradually overnight, avoiding a position jump at midnight.
Geometry is not rebuilt every frame in the software path.

Increased hemisphere, ambient and fill light plus a weaker screen vignette keep
furniture and the cat readable in day and night modes. Inspection views also
use a lighter background and edge shading. No new image downloads are needed.

## Verification

`node scripts/verify-3d.mjs`: 130 actual scene/control frames, original geometry
counts for all five subjects, four opaque clock faces, closed room, six directional
views, 0.65–6× zoom, object selection, pointer cancellation, pinch continuation,
portrait resize and cache transitions.

`node scripts/verify-surfaces.mjs`: dimension-based UV buckets preserve instance
transforms and bounds; successful, failed and late-disposed texture requests;
UV-only changes; actual textured triangle pixels and late image refresh in the
software renderer; nine WebP signatures and the image transfer budget.

`node scripts/verify-room-time.mjs`: 1,440 local minutes, clock angles, timezone
and repeated DST hour, manual lighting without clock changes, actual paused
software scene/cache updates, tab suspension and midnight rollover, shared head
and body material before/after the generated image arrives. Pixel tests also
verify day/night gain reaches textured midtones without rebuilding geometry.

No browser screenshot or device-specific GPU visual verification was performed.

## Exact generation prompts

### Walnut

Use case: stylized-concept.
Asset type: production raster PBR albedo texture for the wooden desk and furniture in an elegant interactive 3D portfolio.
Primary request: create one square 2048x2048 seamless warm medium walnut wood surface.
Style/medium: photoreal natural wood material surface, luxurious but quiet and restrained.
Composition/framing: orthographic flat surface fills the entire square, thin horizontal natural grain, restrained small knots, no planks and no gaps; opposite edges tile seamlessly.
Lighting/mood: completely uniform neutral illumination suitable for an albedo map, no lighting gradient and no baked cast shadows or glossy highlights.
Color palette: warm medium walnut brown.
Constraints: only the wood material; no scene, interface, object outlines, text, labels, numbers, watermark, borders, perspective or bevels.

### Architecture atlas

Use case: stylized-concept.
Asset type: production raster material atlas for albedo maps on existing 3D architectural geometry.
Primary request: create one square 2048x2048 exact 2x2 material atlas, four equal 1024x1024 square quadrants abutting exactly at the horizontal and vertical midpoint. No gutters or borders.
Top-left quadrant: warm ivory finely porous sandstone block face WITHOUT mortar, subtle horizontal mineral layers, full-frame stone surface.
Top-right quadrant: warm red brown historical Japanese bank brick, horizontal brick courses with narrow pale gray mortar, refined aged brick texture.
Bottom-left quadrant: deep charcoal Japanese roof slate, tight horizontal overlapping tile courses with understated relief.
Bottom-right quadrant: neutral ivory plaster with subtle limewash grain, full-frame plaster surface.
Style/medium: photoreal tactile material samples, quiet elegant architectural palette.
Composition/framing: all four surfaces perfectly front-on orthographic flat, each surface fills its own quadrant edge-to-edge; boundaries sit at exact half width and height.
Lighting/mood: uniform flat albedo illumination, no lighting gradients, no baked cast shadows, no reflections.
Constraints: no scene, interface, material sample cards, gaps, text, labels, numbers, watermarks, perspective, outer border or decorative framing. Render only the four material textures.

### Organic atlas

Use case: stylized-concept.
Asset type: production raster material atlas for albedo maps on existing 3D botanical, cat and textile geometry.
Primary request: create one square 2048x2048 exact 2x2 material atlas, four equal 1024x1024 square quadrants abutting exactly at horizontal and vertical midpoint. No gutters, labels or borders.
Top-left quadrant: botanical leaf surface, pale fresh sage green, fine symmetrical leaf veins with central midrib running vertically; this is a macro cropped seamless natural leaf SURFACE that completely fills the rectangle, NOT a leaf silhouette and no background.
Top-right quadrant: warm ginger tabby short cat fur, cream orange light stripes, individual short hairs point vertically; macro cropped fur surface fills entire quadrant, no animal face or body outlines.
Bottom-left quadrant: ivory short cat fur, subtle vertical silky fibers completely fill entire quadrant, no animal face or body outlines.
Bottom-right quadrant: fine wine burgundy woven linen cloth with rich natural textile microfibers, even fine weave and full-frame surface.
Style/medium: photoreal natural surface textures with a quiet elegant sage green, cream orange, ivory and burgundy palette.
Composition/framing: perfectly front-on orthographic flat, surfaces fill their quadrants edge-to-edge, boundaries exactly at half width and half height.
Lighting/mood: uniform flat albedo illumination, no lighting gradients, no baked cast shadows, no highlights.
Constraints: no scene, interface, sample cards, gaps, text, labels, numbers, watermarks, perspective, outer border or decorative framing. Render only the four material textures.


### Study garden — September 2026

Asset: images/decor/window-garden.webp. Built-in ImageGen, one generation. Original 1024 × 1536 resolution retained, WebP quality 92, 292,408 bytes. Displayed only beyond the physical window; the room and its light/shadows remain 3D geometry.

Mode: built-in image_gen; one generation, selected without further edits.

Use case: photorealistic-natural.
Asset type: one portrait background texture for the outdoor view beyond a cozy study window in a realistic 3D website.
Primary request: a beautiful quiet leafy garden in soft warm daylight, seen at eye level from several meters away. Natural layered green foliage, a light canopy of delicate leaves, subtle pale blue and warm cream sky glimpses through the upper canopy, softly lit shrubs and a little low garden greenery in the lower area. No dominant object. The foliage should read as a real lush garden with depth and gentle natural variation.
Style: high-quality natural photographic realism, softly out of focus with optical depth of field and delicate irregular bokeh, rich fine tonal gradation, restrained contrast, realistic warm sunlight filtering from upper left, sage/olive fresh greens and subtle golden highlights. The image is an atmospheric background, softly blurred optically rather than a flat pattern or digitally smeared image. Avoid strong blown-out highlights and dark hard silhouettes.
Composition: vertical portrait, approximately 2:3 aspect ratio, preferably 1024 by 1536 pixels. Scene fills the entire image edge to edge; garden canopy above, middle-distance leafy layers through center and lower portion. Calm and spatially believable, not an illustration, not a render, not a collage.
Constraints: exactly one image; no people, animals, buildings, furniture, interior, window, frame, glass reflections, curtains, geometric circles, hard outlines, text, letters, watermark, or logos.
