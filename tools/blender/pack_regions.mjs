// Offline optional transport compression. Install these development packages in
// a tools directory: @gltf-transform/{core,extensions,functions} and draco3dgltf.
// node tools/blender/pack_regions.mjs /path/to/tools [assets/models/blender]
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(resolve(process.argv[2],'package.json'));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {draco,weld}=require('@gltf-transform/functions');
const codec=require('draco3dgltf');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder':await codec.createEncoderModule(),
  'draco3d.decoder':await codec.createDecoderModule(),
});
for(const name of process.argv.length > 4 ? process.argv.slice(4) : ['waseda-campus','karatsu-town']){
  const file=resolve(process.argv[3]||'assets/models/blender',name+'.glb');
  const input=await readFile(file),doc=await io.readBinary(input);
  await doc.transform(weld(),draco({method:'edgebreaker',encodeSpeed:4,decodeSpeed:6,quantizePosition:18,quantizeNormal:9,quantizeTexcoord:16,quantizeColor:8}));
  const packed=await io.writeBinary(doc);
  const test=await io.readBinary(packed);
  if(!test.getRoot().listMeshes().length || !test.getRoot().listNodes().some(n=>n.getExtras().collisionBoxes))throw new Error('Incomplete '+name);
  await writeFile(file,packed);console.log(name,input.length,'→',packed.length);
}
