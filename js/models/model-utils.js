/* Collapse repeated static mesh primitives without losing nested model transforms. */
export function batchStaticMeshes(T, root, animated=[]) {
 root.updateMatrixWorld(true);
 const inverse=root.matrixWorld.clone().invert(),batches=new Map();
 root.traverse(mesh=>{
  if(!mesh.isMesh||mesh.isInstancedMesh||Array.isArray(mesh.material))return;
  for(let parent=mesh;parent;parent=parent.parent)if(animated.includes(parent))return;
  const key=mesh.geometry.uuid+':'+mesh.material.uuid;
  if(!batches.has(key))batches.set(key,[]);
  batches.get(key).push(mesh);
 });
 for(const meshes of batches.values()) {
  if(meshes.length<2)continue;
  const instanced=new T.InstancedMesh(meshes[0].geometry,meshes[0].material,meshes.length);
  meshes.forEach((mesh,i)=>{instanced.setMatrixAt(i,new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));mesh.removeFromParent();});
  instanced.castShadow=true;instanced.receiveShadow=true;instanced.instanceMatrix.needsUpdate=true;
  instanced.computeBoundingBox();instanced.computeBoundingSphere();root.add(instanced);
 }
 root.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
}
