import {buildPhotographicDistrict, PHOTO_PLACES} from './software-districts.js';

export const SOFTWARE_PLACES=PHOTO_PLACES;
export const SOFTWARE_SPAWN={...PHOTO_PLACES['landmark-okuma-auditorium'],key:'landmark-okuma-auditorium'};

const trees = [
  [-5.5, 1.5, 3.5, '#9caa60'], [6.2, 2.1, 3.1, '#a3ab64'],
  [-15.6, 7.8, 4.3, '#be9a4c'], [-19.4, 15, 4.2, '#a9a65b'],
  [-4.4, 18.5, 3.4, '#c6a657'], [5.6, 19.6, 3.9, '#7d995b'],
  [-4.5, 30.7, 3.1, '#94a65c'], [-8.2, 39, 5, '#6f925d'],
  [-18.1, 32.9, 4.2, '#829760'], [21.8, 24, 3.2, '#6d9061'],
  [23.1, 31.4, 4.3, '#597f60'], [23.5, 43.5, 3.4, '#709061'],
  [-13, -4, 4, '#9caa66'], [14.2, -3.4, 3.8, '#8a9a60']
];

function bounds(minX, maxX, minZ, maxZ) {
  return { minX, maxX, minZ, maxZ };
}

export const SOFTWARE_OBSTACLES = [
  bounds(-18.2, -7.7, 16.4, 23.4), bounds(-7.47, -6.13, 9.42, 10.58),
  bounds(10.4, 18.9, 11.3, 16.9), bounds(10.75, 20.25, 33.5, 40.6),
  bounds(-36, -2.25, 24.9, 27.6), bounds(2.25, 36, 24.9, 27.6),
  bounds(26, 36, 13.8, 60),
  ...trees.map(([x, z]) => bounds(x - 0.24, x + 0.24, z - 0.24, z + 0.24))
];

function tile(s, x0, z0, x1, z1, color, order, y = 0) {
  const nx = Math.ceil((x1 - x0) / 12), nz = Math.ceil((z1 - z0) / 12);
  for (let i = 0; i < nx; i++) {
    const a = x0 + (x1 - x0) * i / nx, b = x0 + (x1 - x0) * (i + 1) / nx;
    for (let j = 0; j < nz; j++) {
      const c = z0 + (z1 - z0) * j / nz, d = z0 + (z1 - z0) * (j + 1) / nz;
      s.face([[a, y, c], [a, y, d], [b, y, d], [b, y, c]], color, { layer: 'ground', order });
    }
  }
}

function ellipse(s, x, y, z, rx, rz, color, order) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = Math.PI * i / 5;
    return [x + Math.cos(angle) * rx, y, z + Math.sin(angle) * rz];
  });
  s.face(points, color, { layer: 'ground', order });
}

function taper(s, x, y, z, w, d, topW, topD, h, color, opt) {
  function ring(rw, rd, ry) {
    return [[x-rw/2,ry,z-rd/2],[x+rw/2,ry,z-rd/2],[x+rw/2,ry,z+rd/2],[x-rw/2,ry,z+rd/2]];
  }
  const base = ring(w, d, y), top = ring(topW, topD, y+h);
  for (let i = 0; i < 4; i++) s.face([base[i], base[(i+1)%4], top[(i+1)%4], top[i]], color, opt);
  s.face(top, color, opt);
}

