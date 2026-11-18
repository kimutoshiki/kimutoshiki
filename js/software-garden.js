import {buildSoftwareStatue} from './software-statue.js';

const hall = 'landmark-okuma-auditorium';
const statue = 'landmark-okuma-statue';
const castle = 'landmark-karatsu-castle';
const bank = 'landmark-karatsu-bank';

export const SOFTWARE_PLACES = {
  [hall]: { name: '大隈講堂', x: -2.7, z: 8.3, targetX: -12.4, targetY: 4.6, targetZ: 20 },
  [statue]: { name: '大隈重信像', x: -4.45, z: 6.1, targetX: -6.8, targetY: 2.1, targetZ: 10 },
  [castle]: { name: '唐津城', x: 6.8, z: 29.4, targetX: 15.5, targetY: 5.5, targetZ: 37 },
  [bank]: { name: '旧唐津銀行', x: 6.7, z: 6.6, targetX: 14.2, targetY: 3.7, targetZ: 14 }
};

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

function front(s, x, y, z, width, height, color, opt) {
  s.face([[x-width/2,y,z],[x+width/2,y,z],[x+width/2,y+height,z],[x-width/2,y+height,z]], color, opt);
}

function side(s, x, y, z, width, height, color, opt) {
  s.face([[x,y,z-width/2],[x,y,z+width/2],[x,y+height,z+width/2],[x,y+height,z-width/2]], color, opt);
}

function arch(s, x, y, z, w, h, color, opt) {
  const radius = w/2, shoulder = y+h-radius;
  const points = [[x-radius,y,z],[x+radius,y,z]];
  for (let i=0; i<=6; i++) {
    const a=i*Math.PI/6;
    points.push([x+radius*Math.cos(a),shoulder+radius*Math.sin(a),z]);
  }
  s.face(points,color,opt);
}

function circle(s, x, y, z, r, color, opt, east = false) {
  const points=Array.from({length:16}, (_, i) => {
    const a=i*Math.PI/8, dx=r*Math.cos(a), dy=r*Math.sin(a);
    return [x+(east?0:dx),y+dy,z+(east?dx:0)];
  });
  s.face(points,color,opt);
}

function buildHall(s) {
  const p={id:hall}, clay='#b99a74', stone='#d2bd99', slots='#435659';
  s.box(-13,2.15,20,9.8,4.3,6.25,clay,p);
  s.box(-13,.24,20,10.05,.48,6.5,'#a49b84',p);
  s.roof(-13,5.02,20,10.3,1.5,6.8,'#70564b',p);
  const wall=16.86;
  for (const x of [-16.8,-15.15,-13.5,-11.85]) {
    arch(s,x,.5,wall,1.13,2.2,stone,p);
    arch(s,x,.5,wall-.024,.83,1.96,slots,p);
    front(s,x,.52,wall-.04,.065,1.71,'#bbab88',p);
    front(s,x,1.82,wall-.04,.81,.07,'#bbab88',p);
    for (const dx of [-.25,.25]) arch(s,x+dx,3.05,wall-.01,.26,.77,slots,p);
  }
  for(const x of [-16.8,-15.15,-13.5,-11.85,-10.2]) {
    arch(s,x,1.30,23.14,.90,1.97,stone,p);
    arch(s,x,1.38,23.16,.65,1.72,slots,p);
    front(s,x,1.4,23.18,.048,1.43,'#b7aa8d',p);
  }
  for (const x of [-17.75,-14.35,-10.98]) s.box(x,2.06,wall,0.24,4.1,.39,stone,p);
  for (const y of [2.75,4.2]) s.box(-13,y,20,9.95,.12,6.4,stone,p);
  const tx=-9.32,tz=18.65, tw=2.9, td=3.46, frontZ=tz-td/2;
  s.box(tx,4.0,tz,tw,8,td,'#b5946e',p);
  for(const dx of [-1.3,1.3]) s.box(tx+dx,4,tz,0.2,8,td+.16,stone,p);
  for(const y of [3.07,6.1,7.84]) s.box(tx,y,tz,tw+.21,.16,td+.23,stone,p);
  for(const x of [tx-.42,tx+.42]) arch(s,x,3.55,frontZ-.03,.39,1.8,slots,p);
  for(const z of [tz-.6,tz+.45]) side(s,tx+tw/2+.03,3.55,z,.35,1.68,slots,p);
  for (const east of [false,true]) {
    const x=tx+(east?tw/2+.12:0), y=7.01, z=tz-(east?0:td/2+.10);
    const step=east?[.016,0]:[0,-.016];
    circle(s,x,y,z,.69,'#735f4d',p,east);
    circle(s,x+step[0],y,z+step[1],.57,'#f3dfaf',p,east);
    const coord=(a,b)=>[x+2*step[0]+(east?0:a),y+b,z+2*step[1]+(east?a:0)];
    s.face([coord(-.035,-.04),coord(.028,-.04),coord(.025,.43),coord(-.024,.43)],slots,p);
    s.face([coord(-.025,.005),coord(.01,-.03),coord(.31,.18),coord(.29,.22)],slots,p);
  }
  taper(s,tx,8.0,tz,3.38,3.91,1.16,1.48,1.9,'#795b50',p);
  s.box(tx,9.98,tz,1.04,.32,1.35,'#7b634f',p);
  taper(s,tx,10.14,tz,1.36,1.57,.14,.26,.59,'#72534a',p);
}

