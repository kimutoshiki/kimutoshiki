// Only five seated objects link to pages. A tower's clock face and the
// notebook's fixed page are stable anchors even when the journal is opening.
const subjects = [
  { key: 'profile', name: 'desk-okuma-statue', height: .71 },
  { key: 'research', name: 'desk-okuma-auditorium', feature: 'Clock face 1', height: .72 },
  { key: 'blog', name: 'blog', local: [.415,.116,0] },
  { key: 'photos', name: 'desk-karatsu-castle', height: .69 },
  { key: 'contact', name: 'contact', local: [0,.027,.046] },
];

export function createStudyDestinations(T, home) {
  const point = new T.Vector3();
  const records = new Map();
  let lastProjection = null, watchedRoom, lastChildCount = -1, lastRecordCount = -1;
  const savedView = new T.Matrix4(), savedLens = new T.Matrix4();

  function refresh() {
    // The monuments arrive together as one child of the original room.
    // Avoid traversing the full hierarchy on every mouse move or video frame.
    if (!watchedRoom) watchedRoom = home.getObjectByName('blog')?.parent;
    if (watchedRoom && watchedRoom.children.length === lastChildCount) return;
    lastChildCount = watchedRoom?.children.length ?? -1;
    for (const subject of subjects) {
      if (records.has(subject.key)) continue;
      const object = home.getObjectByName(subject.name);
      if (!object) continue;
      object.updateWorldMatrix(true,true);
      const box = new T.Box3().setFromObject(object);
      if (box.isEmpty()) continue;
      const anchor = box.getCenter(new T.Vector3());
      if (subject.local) anchor.fromArray(subject.local);
      else {
        const feature = subject.feature && object.getObjectByName(subject.feature);
        if (feature) feature.getWorldPosition(anchor);
        else anchor.y = box.min.y + (box.max.y-box.min.y) * subject.height;
        object.worldToLocal(anchor);
      }
      records.set(subject.key, { object, box, anchor });
    }
  }

  function project(camera) {
    refresh();
    const points = {};
    camera.updateWorldMatrix(true,false);
    for (const [key, { object, anchor }] of records) {
      object.localToWorld(point.copy(anchor)).project(camera);
      if (point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1) {
        points[key] = [Math.round((1+point.x)*5000)/10000, Math.round((1-point.y)*5000)/10000];
      }
    }
    return points;
  }

  function projectionChanged(camera) {
    refresh();camera.updateWorldMatrix(true,false);
    if(lastProjection && records.size===lastRecordCount && savedView.equals(camera.matrixWorld) &&
       savedLens.equals(camera.projectionMatrix)) return null;
    savedView.copy(camera.matrixWorld);savedLens.copy(camera.projectionMatrix);lastRecordCount=records.size;
    const points = project(camera);
    if (lastProjection && subjects.every(({key}) => {
      const a = points[key], b = lastProjection[key];
      return a && b ? a[0] === b[0] && a[1] === b[1] : a === b;
    })) return null;
    lastProjection = points;
    return points;
  }

  // Broad-phase bounds are static in the seated room. The journal owner
  // separately handles its moving left page. Detailed triangle intersections
  // run only when a ray actually crosses a candidate object's bounds.
  function pick(raycaster) {
    refresh();
    let result = null, nearest = Infinity;
    for (const [key, { object, box }] of records) {
      if (!raycaster.ray.intersectBox(box,point) || raycaster.ray.origin.distanceToSquared(point)>nearest*nearest) continue;
      const hit = raycaster.intersectObject(object,true).find(({object})=>object.visible);
      if (hit && hit.distance < nearest) { nearest=hit.distance; result=key; }
    }
    return result;
  }
  return {project,projectionChanged,pick,reset(){lastProjection=null;}};
}
