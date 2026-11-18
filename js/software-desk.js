import {buildSoftwareStatue} from './software-statue.js';

// A separate, compact scene for the CPU renderer. All furniture and props are
// modeled in metres; moving the camera reveals their backs and thickness.
export const SOFTWARE_SEAT={x:0,y:2.04,z:-3.22,yaw:0,pitch:-.205,fov:44};
export const SOFTWARE_DESK_ANCHORS={
  profile:[-1.13,1.55,.79], research:[-.53,1.65,.84], blog:[.0,1.04,-.29], photos:[.79,1.51,.78], contact:[1.11,1.01,-.19]
};
export function buildSoftwareDesk(s) {
  const {box:B,frustum:F,face:P,roof:R,text:T}=s;
  const wood='#956747',edge='#674834',brass='#ad884c',dark='#3b3932',paper='#e9dec7';
  const bg={layer:'ground',order:1};
  const ground=(points,c,n)=>P(points,c,{layer:'ground',order:n});
  ground([[-5,0,-5],[5,0,-5],[5,0,4],[-5,0,4]],'#876b4d',0);
  ground([[-4,0,2.7],[4,0,2.7],[4,4,2.7],[-4,4,2.7]],'#d9c9a9',1);
  ground([[-3.45,0,-4],[-3.45,0,2.7],[-3.45,4,2.7],[-3.45,4,-4]],'#b5a385',1);
  B(0,.37,2.65,7,.74,.08,'#84705a',bg);B(0,.8,2.62,7,.09,.10,'#65563f',bg);
  // Glazed six-light window, with individual far hills through each pane.
  const wx=.16,wz=2.54;
  P([[-1.62,.96,wz],[1.95,.96,wz],[1.95,3.15,wz],[-1.62,3.15,wz]],'#add2d6');
  P([[-1.62,1.06,2.535],[-1.62,1.84,2.535],[-1.32,1.95,2.535],[-.92,1.81,2.535],[-.55,2.05,2.535],[0,1.80,2.535],[.48,1.97,2.535],[.98,2.07,2.535],[1.45,1.83,2.535],[1.95,1.89,2.535],[1.95,1.06,2.535]],'#a7ba9b');
  P([[-1.62,1.07,2.53],[-1.62,1.65,2.53],[-1.13,1.78,2.53],[-.6,1.63,2.53],[-.03,1.72,2.53],[.53,1.55,2.53],[1.07,1.81,2.53],[1.95,1.63,2.53],[1.95,1.07,2.53]],'#779378');
  for(const x of [-1.65,-.48,.73,1.95])B(x,2.06,2.50,.07,2.2,.07,'#785b3e');
  for(const y of [.98,2.04,3.15])B(wx,y,2.49,3.71,.07,.09,'#806446');
  B(wx,.93,2.42,3.88,.1,.28,'#70543c');
  // Library shelves. Spines have individual cloth, gilt bands and headcaps.
  const covers=['#714d42','#48645d','#a08a5b','#5d6374','#9a674e','#797947','#9b8a78'];
  for(const x of [-2.60,2.69]){
    B(x,1.46,2.40,1.20,2.7,.22,'#53483d');
    for(const dx of [-.64,.64])B(x+dx,1.48,2.25,.09,2.84,.44,edge);
    for(const [r,y] of [.30,.91,1.53,2.15,2.80].entries()){
      B(x,y,2.19,1.34,.065,.53,wood);
      if(r===4)break;
      for(let i=0;i<7;i++){
        const h=.33+((i*7+r*5)%9)*.022, xx=x-.51+i*.145,c=covers[(i+2*r)%7];
        B(xx,y+.044+h/2,2.16,.127,h,.31,c);
        B(xx,y+.09,1.998,.093,.018,.012,brass);B(xx,y+h-.006,1.998,.10,.012,.012,brass);
      }
    }
  }
  // Solid worktop and cabinet. The front lip, rails and drawer front have
  // separate edge bevels; grain follows planks, keeping horizontal scale clear.
  B(0,.88,.15,3.72,.115,1.96,wood);
  // Elliptical contact shadows anchor objects to the wood. The thin bands
  // beneath the lamp change with the actual switch and stay on the tabletop.
  function oval(x,y,z,rx,rz,color,opts) {
    const points=Array.from({length:24},(_,i)=>{const a=i*Math.PI/12;return [x+rx*Math.cos(a),y,z+rz*Math.sin(a)];});
    P(points,color,opts);
  }
  for(let j=0;j<4;j++)oval(-1.27,.9379+j*.00012,-.07,.50-j*.070,.42-j*.052,'#a57a51',{tint:p=>p.lamp>.5?['#986c49','#9c704b','#a1754e','#a57a51'][j]:'#956747'});
  for(const [x,z,rx,rz] of [[-1.38,-.01,.207,.160],[-1.11,.76,.34,.23],[-.51,.77,.33,.22],[.87,.79,.34,.23],[1.12,-.22,.306,.197]])
    oval(x+.025,.940,z+.02,rx,rz,'#825f43');
  for(let i=0;i<18;i++){
    const x=-1.78+i*.202,z=-.72+(i%4)*.24,l=.18+(i%3)*.10;
    P([[x,.939,z],[x+.004,.939,z+l],[x+.016,.939,z+l+.12],[x+.009,.939,z+l*.65]],'#8f6344');
  }
  B(0,.825,-.83,3.70,.085,.065,edge);
  for(const x of [-1.65,1.65])for(const z of [-.63,.90])B(x,.40,z,.12,.80,.15,edge);
  for(const x of [-1.22,-.77,-.22,.35,.88,1.47])B(x,.939,.13,.008,.002,1.92,'#815a3e');
  B(0,.65,.51,2.99,.25,.54,'#71513a');
  const slide={id:'drawer',transform:(x,y,z,p)=>[x,y,z-.53*p.drawer]};
  B(.68,.69,-.41,.99,.19,.68,'#6f513e',slide);B(.68,.71,-.77,1.09,.225,.057,'#865d42',slide);
  B(.68,.71,-.811,.91,.14,.016,'#a0774e',slide);B(.68,.72,-.838,.18,.032,.037,brass,slide);
  B(-.70,.71,-.77,1.51,.22,.057,'#7d563d');
  B(-.7,.72,-.817,.17,.025,.043,brass);
  B(-.05,.947,-.26,1.57,.013,.77,'#6d413d');B(-.05,.955,-.26,1.52,.006,.72,'#804e47');
  // Hinged bound notebook. Leaves swing around a physical spine. Separate
  // covers, page edges, rules and a ribbon remain attached during rotation.
  const nx=-.26,nz=-.28,base=.974,bookw=.49,bookd=.57;
  const book={id:'notebook'};
  B(nx+bookw/2,base,nz,bookw,.024,bookd,'#3f5a4c',book);
  B(nx+bookw/2,base+.042,nz,bookw-.022,.061,bookd-.028,paper,book);
  for(let i=0;i<3;i++)B(nx+bookw/2,base+.029+i*.014,nz-bookd/2+.012,bookw-.034,.002,.004,'#b5a682',book);
  for(let i=0;i<7;i++)B(nx+bookw/2,base+.075,nz-.18+i*.054,bookw*.77,.001,.002,'#b9b39a',book);
  function hinge(scale=1){return {id:'notebook',transform:(x,y,z,p)=>{
    const angle=p.notebook*Math.PI*.966*scale, xx=x-nx, yy=y-(base+.082);
    return [nx+xx*Math.cos(angle)-yy*Math.sin(angle),base+.082+xx*Math.sin(angle)+yy*Math.cos(angle),z];
  }};}
  B(nx+bookw/2,base+.081,nz,bookw,.023,bookd,'#35594c',hinge());
  B(nx+.03,base+.095,nz,.015,.002,bookd-.016,brass,hinge());
  for(const z of [nz-.22,nz+.22])B(nx+bookw/2,base+.094,z,bookw-.084,.003,.009,brass,hinge());
  B(nx+bookw/2,base+.094,nz+.035,.18,.002,.09,'#b3955f',hinge());
  B(nx+bookw/2,base+.069,nz,bookw-.03,.004,bookd-.032,paper,hinge(.978));
  B(nx+.086,base+.077,nz-.235,.022,.004,.17,'#8e403d',book);
  // Banker's lamp with octagonal green glass shade and stepped brass foot.
  const lamp={id:'lamp'};const lx=-1.34,lz=-.02;
  F(lx,.968,lz,.185,.161,.045,12,'#735938',lamp);F(lx,1.00,lz,.145,.088,.043,12,brass,lamp);
  F(lx,1.26,lz,.022,.019,.50,8,brass,lamp);B(lx,1.51,lz+.032,.39,.027,.030,brass,lamp);
  const glass={id:'lamp',tint:p=>p.lamp>.5?'#39806a':'#37594e'};
  const xs=[lx-.25,lx+.25], section=[[-.115,1.43],[-.116,1.52],[-.075,1.59],[.030,1.60],[.105,1.55],[.112,1.46]];
  for(let i=1;i<section.length;i++){
    const [z0,y0]=section[i-1],[z1,y1]=section[i];P([[xs[0],y0,lz+z0],[xs[1],y0,lz+z0],[xs[1],y1,lz+z1],[xs[0],y1,lz+z1]],'#39806a',glass);
  }
  for(const x of xs)P(section.map(([z,y])=>[x,y,lz+z]),'#536254',lamp);
  B(lx,1.454,lz-.007,.46,.012,.18,'#ffe0a0',{...lamp,glow:true,tint:p=>p.lamp>.5?'#ffdda0':'#8a846a'});
  // Brass-mounted miniatures of the auditorium, bronze statue and castle.
  function plinth(x,z,id){
    const o={id};B(x,.980,z,.56,.06,.41,edge,o);B(x,1.018,z,.51,.019,.37,brass,o);return o;
  }
  const st=plinth(-1.13,.77,'profile');B(-1.13,1.115,.77,.19,.18,.17,'#958673',st);
  buildSoftwareStatue(s,-1.13,1.205,.77,.45,'profile',.16);
  const au=plinth(-.54,.79,'research');B(-.54,1.12,.79,.39,.19,.24,'#b79a77',au);R(-.54,1.235,.79,.43,.085,.28,'#765c4c',au);
  B(-.61,1.40,.74,.151,.49,.149,'#c3a78a',au);for(const y of [1.29,1.51,1.63])B(-.61,y,.74,.181,.023,.177,brass,au);
  B(-.61,1.565,.659,.087,.087,.012,'#ece1b9',au);B(-.61,1.58,.65,.007,.033,.005,dark,au);
  F(-.61,1.70,.74,.127,.011,.15,4,'#706351',au);
  const ca=plinth(.83,.80,'photos');for(let i=0;i<3;i++){
    const w=.42-i*.087,y=1.068+i*.126;B(.83,y,.8,w,.097,w*.77,'#ebe2ca',ca);R(.83,y+.075,.8,w+.075,.07,w*.84+.052,'#4e5861',ca);
    for(const k of [-1,0,1])B(.83+k*w*.19,y,.8-w*.388,.025,.035,.006,dark,ca);
  }
  const co={id:'contact'};B(1.12,.954,-.22,.52,.016,.33,'#e6d5ac',co);
  P([[.861,.967,-.059],[1.379,.967,-.059],[1.12,.967,-.272]],'#cfbb99',co);
  F(1.12,.973,-.267,.046,.048,.009,10,'#974d43',co);
  // Pencil jar, writing tools and a ceramic cup with a dark glazed interior.
  F(1.46,1.06,.53,.099,.110,.23,9,'#6d7768');
  for(let i=0;i<4;i++){const x=1.40+i*.036,z=.52+(i%2)*.042;F(x,1.25,z,.009,.009,.28+i*.023,5,covers[i]);F(x,1.40+i*.011,z,.012,.001,.035,5,'#d2ba8d');}
  B(.42,.966,-.67,.38,.019,.023,'#9c8258');
  F(-.1,1.01,.68,.087,.092,.14,10,'#b6c2bd');F(-.1,1.084,.68,.082,.078,.006,10,'#59483a');
  B(-.01,1.024,.68,.043,.066,.028,'#aab8b0');
  return s;
}