function buildWaterfront(s) {
  const water='#7fa5a4';
  tile(s,-36,24.9,26,27.6,water,3,-.10);
  tile(s,26,13.8,36,60,water,3,-.10);
  for(const [x,z,w] of [[-8,25.8,1.8],[-15,26.8,2.1],[8.7,26.4,2.5],[19,25.4,1.5],[28,21.7,2],[30,33.4,2.7],[28,42.9,2.3],[31,47.8,3.9]]) {
    tile(s,x,z,x+w,z+.069,'#bed0c4',4,-.09);
  }
  tile(s,-2.39,24.38,2.39,28.1,'#a18d76',5,.04);
  for(let i=0;i<8;i++) tile(s,-2.36,24.65+i*.42,2.36,24.69+i*.42,'#796e61',6,.045);
  for (const x of [-2.39,2.39]) {
    for(const dz of [-1.85,0,1.85]) s.box(x,.51,26.25+dz,.17,1.02,.19,'#6e7770');
    s.box(x,.89,26.25,.12,.14,3.98,'#8d8877');
    s.box(x,.45,26.25,.08,.10,3.91,'#898978');
  }
  const x=29.35,z=19.5;
  taper(s,x,-.02,z,.6,2.82,1.02,3.42,.4,'#756559');
  s.box(x,.41,z,.85,.09,2.35,'#cdb6a0');
  s.box(x,1.80,z,.055,2.84,.055,'#746f61');
  s.face([[x,3.17,z],[x+.04,.70,z],[x+.08,.73,z-1.70]],'#eee5cc');
  s.face([[x+.05,2.73,z+.08],[x+.11,.70,z+.12],[x+.14,.73,z+1.18]],'#c3b89f');
}

export function buildSoftwareGarden(s) {
  tile(s,-36,-11,36,60,'#a8b187',0,-.18);
  tile(s,-2.86,-11,2.86,24.95,'#b3a991',1,-.015);
  tile(s,-2.54,-11,2.54,24.95,'#d1c6a9',2);
  tile(s,-2.77,27.54,2.77,54,'#cbbfa4',2);
  tile(s,-18.4,6.8,20.8,9.9,'#d1c4a8',2,.003);
  tile(s,-17.95,8.8,-5.1,16.76,'#c6bda3',3,.006);
  tile(s,8.35,9.75,20.4,13.6,'#d1c4a8',3,.006);
  tile(s,2.25,29.2,21,33.95,'#cfc7ad',2);
  tile(s,22.1,13.8,25.8,48.7,'#c0b699',2);
  for(const [x,z,rx,rz] of [[-12,20,6.4,4.4],[-6.8,10,1.72,1.14],[14.4,14.1,5.38,3.12],[15.2,37,6.69,4.53]]) {
    ellipse(s,x+.64,.012,z+.36,rx,rz,'#989f87',3);
  }
  buildWaterfront(s);
  for(const key of Object.keys(PHOTO_PLACES))buildPhotographicDistrict(s,key);
  for(const [x,z,h,c] of trees) {
    ellipse(s,x+.67,.017,z+.39,h*.54,h*.32,'#909d7d',3);
    s.frustum(x,h*.24,z,.16,.102,h*.48,5,'#7a7160');
    s.frustum(x,h*.54,z,h*.21,h*.37,h*.28,6,c);
    s.frustum(x,h*.81,z,h*.37,h*.09,h*.27,6,c);
    if(z>29 || z<3) s.frustum(x-.52,h*.62,z+.23,h*.24,.05,h*.28,5,c);
  }
  for(const [x,z] of [[-3.25,5.3],[3.31,14],[3.40,31.0]]) {
    s.frustum(x,1.19,z,.07,.041,2.38,5,'#5d6d67');
    s.frustum(x,2.56,z,.11,.20,.38,4,'#dccca0');
    s.frustum(x,2.81,z,.25,.04,.15,4,'#586b64');
  }
  // Layer the mountain ridges behind the coast and the campus's northern treeline.
  for(const [x,z,w,h,c] of [[-29,58,21,6.8,'#869b8b'],[-14,59,19,8.2,'#94a69a'],[7,59,23,6.2,'#9bad9e'],[24,59,25,7.7,'#849b92'],[38,57,19,6.3,'#8fa59a']]) {
    s.face([[x-w/2,-.24,z],[x-w*.22,h*.58,z],[x-w*.05,h*.81,z+.1],[x+w*.05,h,z],[x+w*.20,h*.64,z-.3],[x+w/2,-.24,z]],c);
    s.face([[x+w*.05,h,z],[x+w*.2,h*.64,z-.30],[x+w/2,-.24,z],[x+w*.10,-.24,z-1]],'#8a9b8b');
  }
}
