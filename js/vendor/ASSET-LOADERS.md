# Three.js asset loaders

`GLTFLoader.js`, `DRACOLoader.js`, `SkeletonUtils.js` and `BufferGeometryUtils.js`
come from the official [Three.js r185 distribution](https://github.com/mrdoob/three.js/tree/r185/examples/jsm).
Only module specifiers were changed to use the same vendored Three.js instance.
They are covered by `THREE-LICENSE.txt`.

The `draco/` decoder files come from that distribution's `libs/draco/gltf/`
directory and run locally in browser workers. Google's Apache 2.0 license is
included as `draco/LICENSE.txt`. No CDN or third-party model service is used.
