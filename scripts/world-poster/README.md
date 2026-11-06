# World poster pipeline

The initial-view posters render the actual authored Three.js home, grounded landscape, four original landmarks and original animated cat. They appear while the optional WebGL scene loads. These helpers run offline in Blender; they do not validate browser or WebGL output.

Use Node with the repository lockfile and Blender **4.3.2** (including its bundled NumPy). Native canvas is a development dependency and is not sent to visitors.

```sh
npm ci
node scripts/world-poster/export.mjs --out /tmp/kimutoshiki-world-poster
blender --background --factory-startup --threads 8 --python scripts/world-poster/render.py -- --input-dir /tmp/kimutoshiki-world-poster preview
blender --background --factory-startup --threads 8 --python scripts/world-poster/render.py -- --input-dir /tmp/kimutoshiki-world-poster review
blender --background --factory-startup --threads 8 --python scripts/world-poster/render.py -- --input-dir /tmp/kimutoshiki-world-poster desktop
blender --background --factory-startup --threads 8 --python scripts/world-poster/render.py -- --input-dir /tmp/kimutoshiki-world-poster mobile
node scripts/world-poster/encode.mjs --input-dir /tmp/kimutoshiki-world-poster --output-dir images/world --manifest docs/world-poster-manifest.json
```

Omitting directory options uses the ignored `work/world-poster/` directory. The renderer accepts `--mode VIEW` or a positional view. `preview` and `preview-mobile` use 32 samples; `desktop` and `mobile` use 192 with an adaptive threshold of 0.008. `review` renders the doorway, garden, reverse house exterior and cat contact at 32 samples; individual names also work. `--samples N` overrides samples for diagnostic work. Each view writes a PNG and reusable `.blend` file. Keep intermediate buffers, textures, PNGs and Blender files out of version control.

`export.mjs` imports the real landscape, landmark and home factories and shared surface loader. It preserves evaluated geometry, supplied normals, UVs, material groups, vertex and instance colors, world transforms and actual image pixels. The existing Draco fixture helper decodes the original cat rig; its test image placeholders are replaced with the source GLB's embedded images. The home factory installs that real rig at its production position and scale. The poster bakes the actual `Idle` animation at +0.8 seconds. No proxy props, replacement models or generated concept images are added.

The initial camera and architectural review views come from `scene/world-layout.js`. Both desktop and portrait retain the same physical position and target as production. The shared `worldFov(aspect)` helper supplies the production vertical field of view: 62° desktop and 78° portrait. Desktop renders at 1600×1000 and portrait at 650×1000. Portrait does not move the camera backwards through the room wall.

`render.py` converts coordinates with `(x, -z, y)`, preserving handedness and source normals. It translates textures, UV orientation, alpha maps, material opacity, unlit surfaces and original point lamps into Cycles materials and lights. CPU Cycles supplies directional shadows and indirect light, with exponential-squared distance fog and the AgX display transform. Cycles lighting and material responses approximate the interactive renderer; differences from Three.js ambient illumination, environment reflections, shadow maps and tone mapping remain. Denoising is disabled so OpenImageDenoise is not required.

`encode.mjs` encodes each rendered PNG directly to WebP without content edits or overlays. It starts at quality 84 and lowers quality only as needed to meet **100,000 bytes desktop / 50,000 bytes portrait**. If desktop quality 40 still exceeds 100,000 bytes, the permitted ceiling is 150,000 bytes to preserve detail and raster size. Portrait always stays within 50,000 bytes; exceeding either hard limit fails. Both preferred and applied budgets are recorded. `--manifest` deliberately updates the provenance record after the renders have been reviewed. Without that flag it leaves the manifest unchanged.

[`docs/world-poster-manifest.json`](../../docs/world-poster-manifest.json) records the source hashes captured at export, camera, cat pose, lights, render settings and final image hashes. The `encodingScript` field records the encoder actually used for the final WebP stage, independently of the earlier export snapshot. Renderer versions, native canvas, platform fonts and hardware can affect reproduction; hashes describe the reviewed outputs, not a promise of identical bytes across platforms. Re-export after changing any scene source or renderer helper so the snapshot and provenance stay aligned.

When exterior geometry changes after an inward-facing room poster has already been rendered, keep that poster's captured source hashes. Render the affected exterior views from a fresh export and record them under a separate `outdoorReview` provenance entry with its own cameras, source hashes and image hashes. Do not relabel old pixels with a newer scene hash. This distinction describes the committed room posters and the later paving-union review images.
