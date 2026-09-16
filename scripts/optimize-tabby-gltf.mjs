/** Encode the 2K room coat as JPEG 95 / 4:4:4 without touching geometry.
 * node scripts/optimize-tabby-gltf.mjs --asset models/tabby-cat-room.glb
 * Optional --sharp /absolute/path/to/sharp and --audit /path/to/audit-directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const args=Object.fromEntries(process.argv.slice(2).reduce((all,item,index,array)=>item.startsWith('--')?[...all,[item.slice(2),array[index+1]]]:all,[]));
if(!args.asset)throw new Error('--asset is required');
const file=path.resolve(args.asset),source=fs.readFileSync(file),jsonLength=source.readUInt32LE(12);
const gltf=JSON.parse(source.subarray(20,20+jsonLength)),binary=source.subarray(28+jsonLength);
if(gltf.buffers.length!==1||gltf.buffers[0].uri)throw new Error('Expected one embedded GLB buffer');
const replacements=new Map(),encodings=[];
for(const [index,image] of gltf.images.entries()){
 const view=gltf.bufferViews[image.bufferView];
 if(!['coat-original-baked','Tabby original dense coat'].includes(image.name)||image.mimeType!=='image/png')continue;
 const require=createRequire(import.meta.url),sharp=require(args.sharp||'sharp');
 const input=binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
 const data=await sharp(input).removeAlpha().jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
 replacements.set(image.bufferView,data);image.mimeType='image/jpeg';
 encodings.push({name:image.name,image:index,sourceBytes:input.length,outputBytes:data.length,quality:95,chromaSubsampling:'4:4:4',dimensions:[2048,2048]});
}
const sheenCorrections=[];
for(const material of gltf.materials){
 const sheen=material.extensions?.KHR_materials_sheen;
 if(!sheen)continue;
 const weight=material.name==='Groom • root to tip variation'?.06499999761581421:.04500000178813934;
 if(!material.name.startsWith('Tabby •')&&!material.name.startsWith('Groom •'))throw new Error('Unknown sheen material');
 sheen.sheenColorFactor=[weight,weight,weight];
 sheenCorrections.push({material:material.name,sourceSheenWeight:weight,exportedSheenColorFactor:sheen.sheenColorFactor});
}
let offset=0;const blocks=[];
for(const [index,view] of gltf.bufferViews.entries()){
 const padding=(4-offset%4)%4;if(padding){blocks.push(Buffer.alloc(padding));offset+=padding;}
 const data=replacements.get(index)||binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
 view.byteOffset=offset;view.byteLength=data.length;blocks.push(data);offset+=data.length;
}
gltf.buffers[0].byteLength=offset;
const padding=(4-offset%4)%4;if(padding)blocks.push(Buffer.alloc(padding));
const bin=Buffer.concat(blocks);let json=Buffer.from(JSON.stringify(gltf));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4);
const result=Buffer.concat([header,json,binHeader,bin]);fs.writeFileSync(file,result);
const hash=crypto.createHash('sha256').update(result).digest('hex');
if(args.audit){
 const reportPath=path.join(args.audit,path.basename(file).includes('room')?'export-room-report.json':'export-report.json');
 const report=JSON.parse(fs.readFileSync(reportPath));Object.assign(report,{exportBytes:result.length,exportSha256:hash,sheenCorrections});
 if(encodings.length)report.textureEncodings=encodings;
 fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
}
console.log(JSON.stringify({file,bytes:result.length,sha256:hash,encodings,sheenCorrections},null,2));
