// Compare registered RGB frames without UI chrome, labels, compression, or a change of lens.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const reviewViews = ['desk', 'okuma-auditorium', 'okuma-statue', 'karatsu-castle', 'karatsu-bank'];
export const sourceAsset = key => key === 'desk' ? 'images/study/study-1536.webp' : 'images/outdoors/' + key + '-1536.webp';

const sources=new WeakMap();
function rawPixels(image){
  let raw=sources.get(image);
  if(raw)return raw;
  let ctx=image.getContext?.('2d');
  if(!ctx){
    ctx=createCanvas(image.width,image.height).getContext('2d');
    ctx.drawImage(image,0,0);
  }
  raw=ctx.getImageData(0,0,image.width,image.height).data;
  sources.set(image,raw);return raw;
}

// Use the same pixel-area integration for Canvas and decoded files. The
// platform may otherwise choose different resampling filters for those types.
function sample(image,width,height,box=[0,0,1,1]){
  const raw=rawPixels(image), result=new Uint8ClampedArray(width*height*4);
  const left=box[0]*image.width,top=box[1]*image.height;
  const dx=box[2]*image.width/width,dy=box[3]*image.height/height;
  for(let y=0;y<height;y++){
    const y0=top+y*dy,y1=Math.min(image.height,top+(y+1)*dy);
    for(let x=0;x<width;x++){
      const x0=left+x*dx,x1=Math.min(image.width,left+(x+1)*dx);
      let red=0,green=0,blue=0;
      for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++){
        const wy=Math.min(y1,sy+1)-Math.max(y0,sy);
        for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
          const weight=wy*(Math.min(x1,sx+1)-Math.max(x0,sx)),p=(sy*image.width+sx)*4;
          red+=raw[p]*weight;green+=raw[p+1]*weight;blue+=raw[p+2]*weight;
        }
      }
      const i=(y*width+x)*4,area=(x1-x0)*(y1-y0);
      result[i]=red/area;result[i+1]=green/area;result[i+2]=blue/area;result[i+3]=255;
    }
  }
  return result;
}

export function compareFrames(reference,frame,box) {
  const width=96,height=64,count=width*height;
  const a=sample(reference,width,height,box),b=sample(frame,width,height,box);
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

// Small subjects can disappear in whole-frame scores, particularly the bronze
// between the canopy and its plinth. Keep their positions in source-image UVs.
const subjectBoxes={
  desk:[.14,.17,.73,.40], 'okuma-auditorium':[.16,.02,.72,.81],
  'okuma-statue':[.42,.04,.15,.51], 'karatsu-castle':[.30,.02,.51,.79], 'karatsu-bank':[.07,.15,.82,.69],
};
export function compareSubject(key,source,frame){
  return compareFrames(source,frame,subjectBoxes[key]);
}
