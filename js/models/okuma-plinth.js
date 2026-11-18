// The university archives identify the 1932 monument as 総長大隈老侯像.
// https://www.waseda.jp/culture/archives/other/2026/04/27/7343/
// Outlines are simplified from Noto Serif CJK JP (Adobe, SIL OFL, fonts/OFL.txt).
// Each pair encodes x/y on a 64-unit grid. Dots separate holes within an outline.
const coordinate = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const legendOutlines = [
  'LBRDPEIOJRKTJVIVGVFRBMCMGO pBvCuDtEpI3I5G-K8L8l7m4n3jejencoanaHfImI.pRoTtWvR.eKeh4h3LpKuMtNrOrPwPyN2R0SwXzb0c0eyetaoeihhgmdrYmVhZgZkUhShSlSoL SJYLXMWMJeTdQYRXXcZfZiYkXkVjUfPgP9O-M-LhEiDjBeHe llqmuowrwuvutuppkm SmWpYtZwXzWzVyUsSm FnKoIqFzC5B4Dw iqormsm5y5z40z1z14362718x9m9j8i7i5 0q5t8x-1-39485645y0r dsesfve1b5Y6X5X3bx', // 總
  'xB2F2GTGTOrOuKzPyQTQTXrXuTzYzZyZTZTh1h4d-i9jejipnvykzk4o1opwx1-4-58669w5p1kwgqdjTjT1iyjzJ9H-E5P2PjBjAhPhPCVEtE', // 長
  'cBjCiDhDgUzU3Q9V8WhWlirr00-6-6786-x4szovjkgXdkaqWwR0L5B-A9L2TtYkadbWCWBUbU', // 大
  'RBRBWGTHKWPbSgTlTqSsQuMwKwJsGrGqMqOoPkNeIWOGFFF8E-B-BBGDOD 1B6F4G3c0dzacabdYeYBdDzD.cFcNlNlF.qFqNzNzF.cPcYlYlP.qPqYzYzP 4d-h9jojqptu3k8o7p5ouv11-5876-z6t0psmjfjf1rzr0W8V-S4a2ajUjTh1g', // 隈
  'ZBfBfCdDdMmMpIuN2D8H5HxQoZ1Z4V-a8cmcYmYumoxh2mzmnrYwY5Z6b606153w4w456677691-v-a-W-U8U6ToGvCxBxBwKrTlUhZhfcDcCaCZZZZOIOHMZM.dOdZiZtO', // 老
  'PBWDTENSQTOVO8M9K-JZCiBiJT wC2GzHzQ2Q5M-R-S8ScShVfWdaxa0W6b6c4cpcon1n4j-o-p9prpuuxy32-6-7886-17u0rvppoplwh1b6S-R9Y5e0hvjpSpSnknlcbcWjUkTkTkYbbSTSTQuQuGZGZEuE', // 侯
  'fBlDlEjEhHrHtEyIvJoP0P3N8R5S5d5d1e1cscthwn5e9ixo3v-182650zwtslqcpckgomstt2s6r8o-k-i7d6e5n5p0oud1W4Q6Q5W2dzjunqmnfrZuSwRvcqkjihVnRoRnbijcacZeWfWRQUQUYMcG.fJZObPmPqJ.qRqa1a1R.aRaalalR NBUDUESENSPTNUN9L-J-JaCjBjIT', // 像
];

