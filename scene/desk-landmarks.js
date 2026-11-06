/* Desk displays made from the site's four original procedural landmark models.
 * Architecture is retained as authored. Only independently separable scenery is
 * removed. The complete architecture retains its proportions; layered display
 * mounts and controlled material finishes make it readable at desk scale.
 */
import { createOkumaAuditorium } from '../js/models/okuma-auditorium.js?v=20261106-craft1';
import { createOkumaStatue } from '../js/models/okuma-statue.js?v=20261106-craft1';
import { createKaratsuCastle } from '../js/models/karatsu-castle.js?v=20261106-craft1';
import { createKaratsuBank } from '../js/models/karatsu-bank.js?v=20261106-craft1';
import { batchStaticMeshes } from '../js/models/model-utils.js';

import { surface, prepareBoxSurfaceUVs, ensureSurfaceUV, SURFACES } from './surface-materials.js';
import { mergeStaticDraws, cacheStaticLocalMatrices, staticDrawStats } from './static-batching.js';

const TABLE_Y = 2.164;
const DISPLAY_WIDTH = .85;
const DISPLAY_DEPTH = .70;
const BASE_HEIGHT = .075;
const MODEL_WIDTH = .81;
const MODEL_DEPTH = .65;

function countGeometry(root) {
  let meshes = 0, primitives = 0, triangles = 0, lines = 0;
  root.traverse(object => {
    if (object.isLine) { lines++; return; }
    if (!object.isMesh) return;
    meshes++;
    const count = object.isInstancedMesh ? object.count : 1;
    primitives += count;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * count;
  });
  return { meshes, primitives, triangles, lines };
}

// Factories explicitly identify the complete architecture before batching.
// Never decide whether an entire tower belongs to a model by rounding its bounds.
function retainArchitecture(model, name) {
  const architecture = model.architecture || model.group.getObjectByName(name);
  if (!architecture) throw new Error('Missing landmark architecture: ' + name);
  if (architecture === model.group) return;
  architecture.removeFromParent();
  model.group = architecture;
}
function extractStatue(model) { retainArchitecture(model, 'Okuma statue monument'); }
function extractBank(model) { retainArchitecture(model, 'Landmark architecture'); }
function extractCastle(model) { retainArchitecture(model, 'Five-tier keep'); }
function extractAuditorium(T, model) { retainArchitecture(model, 'Okuma auditorium architecture'); }

function beveledMount(T, width, height, depth, bevel) {
  const outline = new T.Shape();
  const x = width / 2 - bevel, z = depth / 2 - bevel;
  outline.moveTo(-x, -z); outline.lineTo(x, -z); outline.lineTo(x, z);
  outline.lineTo(-x, z); outline.closePath();
  const geometry = new T.ExtrudeGeometry(outline, {
    depth: height - bevel * 2, steps: 1, bevelEnabled: true,
    bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  return geometry;
}

function nameplate(T, title, subtitle, brass, edgeGeometry, screwGeometry) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#19352e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#bca577';
  ctx.lineWidth = 2;
  ctx.strokeRect(13, 12, canvas.width - 26, canvas.height - 24);
  ctx.fillStyle = '#f3e8cc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 55px "Noto Serif JP", "Yu Mincho", serif';
  ctx.fillText(title, canvas.width / 2, 51);
  ctx.fillStyle = '#c8ba94';
  ctx.font = '21px Georgia, serif';
  ctx.fillText(subtitle, canvas.width / 2, 94);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const backing = new T.Mesh(edgeGeometry, brass);
  backing.scale.set(.772, .102, .008);
  backing.position.set(0, .051, DISPLAY_DEPTH / 2 + .004);
  const plate = new T.Mesh(new T.PlaneGeometry(.75, .09375), new T.MeshStandardMaterial({ map: texture, roughness: .46, metalness: .12 }));
  plate.name = `${title} · nameplate`;
  plate.position.set(0, .051, DISPLAY_DEPTH / 2 + .0085);
  const plaque = [backing, plate];
  for (const x of [-.358, .358]) {
    const screw = new T.Mesh(screwGeometry, brass);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, .051, DISPLAY_DEPTH / 2 + .0095);
    plaque.push(screw);
  }
  return plaque;
}

