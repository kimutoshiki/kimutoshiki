// One illustrated atlas for the cover and three pages. Each quadrant includes
// a paper margin so neighbouring pages cannot bleed at ordinary viewing sizes.
export function drawNotebookAtlas(canvas, mincho) {
  const c = canvas.getContext('2d');
  const path = (points, close = false) => {
    c.beginPath();
    points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    if (close) c.closePath();
    c.stroke();
  };
  const line = (x, y, xx, yy) => path([[x, y], [xx, yy]]);
  const text = (value, x, y, size, face = 'serif', weight = 500) => {
    c.font = weight + ' ' + size + 'px ' + face; c.fillText(value, x, y);
  };
  const burgundy = '#814439', ink = '#243e3f', gold = '#e7ca85';
  c.fillStyle = '#344736'; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 512; i += 4) {
    c.fillStyle = i % 8 ? '#3b503d' : '#374a38'; c.fillRect(i, 0, 1, 512);
    c.fillStyle = 'rgba(177,164,117,.065)'; c.fillRect(0, i, 512, 1);
  }
  c.fillStyle = '#293629'; c.fillRect(0, 0, 34, 512);
  c.strokeStyle = gold; c.lineWidth = 3; c.strokeRect(54, 20, 435, 472);
  c.lineWidth = 1; c.strokeRect(61, 27, 421, 458); line(32, 0, 32, 512);
  c.textAlign = 'center'; c.fillStyle = gold;
  text('FIELD NOTES', 272, 94, 31, 'Georgia, serif');
  text('旅の手帖', 272, 251, 83, mincho, 650);
  line(172, 277, 372, 277);
  text('早稲田  ·  唐津', 272, 332, 37, mincho);
  text('T. KIMURA', 272, 443, 23, 'Georgia, serif');
  // Gilt compass rose stamped into the cloth.
  const cx = 272, cy = 150;
  c.lineWidth = 1.8;
  c.beginPath(); c.arc(cx, cy, 26, 0, Math.PI * 2); c.stroke();
  path([[cx,cy-34],[cx+6,cy-6],[cx+33,cy],[cx+6,cy+6],[cx,cy+34],[cx-6,cy+6],[cx-33,cy],[cx-6,cy-6]], true);

  function page(index, title, latin, draw) {
    c.save(); c.translate((index % 2) * 512, Math.floor(index / 2) * 512);
    c.fillStyle = '#efe6cc'; c.fillRect(0, 0, 512, 512);
    c.strokeStyle = '#cfbea2'; c.lineWidth = 1.3;
    for (let y = 153; y < 469; y += 31) line(28, y, 484, y);
    c.strokeStyle = '#b47d65'; line(50, 137, 50, 472);
    c.fillStyle = burgundy; c.textAlign = 'left';
    text(latin, 47, 55, 21, 'Georgia, serif');
    c.fillStyle = ink; text(title, 44, 124, 58, mincho, 650);
    c.strokeStyle = ink; c.lineWidth = 2.8; c.lineJoin = 'round'; c.lineCap = 'round';
    draw();
    // Irregular cotton-fibre grain and engraved page numbers reproduce on both renderers.
    let seed = 1931 + index;
    function noise() { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed / 4294967296; }
    c.fillStyle = 'rgba(88,68,33,.085)';
    for (let i=0;i<3500;i++) c.fillRect(noise()*512,noise()*512,.6+noise()*1.4,.7);
    c.strokeStyle='#a88a62'; c.lineWidth=1; line(48,462,465,462);
    c.fillStyle='#745a42'; c.textAlign='right'; text(String(index),463,490,15,'Georgia, serif');
    c.restore();
  }
  page(1, '覚え書き', 'FIELD NOTES', () => {
    c.fillStyle = '#596358'; text('早稲田 と 唐津', 70, 206, 36, mincho);
    line(70, 234, 245, 234);
    for (let i = 0; i < 3; i++) {
      c.strokeRect(72, 271 + i * 54, 13, 13);
      line(105, 279 + i * 54, 341 - i * 27, 279 + i * 54);
    }
  });
  page(2, '大隈講堂', 'WASEDA', () => {
    // The stepped clock tower and long gabled hall, drawn as a field sketch.
    path([[95,409],[95,340],[124,340],[124,319],[162,302],[197,323],[197,404]]);
    path([[103,340],[162,311],[200,331],[279,331]]);
    path([[198,401],[198,343],[281,343],[281,401]]);
    for (let x = 117; x < 270; x += 20) {
      path([[x,393],[x,359],[x+4,353],[x+10,359],[x+10,393]]);
    }
    c.strokeRect(285, 239, 68, 165); c.strokeRect(278, 232, 82, 8);
    path([[284,232],[284,208],[296,197],[296,183],[318,158],[341,183],[341,197],[352,208],[352,232]]);
    c.strokeRect(291, 248, 56, 46);
    c.beginPath(); c.arc(319, 270, 18, 0, Math.PI * 2); c.stroke(); path([[319,257],[319,270],[330,275]]);
    for (let x = 297; x < 349; x += 15) path([[x,395],[x,312],[x+6,312],[x+6,395]]);
    line(72,411,418,411);
    c.strokeStyle='#7c7768'; c.lineWidth=1.55;
    for (let y=328;y<397;y+=9) for (let x=205;x<274;x+=13) line(x+(y%2)*5,y,x+6+(y%2)*5,y);
    for (let x=286;x<316;x+=5) line(x,399,x+3,394);
    for (let y=212;y<232;y+=7) line(289,y,346,y);
    for (let x=98;x<188;x+=6) line(x,339+(x-98)*-.38,x+5,337+(x-98)*-.38);
    c.fillStyle=burgundy; text('WASEDA  /  TOKYO',74,443,16,'Georgia, serif');
  });
  page(3, '唐津城', 'KARATSU', () => {
    // Layered tiled roofs above the sloping stonework and a rippled waterfront.
    path([[116,399],[147,353],[331,353],[363,399]], true);
    for (let y = 366; y < 396; y += 13) {
      line(144-(y-366)*.6, y, 341+(y-366)*.65, y);
      for (let x = 161+(y%2)*11; x < 331; x += 32) line(x, y-9, x+2, y);
    }
    for (const [x,y,w,h] of [[238,350,180,45],[238,305,151,37],[238,268,119,32],[238,236,86,29]]) {
      const half = w / 2;
      path([[x-half,y],[x-half,y-h+13],[x+half,y-h+13],[x+half,y]]);
      path([[x-half-16,y-h+13],[x-half+14,y-h+3],[x-half+32,y-h-10],
        [x+half-32,y-h-10],[x+half-14,y-h+3],[x+half+16,y-h+13]], true);
      for (let wx = x-half+15; wx < x+half-4; wx += 18) line(wx, y-h+19, wx, y-6);
    }
    path([[177,210],[208,197],[238,178],[269,197],[299,210]]);
    line(81,405,412,405);
    c.lineWidth=1.4;
    for (const [y,half] of [[317,91],[279,74],[247,56],[221,39]]) {
      for(let x=-half;x<=half;x+=7) line(238+x,y,238+x*1.1,y+4);
    }
    c.fillStyle=burgundy; text('KARATSU  /  SAGA',74,451,16,'Georgia, serif');
    for (const [x,y,w] of [[78,421,79],[181,429,110],[319,420,74]]) line(x,y,x+w,y);
  });
}


