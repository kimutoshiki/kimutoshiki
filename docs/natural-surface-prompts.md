# Natural Surface Asset Prompts

Mode: built-in image_gen. Exactly two separate calls in one parallel batch; no variants or retries.

Original output filenames:

- Sparrow: `exec-4ffda623-58b6-4fb2-b41b-c28e8072d5a6.png`
- Daisy: `exec-e1f8a875-97a0-45c4-9510-0e237e13d6ae.png`

Both originals: 1254 × 1254 RGB PNG. Delivery encoding is documented in
`room-refinement-20260909.md`.

## Sparrow feather albedo

```text
Use case: photorealistic-natural
Asset type: square seamless albedo texture for wrapping a small realistic 3D sparrow body, head, and individual wing-feather geometry
Primary request: a photorealistic extreme close-up surface of fine, softly overlapping sparrow body feathers.
Composition/framing: square 1:1, 1024 by 1024 pixels; feather surface fills the whole frame edge-to-edge; flat orthographic material sample; seamless tiling across all four edges with no focal object.
Color palette: natural warm taupe, soft tan, and ivory, with restrained tonal variation.
Materials/textures: many small natural overlapping contour feathers, delicate feather barbs and fine soft down details, tasteful lifelike miniature natural detail.
Lighting/mood: perfectly even flat diffuse illumination suitable for a base-color/albedo map; no baked directional lighting, highlights, or cast shadows.
Constraints: only continuous feather surface, no bird silhouette, eyes, beak, feet, environment, scene, feather specimen on a background, empty margin, gutters, labels, text, logo, watermark, cartoon styling, or painted illustration.
```

## Daisy petal albedo

```text
Use case: photorealistic-natural
Asset type: square seamless albedo texture for the individual petals of a small realistic 3D daisy
Primary request: a photorealistic extreme macro continuous surface of ivory daisy petal tissue.
Composition/framing: square 1:1, 1024 by 1024 pixels; petal tissue fills the whole frame edge-to-edge; flat orthographic material sample; seamless tiling across all four edges with no focal object.
Color palette: luminous ivory and very subtle cream-blush tones, low contrast.
Materials/textures: luminous fine natural petal tissue with very subtle delicate cream-blush longitudinal veins running vertically from bottom to top; tasteful lifelike miniature natural detail.
Lighting/mood: perfectly even flat diffuse illumination suitable for a base-color/albedo map; no baked directional lighting, bright highlights, or cast shadows.
Constraints: only continuous petal tissue surface; no whole flower, flower outline, petal silhouette, daisy center, green leaf, stem, background scene, empty margin, gutters, labels, text, logo, watermark, cartoon styling, or painted illustration.
```