function buildStatue(s) {
  const x=-6.8,z=10,p={id:statue};
  taper(s,x,0,z,1.33,1.15,1.14,.97,1.31,'#a3a49b',p);
  taper(s,x,1.31,z,.975,.87,.951,.849,.19,'#55615b',p);
  // 總長大隈老侯像, cut vertically into the front face. Small Noto Serif CJK
  // JP outlines sampled at twelve pixels (SIL OFL; see fonts/OFL.txt).
  const inscription = [
    '21837fdff77e37f7feffe7fa7feff3aff21c','00c1fc18c1fc1fc102fff16c1381f878f602',
    '0600600600667ff0600f00d019830c607c03','feeffeffeedeefefc6dfff56f4cc7cde7c83',
    '0c00c67fe0dc0fbfff0c419c7f08821860fe','18c37c30e3ff6666fef903ff23826c2c7383',
    '3603782fe7fe6d66feeff3fc6fc6ff7fb230'
  ];
  const pixel=.0101, plane=y=>z-.575+.09*y/1.31-.0015;
  for(const [glyph,rows] of inscription.entries()) for(let row=0;row<12;row++) {
    const bits=parseInt(rows.slice(row*3,row*3+3),16),y=1.196-glyph*.139-row*pixel;
    for(let column=0;column<12;column++) {
      if(!(bits&(1<<(11-column))))continue;
      const start=column;
      while(column<11 && bits&(1<<(10-column)))column++;
      const x0=x+(start-6)*pixel,x1=x+(column-5)*pixel;
      s.face([[x0,y,plane(y)],[x1,y,plane(y)],[x1,y-pixel,plane(y-pixel)],[x0,y-pixel,plane(y-pixel)]],'#6e726a',p);
    }
  }
  buildSoftwareStatue(s,x,1.50,z,2.06,statue,-.26);
}

function buildBank(s) {
  const x=14.55,z=14.1,p={id:bank}, red='#a35f4f', cream='#ead5ad', slate='#52616b',glass='#405862';
  s.box(x,2.28,z,8.2,4.55,5.25,red,p);
  for (const y of [.19,2.18,4.31]) s.box(x,y,z,8.34,y===.19?.38:.15,5.38,cream,p);
  taper(s,x,4.55,z,8.67,5.73,6.42,3.33,1.31,slate,p);
  taper(s,x,5.86,z,6.46,3.36,4.55,.14,.38,'#62717a',p);
  const f=z-2.625-.018, left=x-4.1-.024;
  for(const offset of [-3.29,-1.66,0,1.66,3.29]) {
    for(const level of [.45,2.55]) {
      arch(s,x+offset,level,f,1.07,1.44,cream,p);
      arch(s,x+offset,level+.08,f-.02,.77,1.2,glass,p);
      front(s,x+offset,level+.09,f-.038,.055,.98,cream,p);
      front(s,x+offset,level+.84,f-.04,.75,.062,cream,p);
    }
  }
  for(const depth of [-1.74,0,1.74]) for(const y of [.52,2.63]){
    side(s,left,y,z+depth,1.02,1.26,cream,p);
    side(s,left-.018,y+.10,z+depth,.76,1.04,glass,p);
  }
  for(const offset of [-3.25,-1.6,0,1.6,3.25]) for(const y of [.52,2.63]) {
    arch(s,x+offset,y,z+2.65,.97,1.32,cream,p);
    arch(s,x+offset,y+.09,z+2.67,.70,1.10,glass,p);
  }
  for(const dz of [-1.66,0,1.66]) for(const y of [.52,2.63]) {
    side(s,x+4.12,y,z+dz,.99,1.26,cream,p);
    side(s,x+4.14,y+.1,z+dz,.74,1.04,glass,p);
  }
  for(const offset of [-4.0,4.0]) for(let i=0;i<7;i++)
    front(s,x+offset,.47+i*.52,f-.045,.35,.21,cream,p);
  const bx=x+2.65,bz=z-1.78;
  s.frustum(bx,5.58,bz,.80,.75,1.32,8,cream,p);
  s.frustum(bx,6.32,bz,.90,.87,.17,8,slate,p);
  s.frustum(bx,6.69,bz,.82,.41,.58,8,slate,p);
  s.frustum(bx,7.11,bz,.42,.06,.29,8,slate,p);
  s.frustum(bx,7.45,bz,.045,.018,.42,6,'#53636b',p);
}