export const BOOK_WIDTH = .83, BOOK_DEPTH = .66;
export const LEAF_START = .42;
const clamp = v => Math.max(0,Math.min(1,v));
const smooth = t => (t=clamp(t), t*t*(3-2*t));

export function coverPose(progress) {
  const turn = smooth(progress / .52);
  return {angle: turn * (Math.PI-.018), height:.112-.095*turn};
}

// Integrate the turning paper's tangent along the leaf. Its length stays
// constant as the gutter lifts and the free fore-edge lags behind the fold.
export function leafPosition(progress, u, v, backing, out) {
  const turn=smooth((progress-LEAF_START+(backing ? .033 : 0))/(1-LEAF_START-(backing ? .01 : 0)));
  const flight=Math.sin(Math.PI*turn), width=BOOK_WIDTH-.037, span=width*u;
  const twist=(v-.5)*.23*flight;
  const start=Math.PI*turn + flight*.68 + twist;
  const bend=-1.43*flight;
  const end=start+bend*u;
  const x=Math.abs(bend)<.0001 ? span*Math.cos(start) : width*(Math.sin(end)-Math.sin(start))/bend;
  const y=Math.abs(bend)<.0001 ? span*Math.sin(start) : width*(Math.cos(start)-Math.cos(end))/bend;
  const dome=.024*Math.sin(Math.PI*u)*turn;
  out[0]=.012*Math.cos(Math.PI*turn)+x;
  out[1]=.098+y+dome-.060*turn*smooth(u)+(backing ? .0022*Math.cos(Math.PI*turn) : 0);
  out[2]=(v-.5)*(BOOK_DEPTH-.038) + .009*Math.sin(u*Math.PI)*flight*(v-.5);
  return out;
}