function inscriptionGeometry(T) {
  const shapes = [];
  for (const [row, glyph] of legendOutlines.entries()) {
    for (const outline of glyph.split(' ')) {
      const shape = new T.Shape();
      for (const [ring, points] of outline.split('.').entries()) {
        const path = ring ? new T.Path() : shape;
        for (let i = 0; i < points.length; i += 2) {
          const x = (coordinate.indexOf(points[i]) / 63 - .5) * .52;
          const y = 5.40 - row * .448 - coordinate.indexOf(points[i + 1]) / 63 * .305;
          if (i === 0) path.moveTo(x, y);
          else path.lineTo(x, y);
        }
        path.closePath();
        if (ring) shape.holes.push(path);
      }
      shapes.push(shape);
    }
  }
  const geometry = new T.ExtrudeGeometry(shapes, {
    depth:.008, bevelEnabled:true, bevelSize:.0026, bevelThickness:.0026,
    bevelSegments:1, steps:1, curveSegments:1,
  });
  // The slender relief sits directly on the inclined granite face at every height.
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const y = points.getY(i);
    const front = 2.105 + (1.786 - 2.105) * (y - .505) / (6.445 - .505);
    points.setZ(i, front + .0032 + points.getZ(i));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function dressedCourse(T, layers, weathered) {
  const positions = [], indices = [], uv = [], colors = [];
  const contour = ([y, x, z, bevel]) => [
    [-x+bevel,y,z], [x-bevel,y,z], [x,y,z-bevel], [x,y,-z+bevel],
    [x-bevel,y,-z], [-x+bevel,y,-z], [-x,y,-z+bevel], [-x,y,z-bevel],
  ];
  function vertex(x, y, z, u, v) {
    positions.push(x, y, z);
    uv.push(u / 1.38, v / 1.38);
    if (weathered) {
      const drift = Math.sin(x * 2.1 + z * 1.3 + .3 * Math.sin(y * 1.6));
      const streak = Math.sin(x * 5.7 + z * 5.3 + .13 * y);
      const stain = Math.max(0, drift * .55 + streak * .24 + .27) * Math.min(1, (6.5-y)*.48);
      const footing = Math.max(0, 1 - (y-.39)/1.4);
      colors.push(.90-.16*stain-.08*footing, .91-.22*stain-.10*footing, .91-.29*stain-.13*footing);
    }
  }
  for (let layer = 0; layer < layers.length - 1; layer++) {
    const lower = contour(layers[layer]), upper = contour(layers[layer+1]);
    const vertical = weathered && upper[0][1]-lower[0][1] > 1 ? 14 : 1;
    for (let side = 0; side < 8; side++) {
      const next = (side+1)%8;
      const across = weathered && side%2===0 ? 11 : 1;
      const first = positions.length/3;
      for (let j=0; j<=vertical; j++) {
        const t=j/vertical;
        for (let i=0; i<=across; i++) {
          const u=i/across;
          const point = lower[side].map((a,k) =>
            (a*(1-u)+lower[next][k]*u)*(1-t) + (upper[side][k]*(1-u)+upper[next][k]*u)*t);
          vertex(...point, side===2 || side===6 ? point[2] : point[0], point[1]);
          if (i===across || j===vertical) continue;
          const a = first + j * (across+1) + i, b = a + across + 1;
          indices.push(a, a+1, b, a+1, b+1, b);
        }
      }
    }
  }
  for (const [j, top] of [[0,false], [layers.length-1,true]]) {
    const first=positions.length/3;
    vertex(0, layers[j][0], 0, 0, 0);
    const ring=contour(layers[j]);
    for (const point of ring) vertex(...point, point[0], point[2]);
    for(let i=0;i<8;i++){
      const a=first+1+i, b=first+1+(i+1)%8;
      if(top)indices.push(first,a,b);
      else indices.push(first,b,a);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  if(weathered)geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function saltAndPepperGranite(T, source) {
  const granite=source.clone();
  delete granite.userData.surface;
  granite.color.set('#a8a8a3');
  granite.roughness=.91;granite.vertexColors=true;
  const size=96, texels=new Uint8Array(size*size*4);
  let seed=729;
  const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<texels.length;i+=4) {
    const grain=noise(),tone=grain<.085?112+25*noise():grain>.875?235+20*noise():184+43*noise();
    texels[i]=Math.min(255,tone+4);texels[i+1]=Math.min(255,tone+3);
    texels[i+2]=Math.min(255,tone+5);texels[i+3]=255;
  }
  const quartz=new T.DataTexture(texels,size,size,T.RGBAFormat);
  quartz.name='Fine quartz and dark mica in dressed granite';
  quartz.colorSpace=T.SRGBColorSpace;quartz.wrapS=quartz.wrapT=T.RepeatWrapping;
  quartz.magFilter=T.LinearFilter;quartz.minFilter=T.LinearMipmapLinearFilter;
  quartz.generateMipmaps=true;quartz.needsUpdate=true;
  granite.map=quartz;
  return granite;
}

export function createOkumaPlinth(T, monument, {stone,bronze}) {
  function part(name, geometry, material) {
    const mesh=new T.Mesh(geometry,material);
    mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;monument.add(mesh);
    return mesh;
  }
  const granite=saltAndPepperGranite(T,stone);
  part('Tapered granite monolith',dressedCourse(T,[
    [.39,2.49,2.115,.052], [.413,2.5,2.125,.050],
    [.475,2.5,2.125,.050], [.505,2.478,2.105,.048],
    [6.445,2.104,1.786,.046], [6.465,2.086,1.77,.050],
  ],true),granite);

  // The cast's low, dark base has softly dressed corners and a restrained raised rim.
  const patinated=bronze.clone();
  patinated.color.set('#47534c');patinated.roughness=.66;patinated.metalness=.54;
  part('Patinated rectangular casting base',dressedCourse(T,[
    [6.465,1.756,1.60,.073], [6.494,1.775,1.62,.077],
    [7.333,1.746,1.594,.091], [7.391,1.716,1.566,.101],
    [7.432,1.655,1.517,.115],
  ],false),patinated);

  const cut=stone.clone();
  delete cut.userData.surface;
  cut.color.set('#626460');cut.roughness=.93;
  const legend=part('総長大隈老侯像 · granite inscription',inscriptionGeometry(T),cut);
  legend.userData.inscription='総長大隈老侯像';
}
