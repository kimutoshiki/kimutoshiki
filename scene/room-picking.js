// Spatial broad phase only: final hits still come from Three's original raycast.
// Invalidate after transforms/instance matrices change; refresh after mesh additions
// or a cat LOD swap. Multiple pointer events in one frame share the same bounds.
export function createRoomPicking(T, { root } = {}) {
  let entries = [], custom = [], tree = null, dirty = true, cache = new WeakMap();
  const instanceMatrix = new T.Matrix4(), instanceBox = new T.Box3(), vertex = new T.Vector3(), weightedVertex = new T.Vector3();
  const heapNodes = [], heapDistances = [], hits = [];
  const stats = { queries: 0, syncs: 0, boundsChanged: 0, skinBuilds: 0, boxTests: 0, preciseCalls: 0 };
  const visible = object => {
    for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false;
    return true;
  };
  // Keep the existing study's transparency rule, including material-array behavior.
  const solid = hit => !(hit.object.material?.transparent && hit.object.material.opacity < .2);
  const nativeRaycast = object => object.isSkinnedMesh ? T.SkinnedMesh.prototype.raycast
    : object.isInstancedMesh ? T.InstancedMesh.prototype.raycast : T.Mesh.prototype.raycast;
  const attributeVersion = attribute => attribute?.version ?? attribute?.data?.version;

  function mark(node) { for (; node && !node.dirty; node = node.parent) node.dirty = true; }
  function skinChanged(entry) {
    const object=entry.object,geometry=object.geometry,skeleton=object.skeleton;
    const attributes=[geometry.attributes.position,geometry.attributes.skinWeight,geometry.attributes.skinIndex,...(geometry.morphAttributes.position||[])];
    const cache=entry.skinCache;
    const changed=!cache||cache.geometry!==geometry||cache.skeleton!==skeleton||!cache.bind.equals(object.bindMatrix)
      ||attributes.length!==cache.attributes.length||attributes.some((attribute,i)=>attribute!==cache.attributes[i]||attributeVersion(attribute)!==cache.versions[i])
      ||skeleton.bones.length!==cache.bones.length||skeleton.bones.some((bone,i)=>bone!==cache.bones[i]||!skeleton.boneInverses[i].equals(cache.inverses[i]));
    if(changed)entry.skinCache={geometry,skeleton,bind:object.bindMatrix.clone(),attributes,versions:attributes.map(attributeVersion),bones:skeleton.bones.slice(),inverses:skeleton.boneInverses.map(matrix=>matrix.clone())};
    return changed;
  }
  function prepareSkin(entry) {
    stats.skinBuilds++;
    const object=entry.object,geometry=object.geometry,position=geometry.attributes.position,weights=geometry.attributes.skinWeight,indices=geometry.attributes.skinIndex;
    if(!weights||!indices||geometry.morphAttributes.position?.length)return null;
    const boxes=object.skeleton.bones.map(()=>new T.Box3());
    const bind=object.skeleton.boneInverses.map(inverse=>new T.Matrix4().multiplyMatrices(inverse,object.bindMatrix));
    for(let i=0;i<position.count;i++){
      vertex.fromBufferAttribute(position,i);let sum=0;
      for(let component=0;component<4;component++){
        const weight=weights.getComponent(i,component),bone=indices.getComponent(i,component);sum+=weight;
        if(weight<0||!Number.isInteger(bone)||!boxes[bone])return null;
        if(weight>0)boxes[bone].expandByPoint(weightedVertex.copy(vertex).applyMatrix4(bind[bone]));
      }
      if(Math.abs(sum-1)>1e-5)return null;
    }
    return boxes;
  }
  function shape(entry) {
    const object = entry.object, geometry = object.geometry;
    if (object.isSkinnedMesh) {
      // Positive normalized skin weights are a convex combination of bone-local
      // points. Their transformed box union encloses every current vertex. Scan
      // source weights once per mesh, then transform only its bone boxes per frame.
      // This does not change the cat's separate native sphere/inspection bounds.
      if(skinChanged(entry))entry.skinBoxes=prepareSkin(entry);
      if(entry.skinBoxes){
        entry.local.makeEmpty();
        entry.skinBoxes.forEach((box,index)=>{
          if(box.isEmpty())return;
          instanceMatrix.multiplyMatrices(object.bindMatrixInverse,object.skeleton.bones[index].matrixWorld);
          entry.local.union(instanceBox.copy(box).applyMatrix4(instanceMatrix));
        });
        const magnitude=Math.max(1,...entry.local.min.toArray().map(Math.abs),...entry.local.max.toArray().map(Math.abs));
        entry.local.expandByScalar(magnitude*2e-5);return true;
      }
      // Unsupported morph/weight layouts fall back to the existing safe sphere.
      if (!object.boundingSphere) return false;
      object.boundingSphere.getBoundingBox(entry.local); return true;
    }
    if (!geometry?.attributes.position) return false;
    const position=geometry.attributes.position,version=attributeVersion(position);
    if (!geometry.boundingBox || version !== entry.positionVersion && entry.positionVersion !== undefined || entry.positionAttribute && entry.positionAttribute !== position) geometry.computeBoundingBox();
    entry.positionVersion = version;entry.positionAttribute=position;
    if (!object.isInstancedMesh) { entry.local.copy(geometry.boundingBox); return true; }
    entry.local.makeEmpty();
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, instanceMatrix);
      instanceBox.copy(geometry.boundingBox).applyMatrix4(instanceMatrix); entry.local.union(instanceBox);
    }
    return true;
  }
  function build(items, parent = null) {
    const node = { box: new T.Box3(), parent, dirty: false };
    for (const item of items) node.box.union(item.world);
    if (items.length <= 4) { node.items = items; for (const item of items) item.node = node; return node; }
    const size = node.box.getSize(new T.Vector3()), axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    items.sort((a,b) => a.world.min[axis] + a.world.max[axis] - b.world.min[axis] - b.world.max[axis]);
    const mid = items.length >> 1;
    node.left = build(items.slice(0,mid),node); node.right = build(items.slice(mid),node); return node;
  }
  function refit(node) {
    if (!node?.dirty) return;
    node.box.makeEmpty();
    if (node.items) for (const item of node.items) node.box.union(item.world);
    else { refit(node.left); refit(node.right); node.box.union(node.left.box).union(node.right.box); }
    node.dirty = false;
  }
  function changed(entry) {
    const object = entry.object, matrix = object.matrixWorld.elements;
    let change = entry.geometry !== object.geometry || entry.positionAttribute !== object.geometry?.attributes.position || entry.positionVersion !== attributeVersion(object.geometry?.attributes.position)
      || entry.instanceVersion !== object.instanceMatrix?.version || entry.count !== object.count || object.isSkinnedMesh;
    for (let i = 0; i < 16; i++) if (entry.matrix[i] !== matrix[i]) { change = true; break; }
    if (!change) return;
    entry.geometry = object.geometry; entry.matrix.set(matrix); entry.instanceVersion = object.instanceMatrix?.version; entry.count = object.count;
    shape(entry); entry.world.copy(entry.local).applyMatrix4(object.matrixWorld); mark(entry.node); stats.boundsChanged++;
  }
  function sync() {
    if (!dirty) return;
    root?.updateWorldMatrix(true,true);
    for (const entry of entries) changed(entry);
    refit(tree); dirty = false; stats.syncs++;
  }
  function boxEntry(box, ray, near, far) {
    stats.boxTests++;
    let low = near, high = far;
    for (const axis of ['x','y','z']) {
      const direction = ray.direction[axis], origin = ray.origin[axis];
      if (direction === 0) { if (origin < box.min[axis] || origin > box.max[axis]) return Infinity; continue; }
      let a = (box.min[axis]-origin)/direction, b = (box.max[axis]-origin)/direction;
      if (a>b) [a,b]=[b,a]; low=Math.max(low,a);high=Math.min(high,b);
      if (low>high) return Infinity;
    }
    return low;
  }
  function push(node,distance) {
    let i=heapNodes.length;heapNodes.push(node);heapDistances.push(distance);
    while(i>0){const parent=(i-1)>>1;if(heapDistances[parent]<=distance)break;heapNodes[i]=heapNodes[parent];heapDistances[i]=heapDistances[parent];i=parent;}
    heapNodes[i]=node;heapDistances[i]=distance;
  }
  function pop() {
    const node=heapNodes[0],last=heapNodes.pop(),distance=heapDistances.pop();
    if(heapNodes.length){let i=0;while(i*2+1<heapNodes.length){let child=i*2+1;if(child+1<heapNodes.length&&heapDistances[child+1]<heapDistances[child])child++;if(heapDistances[child]>=distance)break;heapNodes[i]=heapNodes[child];heapDistances[i]=heapDistances[child];i=child;}heapNodes[i]=last;heapDistances[i]=distance;}
    return node;
  }
  function refresh(objects) {
    root?.updateWorldMatrix(true,true);
    if (!objects) { objects=[];root?.traverse(object=>{if(object.isMesh)objects.push(object);}); }
    entries=[];custom=[];tree=null;
    objects.forEach((object,index)=>{
      let entry=cache.get(object);
      if(!entry){entry={object,local:new T.Box3(),world:new T.Box3(),matrix:new Float64Array(16)};cache.set(object,entry);}
      entry.index=index;entry.node=null;entry.geometry=object.geometry;
      // Unknown custom raycasts may intentionally hit outside their geometry.
      // Keep calling them unchanged; this also faithfully honors all no-ops.
      if(object.raycast!==nativeRaycast(object)||!shape(entry)){custom.push(entry);return;}
      entry.matrix.set(object.matrixWorld.elements);entry.instanceVersion=object.instanceMatrix?.version;entry.count=object.count;
      entry.world.copy(entry.local).applyMatrix4(object.matrixWorld);entries.push(entry);
    });
    if(entries.length)tree=build(entries.slice());dirty=false;
  }
  function firstHit(raycaster, accept=solid) {
    stats.queries++;
    if(root&&!visible(root))return null;
    sync();heapNodes.length=heapDistances.length=0;
    let best=null,bestIndex=Infinity;const far=raycaster.far;
    function test(entry) {
      const object=entry.object;
      if(!visible(object)||!object.layers.test(raycaster.layers))return;
      hits.length=0;stats.preciseCalls++;object.raycast(raycaster,hits);
      for(const hit of hits)if(accept(hit)&&(!best||hit.distance<best.distance||hit.distance===best.distance&&entry.index<bestIndex)){
        best=hit;bestIndex=entry.index;raycaster.far=Math.min(far,hit.distance);
      }
    }
    try {
      for(const entry of custom)test(entry);
      if(tree){const distance=boxEntry(tree.box,raycaster.ray,raycaster.near,raycaster.far);if(distance!==Infinity)push(tree,distance);}
      while(heapNodes.length){
        if(heapDistances[0]>raycaster.far)break;
        const node=pop();
        if(node.items){
          for(const entry of node.items)if(boxEntry(entry.world,raycaster.ray,raycaster.near,raycaster.far)!==Infinity)test(entry);
        }else for(const child of[node.left,node.right]){const distance=boxEntry(child.box,raycaster.ray,raycaster.near,raycaster.far);if(distance!==Infinity)push(child,distance);}
      }
      return best;
    } finally {raycaster.far=far;hits.length=0;heapNodes.length=heapDistances.length=0;}
  }
  return {refresh,invalidate(){dirty=true;},sync,firstHit,stats,resetStats(){for(const key of Object.keys(stats))stats[key]=0;},dispose(){entries=[];custom=[];tree=null;cache=new WeakMap();heapNodes.length=heapDistances.length=hits.length=0;}};
}
