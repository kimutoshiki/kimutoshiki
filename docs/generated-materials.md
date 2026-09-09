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
  Ginger and ivory fur cover the sculpted body, tail and paws. Existing facial
  markings, nose, eyelids, ears and whiskers are retained.
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
not assert exact brick-course counts. The software fallback supports albedo but
does not reproduce the GPU's bump detail, shadows, animation or metal reflections.

## Verification

`node scripts/verify-3d.mjs`: 130 actual scene/control frames, original geometry
counts for all five subjects, four opaque clock faces, closed room, six directional
views, 0.65–6× zoom, object selection, pointer cancellation, pinch continuation,
portrait resize and cache transitions.

`node scripts/verify-surfaces.mjs`: dimension-based UV buckets preserve instance
transforms and bounds; successful, failed and late-disposed texture requests;
UV-only changes; actual textured triangle pixels and late image refresh in the
software renderer; nine WebP signatures and the image transfer budget.

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
