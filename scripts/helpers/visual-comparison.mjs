// Compare registered RGB frames without UI chrome, labels, compression, or a change of lens.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const reviewViews = ['desk', 'okuma-auditorium', 'okuma-statue', 'karatsu-castle', 'karatsu-bank'];
export const sourceAsset = key => key === 'desk' ? 'images/study/study-1536.webp' : 'images/outdoors/' + key + '-1536.webp';

function sample(image, width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

export function compareFrames(reference, frame) {
  const width = 96, height = 64, count = width * height;
  const a = sample(reference, width, height), b = sample(frame, width, height);
  const rgbError = [0, 0, 0];
  let lumaA = 0, lumaB = 0, product = 0, squareA = 0, squareB = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) rgbError[c] += Math.abs(a[i+c] - b[i+c]);
    const x = .2126*a[i] + .7152*a[i+1] + .0722*a[i+2];
    const y = .2126*b[i] + .7152*b[i+1] + .0722*b[i+2];
    lumaA += x; lumaB += y; squareA += x*x; squareB += y*y; product += x*y;
  }
  const denominator = Math.sqrt(Math.max(0, squareA-lumaA*lumaA/count)*Math.max(0, squareB-lumaB*lumaB/count));
  return {
    meanRgbError: rounded(rgbError.reduce((a,b) => a+b)/(3*count)),
    channelMeanAbsoluteErrors: rgbError.map(error => rounded(error/count)),
    luminanceCorrelation: rounded(denominator ? (product-lumaA*lumaB/count)/denominator : 0),
  };
}
const rounded = number => Number(number.toFixed(3));

export function frameDetail(frame) {
  const w = 384, h = 256, a = sample(frame, w, h), colors = new Set();
  let edge = 0;
  for (let y = 1; y < h; y++) for (let x = 1; x < w; x++) {
    const i = (y*w+x)*4;
    colors.add(a[i]<<16 | a[i+1]<<8 | a[i+2]);
    for (let c = 0; c < 3; c++) edge += Math.abs(a[i+c]-a[i+c-4]) + Math.abs(a[i+c]-a[i+c-w*4]);
  }
  return { colors: colors.size, meanNeighbourDifference: rounded(edge/(6*(w-1)*(h-1))) };
}

export async function saveComparison(folder, stem, cells) {
  if (!folder) return;
  await mkdir(folder, {recursive:true});
  const width=576, height=384, label=33, columns=2;
  const sheet = createCanvas(width*columns, (height+label)*Math.ceil(cells.length/columns)), ctx=sheet.getContext('2d');
  ctx.fillStyle = '#ece8df'; ctx.fillRect(0,0,sheet.width,sheet.height);
  for (const [index,cell] of cells.entries()) {
    const image = Buffer.isBuffer(cell.image) ? await loadImage(cell.image) : cell.image;
    const x = index%columns*width, y = Math.floor(index/columns)*(height+label);
    ctx.fillStyle='#282922'; ctx.font='18px sans-serif'; ctx.fillText(cell.label,x+10,y+23);
    ctx.drawImage(image,x,y+label,width,height);
    await writeFile(join(folder,stem+'-'+cell.name+'.webp'),await webp(image));
  }
  await writeFile(join(folder,stem+'-comparison.webp'),await sheet.encode('webp',88));
}

async function webp(image) {
  const canvas = createCanvas(image.width,image.height);
  canvas.getContext('2d').drawImage(image,0,0);
  return canvas.encode('webp',90);
}