/** Return a standalone tabletop group and the room's standard target records. */
export async function createDeskLandmarks(T, { optimize = true, waitForFonts = true } = {}) {
  if (waitForFonts && typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
  const group = new T.Group();
  group.name = 'Original Waseda and Karatsu desk miniatures';
  const targets = [];
  const stats = { models: [], geometryPolicy: 'Original geometry and uniform scale; independently separable context removed.' };
  const wood = new T.MeshStandardMaterial({ color: 0x513725, roughness: .43 });
  surface(wood, 'walnut', { tint: '#a58e75', roughness: .43, bumpScale: .004 });
  const felt = new T.MeshStandardMaterial({ color: 0x203c31, roughness: .98 });
  const brass = new T.MeshStandardMaterial({ color: 0xb79a5f, roughness: .29, metalness: .82 });
  const edgeGeometry = new T.BoxGeometry(1, 1, 1);
  const baseGeometry = beveledMount(T, DISPLAY_WIDTH, .065, DISPLAY_DEPTH, .009);
  const topGeometry = beveledMount(T, DISPLAY_WIDTH - .02, .010, DISPLAY_DEPTH - .02, .003);
  const screwGeometry = new T.CylinderGeometry(.004, .004, .002, 8);
  const layouts = [
    { key: 'okuma-auditorium', title: '大隈講堂', subtitle: 'OKUMA AUDITORIUM', targetId: 'landmark-okuma-auditorium', x: -1.9, z: -.34, rotation: -.04, height: 1.20, anchor: [-9.25, 18.18, 5.31], factory: createOkumaAuditorium, extract: model => extractAuditorium(T, model) },
    { key: 'okuma-statue', title: '大隈重信像', subtitle: 'OKUMA SHIGENOBU', targetId: 'landmark-okuma-statue', x: -.68, z: -.30, rotation: .02, height: 1.10, anchor: [0, 11.5, .7], factory: createOkumaStatue, extract: extractStatue },
    { key: 'karatsu-castle', title: '唐津城', subtitle: 'KARATSU CASTLE', targetId: 'landmark-karatsu-castle', x: .70, z: -.28, rotation: -.04, height: 1.20, anchor: [0, 13.2, 4.54], factory: createKaratsuCastle, extract: extractCastle },
    { key: 'karatsu-bank', title: '旧唐津銀行', subtitle: 'FORMER KARATSU BANK', targetId: 'landmark-karatsu-bank', x: 1.9, z: -.31, rotation: .03, height: 1.00, anchor: [0, 7, 6.30], factory: createKaratsuBank, extract: extractBank },
  ];
  for (const layout of layouts) {
    const model = layout.factory(T);
    const before = countGeometry(model.group);
    layout.extract(model);
    const retained = countGeometry(model.group);
    // Use the site's existing batching helper after extraction. It keeps source
    // geometry and materials while preserving every nested mesh transform.
    batchStaticMeshes(T, model.group);
    const display = new T.Group();
    display.name = `desk-${layout.key}`;
    display.position.set(layout.x, TABLE_Y, layout.z);
    display.userData = { targetId: layout.targetId, landmarkId: layout.key, title: layout.title };
    group.add(display);
    const base = new T.Mesh(baseGeometry, wood);
    const top = new T.Mesh(topGeometry, felt);
    top.position.y = .065;
    display.add(base, top, ...nameplate(T, layout.title, layout.subtitle, brass, edgeGeometry, screwGeometry));
    // Inlaid display edges give the original miniatures a finished mount.
    for (const [x,z,w,d] of [[0,-.346,.838,.008],[0,.346,.838,.008],[-.421,0,.008,.684],[.421,0,.008,.684]]) {
      const edge = new T.Mesh(edgeGeometry, brass); edge.scale.set(w,.009,d); edge.position.set(x,.054,z); display.add(edge);
    }
    const turn = new T.Group();
    turn.rotation.y = layout.rotation;
    turn.add(model.group);
    turn.updateMatrixWorld(true);
    const nativeBounds = new T.Box3().setFromObject(turn);
    const nativeSize = nativeBounds.getSize(new T.Vector3());
    const nativeCenter = nativeBounds.getCenter(new T.Vector3());
    const scale = Math.min(MODEL_WIDTH / nativeSize.x, MODEL_DEPTH / nativeSize.z, layout.height / nativeSize.y);
    const mount = new T.Group();
    mount.name = `${layout.title} · original model at uniform scale`;
    mount.userData.inspectionSource = true;
    mount.scale.setScalar(scale);
    mount.position.set(-nativeCenter.x * scale, BASE_HEIGHT - nativeBounds.min.y * scale, -nativeCenter.z * scale - .013);
    mount.add(turn);
    display.add(mount);
    display.traverse(object => {
      if (object.isMesh || object.isLine) {
        object.userData.targetId = layout.targetId;
        object.userData.landmarkId = layout.key;
      }
      if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    display.updateMatrixWorld(true);
    const finalBounds = new T.Box3().setFromObject(display);
    const anchor = model.group.localToWorld(new T.Vector3(...layout.anchor));
    targets.push({ id: layout.targetId, assetId: layout.key, object: display, anchor });
    stats.models.push({
      assetId: layout.key, targetId: layout.targetId, before, retained,
      batched: countGeometry(model.group), uniformScale: scale,
      worldBounds: { min: finalBounds.min.toArray(), max: finalBounds.max.toArray() },
      displaySize: finalBounds.getSize(new T.Vector3()).toArray(),
    });
  }
  group.updateMatrixWorld(true);
  // Project the original box/custom UVs before combining different sizes. The
  // room-wide material loader respects this flag and cannot rescale them twice.
  prepareBoxSurfaceUVs(T, group);
  group.traverse(object => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      const spec = SURFACES[material.userData.surface?.key];
      if (spec) ensureSurfaceUV(T, object.geometry, spec.span);
    }
    object.geometry.userData.surfaceUVPrepared = true;
  });
  stats.performance = { before: staticDrawStats(group), models: [] };
  if (optimize) {
    for (const display of group.children) {
      const mount = display.children.find(child => child.userData.inspectionSource);
      const architecture = mount.children[0].children[0];
      const clocks = new Set();
      architecture.traverse(object => { if (/^Clock face [1-4]$/.test(object.name)) clocks.add(object); });
      stats.performance.models.push({ assetId: display.userData.landmarkId,
        architecture: mergeStaticDraws(T, architecture, { byParent: false, preserveGroups: clocks }),
        display: mergeStaticDraws(T, display, { skipRoots: new Set([mount]) }),
      });
    }
    cacheStaticLocalMatrices(group);
  }
  stats.performance.after = staticDrawStats(group);
  stats.total = countGeometry(group);
  group.userData.landmarkStats = stats;
  return { group, targets, stats };
}
