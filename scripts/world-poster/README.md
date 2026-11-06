# World poster pipeline

The small initial-view posters are offline renders of the authored Three.js landscape, four original landmarks and original animated cat. They appear while the optional WebGL scene loads. These helpers do not run a browser or validate WebGL output.

Use Node with the repository lockfile and Blender **4.3.2** (including its bundled NumPy). Native canvas is a development dependency; it is not sent to website visitors.

```sh
npm ci
node scripts/world-poster/export.mjs --out /tmp/kimutoshiki-world-poster
blender --background --factory-startup --threads 8 --python scripts/world-poster/render.py -- --input-dir /tmp/kimutoshiki-world-poster desktop
blender --background --factory-startup --threads 8 --python scripts/world-poster/render.py -- --input-dir /tmp/kimutoshiki-world-poster mobile
node scripts/world-poster/encode.mjs --input-dir /tmp/kimutoshiki-world-poster --output-dir images/world
```

Omitting the directory options uses the repository's ignored `work/world-poster/` directory. The renderer also accepts `--mode desktop` or `--mode mobile`. The optional `preview` and `preview-mobile` views use 32 samples; production views use 96. Each render writes a PNG and a reusable `.blend` file in the input directory. Keep the intermediate geometry buffers, textures, PNGs and Blender files out of version control.

`export.mjs` imports the real landscape/landmark modules and shared surface loader. It preserves evaluated geometry, supplied normals, UVs, material groups, vertex/instance colors, world transforms and actual image pixels. The existing Draco fixture helper decodes the original cat rig; its test image placeholders are replaced with the source GLB's embedded images. The poster bakes `Idle` at +0.8 seconds, with the cat at `[-2.66, .052, 13]`, scale 6. The production ocean vertex shader is evaluated at time0.

`render.py` converts coordinates with `(x, -z, y)` and keeps source normals. Desktop uses the production camera `[38, 25, 48]`, target `[0, 3, 0]`, FOV 43°, at 1600×1000. Portrait moves the camera offset to 1.5 times the desktop distance and renders 650×1000. CPU Cycles provides directional sun shadows and indirect light; day fog uses `1 - exp(-(0.0036 × depth)²)` and `#93a9b2`. The cool coastal world and warm sun are display-transformed through AgX. This offline lighting is a Cycles approximation of the interactive renderer, rather than a pixel comparison with WebGL. Denoising is disabled so OpenImageDenoise is not required.

`encode.mjs` encodes both final PNG rasters directly to WebP at quality 84, without resizing, overlays or content edits. Renderer/native-canvas versions, platform fonts and rendering hardware can affect reproducibility; the committed poster hashes describe the reviewed outputs rather than promise identical bytes on every platform.

[`docs/world-poster-manifest.json`](../../docs/world-poster-manifest.json) records the source hashes, camera, cat pose, render settings and image hashes used for the committed posters. Keep that provenance record unchanged when merely rerunning the helpers; replace it deliberately when new posters are reviewed and adopted.
