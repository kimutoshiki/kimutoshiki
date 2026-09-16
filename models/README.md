# Supplied animated tabby

These GLB assets were converted from the website owner's `Tabby_Cat_Animated_v2.blend`. The original file is unchanged. Full source and output SHA-256 hashes, mesh counts, measurements and conversion limitations are recorded in [tabby-cat.provenance.json](tabby-cat.provenance.json).

| Asset | Use | Size | Triangles |
| --- | --- | ---: | ---: |
| `tabby-cat-room.glb` | Normal room view | 3,340,500 bytes | 213,534 |
| `tabby-cat.glb` | Close inspection | 8,813,840 bytes | 1,509,248 |

Both files use the original 37-bone skeleton and its six authored animations. Units are meters, +Y is up and +Z is forward. The high-detail Idle bounds are 0.269157 m wide × 0.488755 m tall × 0.838254 m long. Its paw minimum is Y=0.001213 m before runtime placement.

| Animation | Duration |
| --- | ---: |
| Idle | 4.0 s |
| Walk | 1.333333 s |
| Run | 0.733333 s |
| Jump | 2.5 s |
| Lie_Roll_Rest | 7.4 s |
| Stretch | 4.1 s |

All clips begin at zero. Walk and Run animate in place. Walk's foot travel is approximately 0.124 m, and its planted-foot speed is approximately 0.142 m/s at unit scale; the runtime advances the model at that speed multiplied by its scale. Named bones include `head`, `root`, `MASTER`, `foot.F.L`, `foot.F.R`, `foot.H.L` and `foot.H.R`.

The high-detail asset keeps the original body, groom and whisker geometry. The room asset keeps a stable, spatially distributed subset of complete groom strands, lowers curve divisions and simplifies the body surface to 99,338 triangles. On 10,457 original body samples, the final decoded room surface differs by at most 0.0961 mm (99th percentile 0.0413 mm). Original dense vertex-painted stripes are baked before simplification to a 2048-pixel JPEG at quality 95 with 4:4:4 color sampling. The high asset retains original vertex color. Eye and nose procedural colors are baked to 512/256-pixel PNGs. All materials are opaque, including the geometric groom.

Standard glTF skinning uses the strongest four influences and renormalizes them; some original vertices had up to seven. Comparing nine source poses per clip across all body vertices measured maximum differences of 1.27 mm in Idle, 9.68 mm in Walk and 23.56 mm in Lie_Roll_Rest, at original scale. Per-clip bounds are recorded in the provenance JSON. The original rig and animations are retained; this weight limit is the documented conversion compromise. Subpixel procedural microbump cannot be represented directly by the exported standard material nodes. Authored sheen strengths are explicitly carried into glTF's sheen color to avoid a washed-out coat.

The .blend's studio geometry, lights, camera and packed reference photographs are excluded. No new ownership or licensing assertion is made for the supplied model.

## Reproduce

Use Blender 5.2.1 with automatic script execution disabled. The exporter only changes its temporary in-memory scene and never saves the source .blend.

```text
blender --background --factory-startup --disable-autoexec SOURCE.blend --python scripts/export-tabby-cat.py -- --audit AUDIT_DIRECTORY --variant high
blender --background --factory-startup --disable-autoexec SOURCE.blend --python scripts/export-tabby-cat.py -- --audit AUDIT_DIRECTORY --variant room
node scripts/optimize-tabby-gltf.mjs --asset models/tabby-cat-room.glb --audit AUDIT_DIRECTORY
```

The last command requires Sharp; `--sharp ABSOLUTE_MODULE_PATH` can select an existing installation. It compresses only the room coat image and leaves geometry and animation buffers unchanged. Draco decoding is required in the browser.

For visual comparison, re-import and render the GLBs using `scripts/render-tabby-export.py` with `--asset` and `--audit`. Both final assets were checked this way at Idle and Walk poses. The repository's runtime test fixture also decodes both through the actual GLTFLoader and Draco WASM, checks finite geometry and normalized weights, exercises all six animations and verifies room/detail switching.