function buildCastle(s) {
  const x=15.5,z=37,p={id:castle},tileColor='#415867',white='#ece7d2',wood='#5c5b56';
  taper(s,x,0,z,9.5,7.1,7.0,5.3,2.65,'#94978a',p);
  // Batter the stone joints to the forward-facing wall of the keep.
  const faceZ=y=>z-3.55+.9*y/2.65-.018;
  for(const [row,y] of [.42,.91,1.43,1.98,2.39].entries()) {
    const width=9.5-2.5*y/2.65;
    s.face([[x-width/2+.1,y,faceZ(y)],[x+width/2-.1,y+.025,faceZ(y+.025)],[x+width/2-.12,y+.055,faceZ(y+.055)],[x-width/2+.15,y+.05,faceZ(y+.05)]],'#858e80',p);
    const leftX=v=>x-4.75+1.25*v/2.65-.025, depth=7.1-1.8*y/2.65;
    s.face([[leftX(y),y,z-depth/2+.06],[leftX(y),y,z+depth/2-.09],[leftX(y+.035),y+.035,z+depth/2-.1],[leftX(y+.035),y+.035,z-depth/2+.08]],'#8b9284',p);
    for(const frac of [-.32,-.07,.20,.39]) {
      const px=x+width*(frac+(row%2)*.035),pz=z+depth*(frac+(row%2)*.05);
      s.face([[leftX(y),y,pz],[leftX(y),y,pz+.04],[leftX(y+.34),y+.34,pz+.15],[leftX(y+.34),y+.34,pz+.12]],'#899183',p);
      s.face([[px,y,faceZ(y)],[px+.06,y,faceZ(y)],[px-.15,y+.34,faceZ(y+.34)],[px-.19,y+.34,faceZ(y+.34)]],'#899183',p);
    }
  }
  const widths=[6.75,5.45,4.24,3.12], depths=[5.1,4.15,3.36,2.57];
  let bottom=2.65;
  for(let i=0;i<widths.length;i++) {
    const w=widths[i],d=depths[i],h=i===0?1.32:1.10;
    s.box(x,bottom+h/2,z,w,h,d,white,p);
    const f=z-d/2-.02, r=x-w/2-.02;
    for (let j=0; j<(i?3:5);j++) {
      const dx=w*((j+.5)/(i?3:5)-.5)*.86;
      front(s,x+dx,bottom+.32,f,i===3?.26:.36,.39,wood,p);
      front(s,x+dx,bottom+.32,z+d/2+.02,.31,.36,wood,p);
      front(s,x+dx,bottom+.34,f-.012,.042,.36,'#a6a598',p);
    }
    for (const dz of [-.24,.24]) {
      side(s,r,bottom+.3,z+dz*d,.34,.4,wood,p);
      side(s,x+w/2+.02,bottom+.3,z+dz*d,.31,.36,wood,p);
    }
    const eave=bottom+h;
    const nextW=i===3?.9:w*.73, nextD=i===3?.18:d*.7;
    taper(s,x,eave,z,w+1.02,d+.92,nextW,nextD,.79,tileColor,p);
    // Half-gables interrupt the eaves above central windows at alternating levels.
    if(i%2===0) {
      const hGable=.70, faceZ=z-d/2-.52;
      s.face([[x-1.01,eave-.055,faceZ],[x+1.01,eave-.055,faceZ],[x,eave+hGable,faceZ]],white,p);
      for(const side of [-1,1]) s.face([[x+side*1.18,eave-.07,faceZ-.04],[x,eave+hGable+.075,faceZ-.04],[x,eave+hGable-.065,faceZ-.06],[x+side*1.01,eave-.07,faceZ-.06]],tileColor,p);
      front(s,x,eave+.04,faceZ-.02,.19,.24,wood,p);
    }
    bottom=eave+.64;
  }
  s.box(x,bottom+.17,z,1.45,.12,.17,'#596872',p);
  for(const dx of [-.64,.64]) s.frustum(x+dx,bottom+.35,z,.13,.02,.31,5,'#b6a570',p);
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
  buildHall(s);
  buildStatue(s);
  buildBank(s);
  buildCastle(s);
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
