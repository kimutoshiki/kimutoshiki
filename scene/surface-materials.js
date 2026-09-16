/* Generated image albedos on the site's original meshes. Texture loading never
 * blocks the first frame; a failed image keeps the existing authored material.
 * See docs/generated-materials.md for provenance and exact generation prompts. */
export const SURFACES = {
  walnut: { file: 'walnut', tint: '#ffffff', roughness: .56, span: 1.4, bumpScale: .009 },
  stone: { file: 'sandstone', tint: '#f2f0e8', roughness: .88, span: 2, bumpScale: .012 },
  brick: { file: 'brick', tint: '#fff5ec', roughness: .86, span: 2.6, bumpScale: .018 },
  slate: { file: 'slate', tint: '#d6e1e2', roughness: .79, span: 3, bumpScale: .008 },
  plaster: { file: 'plaster', tint: '#ffffff', roughness: .95, span: 3, bumpScale: .014 },
  leaf: { file: 'leaf', tint: '#ffffff', roughness: .53 },
  ginger: { file: 'ginger-fur', tint: '#f3e4ce', roughness: .96 },
  ivory: { file: 'ivory-fur', tint: '#fff3dd', roughness: .98 },
  linen: { file: 'burgundy-linen', tint: '#f3d9cc', roughness: 1 },
  feather: { file: 'sparrow-feathers', tint: '#ead5b7', roughness: .91 },
  petal: { file: 'daisy-petal', tint: '#fff2df', roughness: .82 },
};

export function surface(material, key, options = {}) {
  if (!material || !SURFACES[key]) return material;
  material.userData.surface = { key, ...options };
  return material;
}

// A per-face projection gives custom roof / stone buffers the UVs they lack.
// Never changes an existing UV layout, position, index, normal or mesh transform.
export function ensureSurfaceUV(T, geometry, span = 1) {
  if (geometry.getAttribute('uv')) return;
  const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
  if (!p || !n) return;
  const data = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = Math.abs(n.getX(i)), y = Math.abs(n.getY(i)), z = Math.abs(n.getZ(i));
    data[i * 2] = (y >= x && y >= z ? p.getX(i) : x > z ? p.getZ(i) : p.getX(i)) / span;
    data[i * 2 + 1] = (y >= x && y >= z ? p.getZ(i) : p.getY(i)) / span;
  }
  geometry.setAttribute('uv', new T.BufferAttribute(data, 2));
}

// Unit boxes otherwise stretch one brick or grain image over an entire wall.
// Bucket only rigid boxes by physical size, sharing UV buffers within each size.
// Instance matrices, colors, triangle counts and structural groups stay intact.
export function prepareBoxSurfaceUVs(T, root) {
  const meshes = [], cache = new Map(), transform = new T.Matrix4(), scale = new T.Vector3();
  root.traverse(o => { if (o.isMesh && !o.geometry.userData.surfaceUVPrepared && o.geometry.type === 'BoxGeometry' && !Array.isArray(o.material) && SURFACES[o.material.userData.surface?.key]?.span) meshes.push(o); });
  function scaledGeometry(source, size, span) {
    const key = source.uuid + ':' + size.toArray().map(n => n.toFixed(4)).join(',') + ':' + span;
    if (cache.has(key)) return cache.get(key);
    const g = source.clone(), uv = g.getAttribute('uv'), normal = g.getAttribute('normal');
    const dimensions = source.parameters;
    const sx = size.x * dimensions.width / span, sy = size.y * dimensions.height / span, sz = size.z * dimensions.depth / span;
    for (let i = 0; i < uv.count; i++) {
      const x = Math.abs(normal.getX(i)), y = Math.abs(normal.getY(i));
      uv.setXY(i, uv.getX(i) * (x > .5 ? sz : sx), uv.getY(i) * (y > .5 ? sz : sy));
    }
    uv.needsUpdate = true; cache.set(key, g); return g;
  }
  for (const mesh of meshes) {
    const spec = SURFACES[mesh.material.userData.surface.key];
    if (!mesh.isInstancedMesh) {
      mesh.geometry = scaledGeometry(mesh.geometry, mesh.scale, spec.span);
      continue;
    }
    const buckets = new Map();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, transform); scale.setFromMatrixScale(transform).multiply(mesh.scale);
      const geometry = scaledGeometry(mesh.geometry, scale, spec.span);
      if (!buckets.has(geometry)) buckets.set(geometry, []);
      buckets.get(geometry).push(i);
    }
    if (buckets.size === 1) { mesh.geometry = buckets.keys().next().value; continue; }
    const color = new T.Color();
    for (const [geometry, indices] of buckets) {
      const part = new T.InstancedMesh(geometry, mesh.material, indices.length);
      part.name = mesh.name; part.userData = { ...mesh.userData };
      part.position.copy(mesh.position); part.quaternion.copy(mesh.quaternion); part.scale.copy(mesh.scale);
      part.castShadow = mesh.castShadow; part.receiveShadow = mesh.receiveShadow;
      part.visible = mesh.visible; part.layers.mask = mesh.layers.mask; part.renderOrder = mesh.renderOrder;
      indices.forEach((index, i) => {
        mesh.getMatrixAt(index, transform); part.setMatrixAt(i, transform);
        if (mesh.instanceColor) { mesh.getColorAt(index, color); part.setColorAt(i, color); }
      });
      part.computeBoundingBox(); part.computeBoundingSphere(); mesh.parent.add(part);
    }
    mesh.removeFromParent();
  }
}

