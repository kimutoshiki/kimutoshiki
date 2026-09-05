/* A small exhibition of the three page landmarks. Loaded only on Contact. */
import {createKaratsuCastle} from './karatsu-castle.js';
import {createOkumaStatue} from './okuma-statue.js';
import {createKaratsuBank} from './karatsu-bank.js';
export function createLandmarkGallery(T) {
 const group=new T.Group();group.name='Karatsu and Waseda · landmark gallery';
 const models=[createKaratsuCastle(T),createOkumaStatue(T),createKaratsuBank(T)];
 const layouts=[[-16,0,-2,.40,-.12],[0,0,4,.49,0],[17,0,-3,.40,.12]];
 models.forEach((model,i)=>{const [x,y,z,s,rotation]=layouts[i];model.group.scale.setScalar(s);model.group.position.set(x,y,z);model.group.rotation.y=rotation;group.add(model.group);});
 return {group,target:[0,3.8,0],halfHeight:14,halfWidth:29,azimuth:.10,elevation:.44};
}
