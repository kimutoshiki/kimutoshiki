/**
 * A small, dependency-free CPU fallback for a static Three.js scene.
 * Usage: new StudyCanvasRenderer(canvas, THREE). Geometry is cached in world
 * space; call invalidate() after adding meshes or changing mesh transforms.
 * Images and texture versions are checked on every render, so late-loading
 * textures do not require rebuilding geometry. The caller controls frame rate.
 */
export class StudyCanvasRenderer {
  constructor(canvas, THREE) {
    if (!THREE) throw new Error('StudyCanvasRenderer requires THREE as its second argument');
    this.canvas = this.domElement = canvas;
    this.THREE = THREE;
    this.context = canvas.getContext('2d', { alpha: true });
    if (!this.context) throw new Error('A 2D canvas context is unavailable');
    this.software = true;
    this.shadowMap = { enabled: false };
    this.info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 0 } };
    this.ratio = 1;
    this.lightingGain = 1;
    this.lightingTint = [1, 1, 1];
    this.width = this.height = 1;
    this.maxWidth = 1200;
    this.maxHeight = 900;
    this._scene = null;
    this._draws = null;
    this._textureCache = new WeakMap();
    this._clear = new THREE.Color('#ded7bd');
    this._clearAlpha = 1;
    this._vp = new THREE.Matrix4();
    this._clipA = Array.from({ length: 12 }, () => new Float64Array(9));
    this._clipB = Array.from({ length: 12 }, () => new Float64Array(9));
    this._screen = Array.from({ length: 12 }, () => new Float64Array(9));
  }

  setPixelRatio(ratio) {
    this.ratio = Math.max(.25, Math.min(Number(ratio) || 1, 2));
    this.setSize(this.width, this.height, false);
  }

  getPixelRatio() { return this.ratio; }

  setSize(width, height, updateStyle = true) {
    this.width = Math.max(1, Number(width) || 1);
    this.height = Math.max(1, Number(height) || 1);
    const scale = Math.min(this.ratio, this.maxWidth / this.width, this.maxHeight / this.height);
    const w = Math.max(1, Math.round(this.width * scale));
    const h = Math.max(1, Math.round(this.height * scale));
    if (this.canvas.width !== w || this.canvas.height !== h || !this._pixels) {
      this.canvas.width = w;
      this.canvas.height = h;
      this._pixels = this.context.createImageData(w, h);
      this._packed = new Uint32Array(this._pixels.data.buffer);
      this._depth = new Float32Array(w * h);
    }
    if (updateStyle && this.canvas.style) {
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
    }
  }

  setClearColor(color, alpha = 1) { this._clear.set(color); this._clearAlpha = alpha; }
  invalidate() { this._draws = null; this._scene = null; }
  setLighting(gain, tint) { this.lightingGain = gain; this.lightingTint = tint; }
  invalidateTextures() { this._textureCache = new WeakMap(); }

  prepare(scene) {
    const T = this.THREE;
    const draws = [];
    const geometries = [];
    const instance = new T.Matrix4();
    const world = new T.Matrix4();
    const v = new T.Vector3();
    const instanceColor = new T.Color();
    const color = new T.Color();
    const light = new T.Vector3(-.4, .8, .5).normalize();
    scene.updateMatrixWorld(true);

    const visit = (object) => {
      if (!object.visible) return;
      if (object.isMesh && object.geometry) {
        const g = object.geometry;
        const position = g.getAttribute('position');
        if (position && position.count >= 3) {
          const index = g.index;
          const total = index ? index.count : position.count;
          const start = Math.max(0, g.drawRange.start || 0);
          const end = Math.min(total, start + g.drawRange.count);
          const groups = Array.isArray(object.material)
            ? g.groups.map(group => ({ start: Math.max(start, group.start), end: Math.min(end, group.start + group.count), material: object.material[group.materialIndex] }))
            : [{ start, end, material: object.material }];
          const count = object.isInstancedMesh ? object.count : 1;
          for (let n = 0; n < count; n++) {
            if (object.isInstancedMesh) {
              object.getMatrixAt(n, instance);
              world.multiplyMatrices(object.matrixWorld, instance);
            } else world.copy(object.matrixWorld);
            const orientation = world.determinant() < 0 ? -1 : 1;
            const p = new Float32Array(position.count * 3);
            for (let i = 0; i < position.count; i++) {
              v.fromBufferAttribute(position, i).applyMatrix4(world);
              p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
            }
            const geo = {
              p,
              clip: new Float32Array(position.count * 4),
              screen: new Float32Array(position.count * 4),
              codes: new Uint8Array(position.count),
              object,
            };
            geometries.push(geo);
            instanceColor.setRGB(1, 1, 1);
            if (object.isInstancedMesh && object.instanceColor) object.getColorAt(n, instanceColor);
            for (const group of groups) {
              const mat = group.material;
              if (!mat || mat.visible === false || (mat.transparent && mat.opacity < .65) || mat.isShadowMaterial) continue;
              const triangleCount = Math.floor((group.end - group.start) / 3);
              if (triangleCount <= 0) continue;
              const ids = new Uint32Array(triangleCount * 3);
              const lighting = new Float32Array(triangleCount);
              for (let i = 0; i < ids.length; i++) ids[i] = index ? index.getX(group.start + i) : group.start + i;
              for (let i = 0; i < triangleCount; i++) {
                const a = ids[i * 3] * 3, b = ids[i * 3 + 1] * 3, c = ids[i * 3 + 2] * 3;
                const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
                const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
                const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                const dot = orientation * (nx * light.x + ny * light.y + nz * light.z) / (Math.hypot(nx, ny, nz) || 1);
                lighting[i] = mat.isMeshBasicMaterial ? 1 : .72 + .28 * Math.max(0, mat.side === T.DoubleSide ? Math.abs(dot) : dot);
              }
              const attrColor = mat.vertexColors ? g.getAttribute('color') : null;
              let colors = null;
              if (attrColor) {
                colors = new Float32Array(position.count * 3);
                for (let i = 0; i < position.count; i++) {
                  color.setRGB(attrColor.getX(i), attrColor.getY(i), attrColor.getZ(i)).convertLinearToSRGB();
                  colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
                }
              }
              const uvAttribute = g.getAttribute(mat.map?.channel ? `uv${mat.map.channel}` : 'uv');
              let uv = null;
              if (uvAttribute) {
                uv = new Float32Array(position.count * 2);
                for (let i = 0; i < position.count; i++) { uv[i * 2] = uvAttribute.getX(i); uv[i * 2 + 1] = uvAttribute.getY(i); }
              }
              draws.push({ geo, ids, lighting, colors, uv, material: mat, instanceColor: instanceColor.clone(), orientation });
            }
          }
        }
      }
      for (const child of object.children) visit(child);
    };
    visit(scene);
    this._draws = draws;
    this._geometries = geometries;
    this._scene = scene;
    this.info.memory.geometries = geometries.length;
    this.info.render.triangles = draws.reduce((total, draw) => total + draw.ids.length / 3, 0);
  }

  _readTexture(texture) {
    if (!texture) return null;
    const source = texture.image || texture.source?.data;
    const sw = source?.naturalWidth || source?.videoWidth || source?.width || 0;
    const sh = source?.naturalHeight || source?.videoHeight || source?.height || 0;
    if (!sw || !sh || source.complete === false) return null;
    const cached = this._textureCache.get(texture);
    if (cached && cached.source === source && cached.version === texture.version && cached.sw === sw && cached.sh === sh) return cached.data ? cached : null;
    let data, width = sw, height = sh;
    try {
      if (ArrayBuffer.isView(source.data) || Array.isArray(source.data)) {
        const channels = source.data.length / (sw * sh);
        data = new Uint8ClampedArray(sw * sh * 4);
        const floating = source.data instanceof Float32Array || source.data instanceof Float64Array;
        const scale = floating ? 255 : 1;
        for (let i = 0; i < sw * sh; i++) {
          data[i * 4] = source.data[i * channels] * scale;
          data[i * 4 + 1] = source.data[i * channels + Math.min(1, channels - 1)] * scale;
          data[i * 4 + 2] = source.data[i * channels + Math.min(2, channels - 1)] * scale;
          data[i * 4 + 3] = channels >= 4 ? source.data[i * channels + 3] * scale : 255;
        }
      } else {
        const scale = Math.min(1, 1024 / sw, 1024 / sh);
        width = Math.max(1, Math.round(sw * scale)); height = Math.max(1, Math.round(sh * scale));
        const doc = this.canvas.ownerDocument || globalThis.document;
        const scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : doc.createElement('canvas');
        scratch.width = width; scratch.height = height;
        const context = scratch.getContext('2d', { willReadFrequently: true });
        context.drawImage(source, 0, 0, width, height);
        data = context.getImageData(0, 0, width, height).data;
      }
    } catch {
      // An unavailable or cross-origin image falls back to its material color.
      data = null;
    }
    const result = { source, version: texture.version, sw, sh, width, height, data };
    this._textureCache.set(texture, result);
    return data ? result : null;
  }

  _makeVertex(target, geo, id, uv, colors) {
    const k = id * 4;
    target[0] = geo.clip[k]; target[1] = geo.clip[k + 1]; target[2] = geo.clip[k + 2]; target[3] = geo.clip[k + 3];
    target[4] = uv ? uv[id * 2] : 0; target[5] = uv ? uv[id * 2 + 1] : 0;
    target[6] = colors ? colors[id * 3] : 1;
    target[7] = colors ? colors[id * 3 + 1] : 1;
    target[8] = colors ? colors[id * 3 + 2] : 1;
  }

  _clipTriangle(geo, ia, ib, ic, uv, colors, code) {
    let input = this._clipA, output = this._clipB, count = 3;
    this._makeVertex(input[0], geo, ia, uv, colors);
    this._makeVertex(input[1], geo, ib, uv, colors);
    this._makeVertex(input[2], geo, ic, uv, colors);
    for (let plane = 0; plane < 6; plane++) {
      if (!(code & (1 << plane))) continue;
      const axis = plane >> 1, sign = plane & 1 ? -1 : 1;
      let nextCount = 0;
      let prev = input[count - 1], prevDistance = prev[3] + sign * prev[axis];
      for (let i = 0; i < count; i++) {
        const current = input[i], distance = current[3] + sign * current[axis];
        if ((distance >= 0) !== (prevDistance >= 0)) {
          const t = prevDistance / (prevDistance - distance);
          const intersection = output[nextCount++];
          for (let j = 0; j < 9; j++) intersection[j] = prev[j] + (current[j] - prev[j]) * t;
        }
        if (distance >= 0) output[nextCount++].set(current);
        prev = current; prevDistance = distance;
      }
      count = nextCount;
      if (count < 3) return 0;
      const swap = input; input = output; output = swap;
    }
    const w = this.canvas.width, h = this.canvas.height;
    for (let i = 0; i < count; i++) {
      const p = input[i], s = this._screen[i], invW = 1 / p[3];
      s[0] = (p[0] * invW * .5 + .5) * w;
      s[1] = (.5 - p[1] * invW * .5) * h;
      s[2] = p[2] * invW; s[3] = invW;
      for (let j = 4; j < 9; j++) s[j] = p[j] * invW;
    }
    return count;
  }

  _raster(a, b, c, state, brightness) {
    const width = this.canvas.width, height = this.canvas.height;
    const ax = a[0], ay = a[1], bx = b[0], by = b[1], cx = c[0], cy = c[1];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < .015 || !Number.isFinite(area)) return;
    const front = area * state.orientation < 0;
    if (state.side === 0 && !front || state.side === 1 && front) return;
    const minX = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - .5));
    const maxX = Math.min(width - 1, Math.floor(Math.max(ax, bx, cx) - .5));
    const minY = Math.max(0, Math.ceil(Math.min(ay, by, cy) - .5));
    const maxY = Math.min(height - 1, Math.floor(Math.max(ay, by, cy) - .5));
    if (minX > maxX || minY > maxY) return;
    const inverseArea = 1 / area;
    const aDX = (by - cy) * inverseArea, aDY = (cx - bx) * inverseArea;
    const bDX = (cy - ay) * inverseArea, bDY = (ax - cx) * inverseArea;
    let rowA = ((bx - minX - .5) * (cy - minY - .5) - (by - minY - .5) * (cx - minX - .5)) * inverseArea;
    let rowB = ((cx - minX - .5) * (ay - minY - .5) - (cy - minY - .5) * (ax - minX - .5)) * inverseArea;
    const zAC = a[2] - c[2], zBC = b[2] - c[2];
    const perspective = state.texture || state.vertexColors;
    const depth = this._depth, packed = this._packed;
    // Apply gain before albedo, but clamp only after it, preserving midtone detail.
    const red = state.r * brightness * this.lightingGain * this.lightingTint[0], green = state.g * brightness * this.lightingGain * this.lightingTint[1], blue = state.b * brightness * this.lightingGain * this.lightingTint[2];
    const flat = (255 << 24) | ((Math.min(255, blue+state.eb) + .5) << 16) | ((Math.min(255, green+state.eg) + .5) << 8) | (Math.min(255, red+state.er) + .5);
    const tex = state.texture, texels = tex?.data;
    const tm = state.textureMatrix;
    for (let y = minY; y <= maxY; y++, rowA += aDY, rowB += bDY) {
      let wa = rowA, wb = rowB, pos = y * width + minX;
      for (let x = minX; x <= maxX; x++, pos++, wa += aDX, wb += bDX) {
        const wc = 1 - wa - wb;
        if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
        const z = c[2] + wa * zAC + wb * zBC + state.depthBias;
        if (z < -1.00001 || z > 1.00001 || state.depthTest && z >= depth[pos]) continue;
        if (!perspective && state.opacity === 1) {
          packed[pos] = flat;
          if (state.depthWrite) depth[pos] = z;
          continue;
        }
        const denominator = wa * a[3] + wb * b[3] + wc * c[3];
        const correction = 1 / denominator;
        let r = red, g = green, bb = blue, alpha = state.opacity;
        if (state.vertexColors) {
          r *= (wa * a[6] + wb * b[6] + wc * c[6]) * correction;
          g *= (wa * a[7] + wb * b[7] + wc * c[7]) * correction;
          bb *= (wa * a[8] + wb * b[8] + wc * c[8]) * correction;
        }
        if (texels) {
          const u = (wa * a[4] + wb * b[4] + wc * c[4]) * correction;
          const v = (wa * a[5] + wb * b[5] + wc * c[5]) * correction;
          let tu = tm[0] * u + tm[3] * v + tm[6], tv = tm[1] * u + tm[4] * v + tm[7];
          if (state.wrapS === 1000) tu -= Math.floor(tu);
          else if (state.wrapS === 1002) { tu = ((tu % 2) + 2) % 2; if (tu > 1) tu = 2 - tu; }
          else tu = Math.max(0, Math.min(1, tu));
          if (state.wrapT === 1000) tv -= Math.floor(tv);
          else if (state.wrapT === 1002) { tv = ((tv % 2) + 2) % 2; if (tv > 1) tv = 2 - tv; }
          else tv = Math.max(0, Math.min(1, tv));
          if (state.flipY) tv = 1 - tv;
          const tx = Math.min(tex.width - 1, Math.floor(tu * tex.width));
          const ty = Math.min(tex.height - 1, Math.floor(tv * tex.height));
          const k = (ty * tex.width + tx) * 4;
          alpha *= texels[k + 3] / 255;
          if (alpha <= Math.max(.01, state.alphaTest)) continue;
          r *= texels[k] / 255; g *= texels[k + 1] / 255; bb *= texels[k + 2] / 255;
        }
        r+=state.er;g+=state.eg;bb+=state.eb;
        if (alpha < .999) {
          const old = packed[pos], inverse = 1 - alpha;
          r = r * alpha + (old & 255) * inverse;
          g = g * alpha + ((old >>> 8) & 255) * inverse;
          bb = bb * alpha + ((old >>> 16) & 255) * inverse;
        }
        packed[pos] = (255 << 24) | ((Math.min(255, bb) + .5) << 16) | ((Math.min(255, g) + .5) << 8) | (Math.min(255, r) + .5);
        if (state.depthWrite) depth[pos] = z;
      }
    }
  }

  render(scene, camera) {
    if (!this._draws || scene !== this._scene) this.prepare(scene);
    if (!this._pixels) this.setSize(this.width, this.height, false);
    const T = this.THREE;
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    this._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = this._vp.elements, width = this.canvas.width, height = this.canvas.height;
    const background = (scene.background?.isColor ? scene.background : this._clear).clone().convertLinearToSRGB();
    const clear = ((this._clearAlpha * 255) << 24) | ((Math.min(1, background.b) * 255) << 16) | ((Math.min(1, background.g) * 255) << 8) | (Math.min(1, background.r) * 255);
    this._packed.fill(clear); this._depth.fill(Infinity);
    for (const geo of this._geometries) {
      const p = geo.p, clip = geo.clip, screen = geo.screen, codes = geo.codes;
      for (let i = 0, j = 0, n = 0; i < p.length; i += 3, j += 4, n++) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        const cx = e[0] * x + e[4] * y + e[8] * z + e[12];
        const cy = e[1] * x + e[5] * y + e[9] * z + e[13];
        const cz = e[2] * x + e[6] * y + e[10] * z + e[14];
        const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
        clip[j] = cx; clip[j + 1] = cy; clip[j + 2] = cz; clip[j + 3] = cw;
        codes[n] = (cx < -cw ? 1 : 0) | (cx > cw ? 2 : 0) | (cy < -cw ? 4 : 0) | (cy > cw ? 8 : 0) | (cz < -cw ? 16 : 0) | (cz > cw ? 32 : 0);
        const invW = 1 / cw;
        screen[j] = (cx * invW * .5 + .5) * width; screen[j + 1] = (.5 - cy * invW * .5) * height;
        screen[j + 2] = cz * invW; screen[j + 3] = invW;
      }
    }
    const materialStates = new Map();
    this.info.render.calls = 0;
    for (const draw of this._draws) {
      const mat = draw.material;
      if (!draw.geo.object.visible || mat.visible === false) continue;
      let materialState = materialStates.get(mat);
      if (!materialState) {
        const texture = this._readTexture(mat.map);
        if (mat.map?.matrixAutoUpdate) mat.map.updateMatrix();
        const color = (mat.color || new T.Color('white')).clone().convertLinearToSRGB();
        const emission=(mat.emissive||new T.Color(0)).clone().convertLinearToSRGB().multiplyScalar(Math.min(1.5,mat.emissiveIntensity||0)*110);
        materialState = {
          texture, textureMatrix: mat.map?.matrix.elements,
          wrapS: mat.map?.wrapS, wrapT: mat.map?.wrapT, flipY: mat.map?.flipY,
          side: mat.side ?? T.FrontSide,
          r: color.r * 255, g: color.g * 255, b: color.b * 255,
          er:emission.r,eg:emission.g,eb:emission.b,
          opacity: mat.opacity ?? 1, alphaTest: mat.alphaTest || 0,
          depthWrite: mat.depthWrite !== false, depthTest: mat.depthTest !== false,
          depthBias: mat.polygonOffset ? (mat.polygonOffsetUnits || mat.polygonOffsetFactor || 0) * 1e-6 : 0,
        };
        materialStates.set(mat, materialState);
      }
      const instance = draw.instanceColor.clone().convertLinearToSRGB();
      const state = { ...materialState, texture: draw.uv ? materialState.texture : null, vertexColors: !!draw.colors, orientation: draw.orientation,
        r: materialState.r * instance.r, g: materialState.g * instance.g, b: materialState.b * instance.b };
      const { geo, ids, uv, colors } = draw;
      this.info.render.calls++;
      for (let i = 0, triangle = 0; i < ids.length; i += 3, triangle++) {
        const ia = ids[i], ib = ids[i + 1], ic = ids[i + 2];
        const ca = geo.codes[ia], cb = geo.codes[ib], cc = geo.codes[ic];
        if (ca & cb & cc) continue;
        const code = ca | cb | cc;
        if (code) {
          const count = this._clipTriangle(geo, ia, ib, ic, uv, colors, code);
          for (let j = 1; j < count - 1; j++) this._raster(this._screen[0], this._screen[j], this._screen[j + 1], state, draw.lighting[triangle]);
        } else {
          for (let j = 0; j < 3; j++) {
            const id = ids[i + j], offset = id * 4, vertex = this._screen[j], invW = geo.screen[offset + 3];
            vertex[0] = geo.screen[offset]; vertex[1] = geo.screen[offset + 1]; vertex[2] = geo.screen[offset + 2]; vertex[3] = invW;
            vertex[4] = uv ? uv[id * 2] * invW : 0; vertex[5] = uv ? uv[id * 2 + 1] * invW : 0;
            vertex[6] = colors ? colors[id * 3] * invW : invW;
            vertex[7] = colors ? colors[id * 3 + 1] * invW : invW;
            vertex[8] = colors ? colors[id * 3 + 2] * invW : invW;
          }
          this._raster(this._screen[0], this._screen[1], this._screen[2], state, draw.lighting[triangle]);
        }
      }
    }
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.putImageData(this._pixels, 0, 0);
  }

  dispose() {
    this._draws = this._geometries = this._scene = this._pixels = this._packed = this._depth = null;
    this.invalidateTextures();
  }
}