export function loadSurfaceMaterials(T, root, { onLoad = () => {}, anisotropy = 4 } = {}) {
  prepareBoxSurfaceUVs(T, root);
  const materials = new Set(), jobs = new Map(), retained = new Set(), textures = new Set();
  let disposed = false;
  root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const tag = m?.userData.surface;
      if (!tag) continue;
      ensureSurfaceUV(T, o.geometry, SURFACES[tag.key].span);
      materials.add(m);
    }
  });
  const loader = new T.TextureLoader();
  for (const material of materials) {
    const tag = material.userData.surface, spec = SURFACES[tag.key];
    const repeat = tag.repeat || [1, 1];
    const id = spec.file + ':' + repeat.join(',');
    if (!jobs.has(id)) jobs.set(id, { spec, repeat, materials: [] });
    jobs.get(id).materials.push(material);
  }
  for (const { spec, repeat, materials: targets } of jobs.values()) {
    const url = new URL('../images/materials/' + spec.file + '.webp', import.meta.url).href;
    loader.load(url, texture => {
      if (disposed) { texture.dispose(); return; }
      textures.add(texture);
      texture.name = 'Generated surface: ' + spec.file;
      texture.colorSpace = T.SRGBColorSpace;
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.repeat.set(...repeat);
      texture.anisotropy = Math.min(4, Math.max(1, anisotropy));
      texture.minFilter = T.LinearMipmapLinearFilter;
      texture.magFilter = T.LinearFilter;
      // Color and relief need distinct color spaces, but all materials using
      // this image/repeat can share the same relief sampler and GPU upload.
      let relief;
      for (const material of targets) {
        const tag = material.userData.surface;
        if (material.map) retained.add(material.map);
        material.map = texture;
        material.color.set(tag.tint || spec.tint);
        material.roughness = tag.roughness ?? spec.roughness;
        const bumpScale=tag.bumpScale??spec.bumpScale;
        if(bumpScale){
          if(!relief){relief=texture.clone();relief.colorSpace=T.NoColorSpace;relief.needsUpdate=true;textures.add(relief);}
          if(material.bumpMap)retained.add(material.bumpMap);material.bumpMap=relief;material.bumpScale=bumpScale;
        }
        material.needsUpdate = true;
      }
      onLoad(spec.file);
    }, undefined, () => { /* Keep the already-visible authored material. */ });
  }
  return {
    count: materials.size,
    dispose() { disposed = true; textures.forEach(t => t.dispose()); retained.forEach(t => t.dispose()); },
  };
}
