# Photographs

Thirty user-supplied photographs are indexed by `scene/photo-catalog.js`.
The twenty-nine JPEG attachments were matched to their original descriptive
filenames by identical SHA-256 digests. The Waseda DNG supplies its embedded,
camera-rendered 4032 × 3024 image. No photographs were generated, replaced,
cropped, retouched, or enlarged.

| Variant | Use | Size | WebP quality |
| --- | --- | --- | --- |
| `*-thumb.webp` | Lazy-loaded gallery thumbnails | Long edge at most 640 px | 88 |
| `*.webp` | Room photographs and initial detail view | Long edge at most 1600 px | 90 |
| `*-full.webp` | Selected photograph only, on demand | Original oriented pixel dimensions | 94 |

Resize uses Lanczos resampling. Embedded source color profiles are converted
to sRGB where present; a compact sRGB profile is included in each output.
EXIF, GPS, XMP, camera identifiers, and embedded source thumbnails are removed.
The `width` and `height` fields describe the uncropped, oriented source, and
`originalName` preserves the user-supplied filename behind each designed title.

Keep the full-size variants out of preload lists and room textures. Load only
the visible room photographs, use thumbnails for the gallery, and request the
full-size variant when the visitor opens a photograph.

All 90 files were fully decoded and checked after export. The thirty thumbnail
files total 2.03 MB, room/display files total 11.30 MB, and full-resolution files
total 106.52 MB. The five initial wall photographs total 1.88 MB. The largest
individual full-resolution file is 13.10 MB (6048 × 8064 pixels).
