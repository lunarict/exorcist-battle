/* v56.6.28. Integration of approved REF03 into all six live characteristics.
 * Game state is owned only by app.js. Assets are captured locally at runtime;
 * no service, screenshot library, extra font, or pre-rendered trait text.
 */
(() => {
'use strict';
const grid = document.getElementById('traits');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const jobs = new Map();
const DURATION = 1120, SWITCH = 550, HOLD = 590;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=t=>t*t*(3-2*t);
const info={completed:0,cancelled:0,fallbacks:0,snapshots:0,lastError:null,renderers:{webgl:0,software:0},maxActive:0};
let frame=0;
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const timeout=(promise,ms)=>new Promise((resolve,reject)=>{
 const id=setTimeout(()=>reject(Error('Paper preparation timed out')),ms);
 Promise.resolve(promise).then(v=>{clearTimeout(id);resolve(v);},e=>{clearTimeout(id);reject(e);});
});
function canvasOf(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;}
// Native snapshots avoid SVG/foreignObject layout differences in WebKit.
async function capture(card){
 const value=await window.ExorcistPaperSnapshot.capture(card);
 info.snapshots++;
 return value;
}
function track(keys){
 const n=keys.length,m=new Float64Array(n),d=new Float64Array(n-1),h=new Float64Array(n-1);
 for(let i=0;i<n-1;i++){h[i]=keys[i+1][0]-keys[i][0];d[i]=(keys[i+1][1]-keys[i][1])/h[i];}
 m[0]=0;m[n-1]=0;
 for(let i=1;i<n-1;i++){
  if(d[i-1]*d[i]<=0)m[i]=0;
  else{const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];m[i]=(w1+w2)/(w1/d[i-1]+w2/d[i]);}
 }
 return t=>{
  if(t<=keys[0][0])return keys[0][1];if(t>=keys[n-1][0])return keys[n-1][1];
  let i=0;while(t>keys[i+1][0])i++;const x=(t-keys[i][0])/h[i],x2=x*x,x3=x2*x;
  return (2*x3-3*x2+1)*keys[i][1]+(x3-2*x2+x)*h[i]*m[i]+(-2*x3+3*x2)*keys[i+1][1]+(x3-x2)*h[i]*m[i+1];
 };
}
const rollTrack=track([[0,0],[60,.032],[105,.020],[150,.058],[230,.290],[310,.550],[346,.588],[410,.867],[485,.988],[510,1],[590,1],[636,.957],[680,.790],[730,.35],[780,.16],[835,.052],[895,.002],[925,0],[1120,0]]);
const angleTrack=track([[0,.20],[60,.22],[150,.155],[270,.13],[346,.145],[485,.075],[540,.050],[590,.050],[675,-.065],[770,-.105],[840,-.080],[925,-.070],[1120,-.070]]);
const preTrack=track([[0,0],[45,4],[78,14],[130,8],[180,0],[1120,0]]);
const tailTrack=track([[0,0],[810,0],[865,12],[925,10],[960,1.6],[980,0],[1014,1.15],[1050,.15],[1100,0],[1120,0]]);
const tensionTrack=track([[0,0],[270,0],[315,.065],[347,.080],[405,-.025],[460,0],[510,0],[565,.02],[590,.018],[670,-.025],[780,0],[1120,0]]);
function createSurface(card,initial,forceSoftware=false){
 const NX=360,NY=28,STRIDE=9;
 const gpu=forceSoftware?null:acquireGPU(NX,NY,STRIDE);
 const canvas=gpu?.canvas||document.createElement('canvas');canvas.className='paper-roll-surface';canvas.dataset.motionLayer='roll';canvas.setAttribute('aria-hidden','true');
 const ctx=gpu?null:canvas.getContext('2d',{alpha:true});
 const layer=canvasOf(1,1),lc=layer.getContext('2d',{alpha:true});
 const shadow=canvasOf(1,1),sc=shadow.getContext('2d',{alpha:true});
 const nodes=new Float64Array((NX+1)*(NY+1)*STRIDE),world=new Float64Array((NX+1)*(NY+1)*3),attached=new Float64Array((NX+1)*(NY+1)),row=new Float64Array(NY+1);
 let pw,ph,w,h,left,top,ox=0,oy=0,rw,rh,TW,TH,idata,zbuffer,snap,tex={},ds;
 const S=initial.res||Math.min(3,Math.max(1,devicePixelRatio||1)),LX=.378,LY=.512,LZ=.771,BASE=.59+.41*LZ;
 // A GPU path uses exactly the same mesh and vertex lighting as REF03.
 // Software z-buffer remains available where WebGL is disabled.

 info.renderers[gpu?'webgl':'software']++;
 function setSnapshot(value){
  snap=value;pw=value.W;ph=value.H;left=pw*.10;top=pw*.10;w=pw*1.20;h=ph+pw*.20;
  ds=S;
  if(!gpu){canvas.width=Math.ceil(w*ds);canvas.height=Math.ceil(h*ds);ctx.setTransform(ds,0,0,ds,0,0);}
  canvas.style.width=w+'px';canvas.style.height=h+'px';canvas.style.left=(-left-value.pad)+'px';canvas.style.top=(-top-value.pad)+'px';
  rw=Math.ceil(w*S);rh=Math.ceil(h*S);if(!gpu){layer.width=rw;layer.height=rh;shadow.width=Math.ceil(w);shadow.height=Math.ceil(h);}
  TW=value.front.width;TH=value.front.height;
  if(gpu)gpu.load(value.front,value.back,rw,rh,pw,S);
  else{
   idata=lc.createImageData(rw,rh);zbuffer=new Float32Array(rw*rh);
   tex.front=value.front.getContext('2d').getImageData(0,0,TW,TH).data;
   tex.reverse=value.back.getContext('2d').getImageData(0,0,TW,TH).data;
  }
 }
function pose(time){

 const roll=clamp(rollTrack(time));
 return {roll:roll*pw,angle:angleTrack(time),settle:tailTrack(time)*pw/337,pulse:0,pre:preTrack(time)*pw/337,tension:tensionTrack(time),time};
}
function geometry(p){

 const W=pw,H=ph,k=.045*(W/337),c=Math.cos(p.angle),sn=Math.sin(p.angle);
 const span=W*c+H*Math.abs(sn),amount=p.roll/W*span,boundary=span-amount;
 // An oblique rolling axis, not independent horizontal scale per strip.
 // Along-axis lengths are preserved by mapping them onto spiral arc length.
 const core=W*.031*(1+p.tension),R=Math.sqrt(core*core+2*k*amount),a0=Math.atan(k/R),ca0=Math.cos(a0),sa0=Math.sin(a0);
 for(let j=0;j<=NY;j++){
  const v=j/NY,Y=(v-.5)*H;
  row[j]=clamp((boundary-span*.5-sn*Y)/c+W*.5,0,W);
  for(let i=0;i<=NX;i++){
   const u=i/NX,X=(u-.5)*W,s=c*X+sn*Y+span*.5,b=-sn*X+c*Y,index=j*(NX+1)+i;
   let a=s,z=0;
   if(s>boundary){
    const ds=s-boundary,r=Math.sqrt(Math.max(core*core,R*R-2*k*ds)),theta=(R-r)/k;
    const xx=r*Math.sin(theta),zz=R-r*Math.cos(theta);
    a=boundary+xx*ca0+zz*sa0;z=zz*ca0-xx*sa0;
   }
   let x=c*(a-span*.5)-sn*b+W*.5,y=sn*(a-span*.5)+c*b+H*.5;
   // The last lower corner lands after the broad sheet. This is a single
   // damped follow-through, not whole-card bouncing or random motion.
   if(p.pre>0){
    const corner=clamp((u+.45*v-1.08)/.37);
    z+=p.pre*corner*corner;
    x-=2*p.pre*p.pre*Math.pow(corner,3)/(3*(W*.37));
   }
   if(p.settle>0){
    const su=clamp((u-.74)/.26),local=p.settle*Math.pow(.15+.85*v,3.2);
    z+=local*su*su;
    x-=2*local*local*Math.pow(su,3)/(3*(W*.26));
   }
   const q=index*3;world[q]=x;world[q+1]=-y;world[q+2]=z;
   attached[index]=s<=boundary?1-.22*Math.exp(-Math.pow((boundary-s)/(R*.9),2))*clamp(amount/20):1;
  }
 }
 // Normals are taken from the actual deformed surface, including the
 // diagonal curl and the settling corner; lighting follows the same mesh.
 let n=0;
 for(let j=0;j<=NY;j++)for(let i=0;i<=NX;i++){
  const idx=j*(NX+1)+i,q=idx*3;
  const a=(j*(NX+1)+Math.max(0,i-1))*3,b=(j*(NX+1)+Math.min(NX,i+1))*3;
  const d=(Math.max(0,j-1)*(NX+1)+i)*3,e=(Math.min(NY,j+1)*(NX+1)+i)*3;
  const ux=world[b]-world[a],uy=world[b+1]-world[a+1],uz=world[b+2]-world[a+2];
  const vx=world[e]-world[d],vy=world[e+1]-world[d+1],vz=world[e+2]-world[d+2];
  let nx=vy*uz-vz*uy,ny=vz*ux-vx*uz,nz=vx*uy-vy*ux;
  const il=1/Math.max(1e-10,Math.hypot(nx,ny,nz));nx*=il;ny*=il;nz*=il;
  const dot=nx*LX+ny*LY+nz*LZ,x=world[q],y=world[q+1],z=world[q+2];
  const fs=(.59+.41*Math.max(0,dot))/BASE,bs=(.59+.41*Math.max(0,-dot))/BASE;
  nodes[n++]=(left+x-ox)*S;nodes[n++]=(top-y-z*.39-oy)*S;nodes[n++]=z+.10*(y+H*.5);
  nodes[n++]=i/NX*(TW-1);nodes[n++]=j/NY*(TH-1);nodes[n++]=fs*attached[idx];nodes[n++]=bs;nodes[n++]=z;nodes[n++]=nx;
 }
}
function triangle(ia,ib,ic,frontTex){const a=ia*STRIDE,b=ib*STRIDE,c=ic*STRIDE;
 const ax=nodes[a],ay=nodes[a+1],bx=nodes[b],by=nodes[b+1],cx=nodes[c],cy=nodes[c+1],det=(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
 if(Math.abs(det)<.00001)return;const front=det<0,pixels=front?frontTex:tex.reverse;
 const x0=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),x1=Math.min(rw-1,Math.floor(Math.max(ax,bx,cx)-.5)),y0=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),y1=Math.min(rh-1,Math.floor(Math.max(ay,by,cy)-.5));if(x1<x0||y1<y0)return;
 const inv=1/det,wx=(cy-ay)*inv,wy=-(cx-ax)*inv,vx=-(by-ay)*inv,vy=(bx-ax)*inv;
 const az=nodes[a+2],dzb=nodes[b+2]-az,dzc=nodes[c+2]-az,au=nodes[a+3],dub=nodes[b+3]-au,duc=nodes[c+3]-au,av=nodes[a+4],dvb=nodes[b+4]-av,dvc=nodes[c+4]-av;
 const attr=front?5:6,as=nodes[a+attr],dsb=nodes[b+attr]-as,dsc=nodes[c+attr]-as,output=idata.data;
 for(let yy=y0;yy<=y1;yy++){let wb=((x0+.5-ax)*(cy-ay)-(yy+.5-ay)*(cx-ax))*inv,wc=((bx-ax)*(yy+.5-ay)-(by-ay)*(x0+.5-ax))*inv,pos=yy*rw+x0;
  for(let xx=x0;xx<=x1;xx++,pos++,wb+=wx,wc+=vx){if(wb<-.000001||wc<-.000001||wb+wc>1.000001)continue;
   const depth=az+wb*dzb+wc*dzc;if(depth<zbuffer[pos])continue;
   const u=clamp(au+wb*dub+wc*duc,0,TW-1.0001),v=clamp(av+wb*dvb+wc*dvc,0,TH-1.0001),ui=u|0,vi=v|0,fu=u-ui,fv=v-vi;
   const q=(vi*TW+ui)*4,qr=q+4,qd=q+TW*4,qdr=qd+4,a0=(1-fu)*(1-fv),a1=fu*(1-fv),a2=(1-fu)*fv,a3=fu*fv;
   const alpha=pixels[q+3]*a0+pixels[qr+3]*a1+pixels[qd+3]*a2+pixels[qdr+3]*a3;if(alpha<5)continue;
   zbuffer[pos]=depth;const shade=as+wb*dsb+wc*dsc,o=pos*4;
   output[o]=(pixels[q]*a0+pixels[qr]*a1+pixels[qd]*a2+pixels[qdr]*a3)*shade;
   output[o+1]=(pixels[q+1]*a0+pixels[qr+1]*a1+pixels[qd+1]*a2+pixels[qdr+1]*a3)*shade;
   output[o+2]=(pixels[q+2]*a0+pixels[qr+2]*a1+pixels[qd+2]*a2+pixels[qdr+2]*a3)*shade;output[o+3]=alpha;
  }
 }
}
 function render(time){
  const p=pose(time);
  if(gpu){geometry(p);gpu.draw(nodes,.95+Math.min(1,p.roll/pw)*1.15);return;}
  ctx.clearRect(0,0,w,h);
  let image;
  if(p.roll<.001&&p.settle<.001&&!(p.pre>0)){
   image=snap.front;lc.clearRect(0,0,rw,rh);lc.drawImage(image,left*S,top*S,pw*S,ph*S);
  }else{
   geometry(p);
   if(gpu)image=gpu.draw(nodes,TW,TH);
   else{
    idata.data.fill(0);zbuffer.fill(-1e9);
    for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
     const a=j*(NX+1)+i,b=a+1,c=a+NX+1,d=c+1;triangle(a,c,b,tex.front);triangle(b,c,d,tex.front);
    }
    lc.putImageData(idata,0,0);image=layer;
   }
  }
  const painted=(p.roll<.001&&p.settle<.001&&!(p.pre>0))?layer:image;
  sc.clearRect(0,0,w,h);sc.drawImage(painted,1,2,w,h);sc.globalCompositeOperation='source-in';sc.fillStyle='#000';sc.fillRect(0,0,w,h);sc.globalCompositeOperation='source-over';
  ctx.save();ctx.globalAlpha=.45;ctx.filter='blur('+(.95+Math.min(1,p.roll/pw)*1.15)+'px)';ctx.drawImage(shadow,0,0);ctx.restore();
  ctx.drawImage(painted,0,0,w,h);
 }
 try{setSnapshot(initial);card.append(canvas);render(0);}catch(e){canvas.remove();gpu?.destroy();throw e;}
 return {canvas,render,setSnapshot,fixture(time){render(time);geometry(pose(time));return {nodes:Array.from(nodes),NX,NY,STRIDE,rw,rh,pw,front:snap.front.toDataURL(),back:snap.back.toDataURL(),software:layer.toDataURL()};},get snapshot(){return snap;},get software(){return !gpu;},gpuError(){return gpu?.error()||0;},dispose(){canvas.remove();releaseGPU(gpu);layer.width=shadow.width=1;tex={};idata=zbuffer=null;},get size(){return [snap.width,snap.height];}};
}
// At most two idle surfaces are retained. Active cards remain independent;
// repeated taps do not compile shaders, allocate a context, or read back pixels.
const gpuPool=[];
function acquireGPU(nx,ny,stride){
 while(gpuPool.length){const g=gpuPool.pop();if(!g.lost()){info.gpuReused=(info.gpuReused||0)+1;return g;}g.destroy();}
 const g=createGPU(nx,ny,stride);if(g)info.gpuCreated=(info.gpuCreated||0)+1;return g;
}
function releaseGPU(g){if(!g)return;if(g.lost()||gpuPool.length>=2)g.destroy();else gpuPool.push(g);}
function createGPU(NX,NY,stride){
 let gl,meshProgram,shadowProgram,vbo,ibo,quad,shadowFBO,shadowTexture,depth;
 const c=document.createElement('canvas'),textures=[],vertex=new Float32Array((NX+1)*(NY+1)*stride),textureSizes=[];
 let W=0,H=0,sw=0,sh=0;
 try{
  gl=c.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,depth:true,preserveDrawingBuffer:false});
  if(!gl)return null;
  c.addEventListener('webglcontextlost',e=>e.preventDefault());
  const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision?'highp':'mediump';
  const vary=`varying ${precision} vec2 vUV;varying ${precision} vec2 vShade;`;
  function program(vs,fs){function compile(t,src){const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(e);}return s;}
   const v=compile(gl.VERTEX_SHADER,vs),f=compile(gl.FRAGMENT_SHADER,fs),p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
  meshProgram=program(
   `attribute vec3 aPos;attribute vec2 aUV;attribute vec2 aShade;uniform vec2 uSize;uniform vec2 uTexture;uniform float uDepth;${vary}void main(){gl_Position=vec4(aPos.x/uSize.x*2.-1.,1.-aPos.y/uSize.y*2.,-aPos.z/uDepth,1.);vUV=(aUV+.5)/uTexture;vShade=aShade;}`,
   `precision ${precision} float;${vary}uniform sampler2D uFront;uniform sampler2D uBack;uniform float uShadow;void main(){vec4 color=gl_FrontFacing?texture2D(uFront,vUV):texture2D(uBack,vUV);if(color.a<.0196)discard;vec3 rgb=color.rgb*(gl_FrontFacing?vShade.x:vShade.y);gl_FragColor=vec4(mix(rgb,vec3(0.),uShadow)*color.a,color.a);}`);
  shadowProgram=program('attribute vec2 aQuad;varying mediump vec2 uv;void main(){uv=aQuad*.5+.5;gl_Position=vec4(aQuad,0.,1.);}',
   `precision mediump float;varying mediump vec2 uv;uniform sampler2D uMask;uniform vec2 uStep;uniform vec2 uOffset;void main(){vec2 p=uv+uOffset;float a=texture2D(uMask,p).a*4.;a+=2.*(texture2D(uMask,p+vec2(uStep.x,0.)).a+texture2D(uMask,p-vec2(uStep.x,0.)).a+texture2D(uMask,p+vec2(0.,uStep.y)).a+texture2D(uMask,p-vec2(0.,uStep.y)).a);a+=texture2D(uMask,p+uStep).a+texture2D(uMask,p-uStep).a+texture2D(uMask,p+vec2(uStep.x,-uStep.y)).a+texture2D(uMask,p+vec2(-uStep.x,uStep.y)).a;gl_FragColor=vec4(0.,0.,0.,a*(.45/16.));}`);
  const U=Object.fromEntries(['uSize','uTexture','uDepth','uFront','uBack','uShadow'].map(n=>[n,gl.getUniformLocation(meshProgram,n)]));
  const Q=Object.fromEntries(['uMask','uStep','uOffset'].map(n=>[n,gl.getUniformLocation(shadowProgram,n)]));
  const attrs=[['aPos',3,0],['aUV',2,3],['aShade',2,5]].map(([n,s,o])=>[gl.getAttribLocation(meshProgram,n),s,o]);
  const qa=gl.getAttribLocation(shadowProgram,'aQuad');
  vbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,vertex.byteLength,gl.DYNAMIC_DRAW);
  const indices=new Uint16Array(NX*NY*6);let k=0;
  for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){const a=j*(NX+1)+i,b=a+1,d=a+NX+1,e=d+1;indices[k++]=a;indices[k++]=d;indices[k++]=b;indices[k++]=b;indices[k++]=d;indices[k++]=e;}
  ibo=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
  quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  function texture(){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);for(const [p,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,p,v);return t;}
  for(let i=0;i<2;i++){gl.activeTexture(gl.TEXTURE0+i);textures.push(texture());}
  gl.activeTexture(gl.TEXTURE2);shadowTexture=texture();shadowFBO=gl.createFramebuffer();depth=gl.createRenderbuffer();
  gl.disable(gl.CULL_FACE);gl.depthFunc(gl.LEQUAL);gl.clearColor(0,0,0,0);
  function mesh(){gl.useProgram(meshProgram);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);for(const [a,s,o] of attrs){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,s,gl.FLOAT,false,stride*4,o*4);}gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);for(let i=0;i<2;i++){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);}}
  function destroy(){try{textures.forEach(t=>gl.deleteTexture(t));gl.deleteTexture(shadowTexture);gl.deleteFramebuffer(shadowFBO);gl.deleteRenderbuffer(depth);[vbo,ibo,quad].forEach(x=>gl.deleteBuffer(x));[meshProgram,shadowProgram].forEach(x=>gl.deleteProgram(x));gl.getExtension('WEBGL_lose_context')?.loseContext();}catch(_){}c.width=c.height=1;}
  return {canvas:c,lost:()=>gl.isContextLost(),destroy,
   load(front,back,w,h,pw,ratio){
    if(w>gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||h>gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))throw Error('Paper surface exceeds GPU limit');
    if(W!==w||H!==h){W=w;H=h;c.width=w;c.height=h;sw=Math.ceil(w/ratio);sh=Math.ceil(h/ratio);
     gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,shadowTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,sw,sh,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
     gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,sw,sh);
     gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFBO);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,shadowTexture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
     if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Paper shadow framebuffer incomplete');gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
    mesh();gl.uniform2f(U.uSize,w,h);gl.uniform1f(U.uDepth,pw);gl.uniform2f(U.uTexture,front.width,front.height);
    [front,back].forEach((im,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
     const key=im.width+'x'+im.height;if(textureSizes[i]===key)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,im);else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);textureSizes[i]=key;gl.uniform1i(i?U.uBack:U.uFront,i);});
   },
   draw(nodes,blur=1){
    if(gl.isContextLost())throw Error('Paper graphics context lost');
    mesh();vertex.set(nodes);gl.bufferSubData(gl.ARRAY_BUFFER,0,vertex);
    // Low resolution is used ONLY for a soft shadow. Text and artwork go
    // directly to the retina framebuffer; no per-frame Canvas2D readback.
    gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
    gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFBO);gl.viewport(0,0,sw,sh);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(U.uShadow,1);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,W,H);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.useProgram(shadowProgram);for(const [a] of attrs)gl.disableVertexAttribArray(a);
    gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(qa);gl.vertexAttribPointer(qa,2,gl.FLOAT,false,0,0);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,shadowTexture);gl.uniform1i(Q.uMask,2);gl.uniform2f(Q.uStep,blur/sw,blur/sh);gl.uniform2f(Q.uOffset,-1/sw,2/sh);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.disableVertexAttribArray(qa);
    mesh();gl.uniform1f(U.uShadow,0);gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
   },error:()=>gl.getError()
  };
 }catch(e){info.gpuError=e.message;try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch(_){}return null;}
}

function activeCard(job){return !job.cancelled&&job.isCurrent()&&jobs.get(job.card)===job;}
function clean(job,completed=false){
 if(job.cancelled)return;job.cancelled=true;
 job.surface?.dispose();job.surface=null;
 delete job.card.dataset.paperRoll;delete job.card.dataset.paperPress;job.card.removeAttribute('aria-busy');
 job.card.classList.remove('paper-fingerdown','paper-pressing','paper-sealing','reveal-prelude','just-revealed','just-concealed');
 job.button.disabled=false;job.button.removeAttribute('aria-disabled');
 if(jobs.get(job.card)===job)jobs.delete(job.card);
 if(completed){info.completed++;
  if(document.body.dataset.input==='keyboard'&&job.card.isConnected&&!document.querySelector('dialog[open]'))job.card.querySelector(job.action==='reveal'?'.close-button':'.reveal-button')?.focus({preventScroll:true});
 }else info.cancelled++;
 if(!jobs.size&&frame){cancelAnimationFrame(frame);frame=0;}
}
function cancelAll(){for(const job of [...jobs.values()])clean(job);}
function commitOnce(job){
 if(job.committed)return;job.committed=true;
 if(activeCard(job))job.commit();
}
async function changeTexture(job){
 if(job.switching||job.switched)return;
 job.switching=true;
 try{
  commitOnce(job);
  const deadline=performance.now()+2500;
  while(activeCard(job)&&!job.isApplied()){
   if(performance.now()>deadline)throw Error('Waiting for host confirmation');
   await nextFrame();
  }
  if(!activeCard(job))return;
  // fieldnotes.js performs text fitting once after the authoritative DOM update.
  await nextFrame();await nextFrame();
  if(!activeCard(job))return;
  const next=await timeout(capture(job.card),8000);
  if(!activeCard(job))return;
  job.surface.setSnapshot(next);job.surface.render(HOLD);job.switched=true;job.switching=false;
 }catch(e){
  if(!job.cancelled){info.lastError=e.message;info.fallbacks++;clean(job,true);}
 }
}
function visible(card){const r=card.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;}
function advance(job,now){
 if(!activeCard(job)){clean(job);return;}
 if(layoutChanged(job)){clean(job);return;}
 if(!job.surface||job.preparing)return;
 let t=Math.max(0,now-job.started-job.pause);
 if(t>=SWITCH&&!job.switching&&!job.switched)changeTexture(job);
 // Hold ONLY inside the fully wrapped pose until data/texture is ready.
 // Remote clients never animate a guessed local trait ahead of their host.
 if(t>HOLD&&!job.switched){job.pause+=t-HOLD;t=HOLD;}
 job.time=Math.min(DURATION,t);
 if(visible(job.card)){
  try{job.surface.render(job.time);}catch(e){
   info.lastError=e.message;
   if(!job.surface.software){
    const snap=job.surface.snapshot;job.surface.dispose();
    try{job.surface=createSurface(job.card,snap,true);job.surface.render(job.time);info.contextRecoveries=(info.contextRecoveries||0)+1;return;}catch(_){}
   }
   info.fallbacks++;commitOnce(job);clean(job,true);return;
  }
 }
 if(t>=DURATION&&job.switched)clean(job,true);
}
function tick(now){
 frame=0;
 for(const job of [...jobs.values()])advance(job,now);
 if(jobs.size)frame=requestAnimationFrame(tick);
}
function schedule(){if(!frame&&jobs.size)frame=requestAnimationFrame(tick);}
async function turn(options){
 const {card,button,isCurrent,commit}=options;
 if(jobs.has(card)||!isCurrent())return;
 if(reduced.matches||document.hidden){commit();return;}
 const job={...options,layoutWidth:card.offsetWidth,pixelRatio:devicePixelRatio||1,cancelled:false,committed:false,switching:false,switched:false,preparing:true,surface:null,started:0,pause:0,time:0};
 jobs.set(card,job);info.maxActive=Math.max(info.maxActive,jobs.size);
 card.dataset.paperPress='true';card.setAttribute('aria-busy','true');card.classList.remove('paper-fingerdown');button.setAttribute('aria-disabled','true');
 try{
  await timeout(window.ExorcistPaperSnapshot.warm(),8000);
  if(!activeCard(job)){clean(job);return;}
  const initial=await timeout(capture(card),8000);
  if(!activeCard(job)){clean(job);return;}
  button.disabled=true;job.surface=createSurface(card,initial);
  card.dataset.paperRoll='active';
  job.preparing=false;job.started=performance.now();schedule();
 }catch(e){
  if(!job.cancelled){info.lastError=e.message;info.fallbacks++;clean(job);if(typeof showToast==='function')showToast('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u0438\u0442\u044c \u0431\u0443\u043c\u0430\u0433\u0443. \u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u0435\u0449\u0451 \u0440\u0430\u0437.');}
 }
}
function validate(){for(const job of [...jobs.values()])if(!activeCard(job))clean(job);}
if(grid)new MutationObserver(validate).observe(grid,{childList:true,attributes:true,attributeFilter:['data-player-id']});
new MutationObserver(validate).observe(document.body,{attributes:true,attributeFilter:['data-screen']});
function layoutChanged(job){return Math.abs(job.card.offsetWidth-job.layoutWidth)>1||(devicePixelRatio||1)!==job.pixelRatio;}
function checkLayout(){for(const job of [...jobs.values()])if(layoutChanged(job))clean(job);}
// iOS may resize a layout before dispatching window.resize (rotation/viewport
// adjustments). Observe the actual grid too; address-bar height alone is safe.
window.addEventListener('resize',checkLayout,{passive:true});
if(grid&&typeof ResizeObserver==='function')new ResizeObserver(checkLayout).observe(grid);
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelAll();});
window.addEventListener('pagehide',()=>{cancelAll();while(gpuPool.length)gpuPool.pop().destroy();});
reduced.addEventListener?.('change',()=>{if(reduced.matches){for(const job of [...jobs.values()]){commitOnce(job);clean(job,true);}}});
// Actual idle preparation, scoped to the current visible player. Capture is
// keyed by state + layout; a new character never reuses the previous text.
let warmTimer=0;
function warmCards(){
 clearTimeout(warmTimer);
 warmTimer=setTimeout(async()=>{
  if(document.hidden||document.body.dataset.screen!=='game-screen')return;
  try{await window.ExorcistPaperSnapshot.warm();}catch(_){return;}
  for(const card of grid?.querySelectorAll('.trait')||[]){
   if(jobs.has(card)||!card.isConnected||!visible(card))continue;
   try{await capture(card);}catch(_){}
   await nextFrame();
  }
 },80);
}
if(grid)new MutationObserver(warmCards).observe(grid,{childList:true,subtree:true,characterData:true});
new MutationObserver(warmCards).observe(document.body,{attributes:true,attributeFilter:['data-screen']});
window.addEventListener('resize',warmCards,{passive:true});
window.addEventListener('pageshow',warmCards);
warmCards();
window.ExorcistPaper=Object.freeze({turn,cancelAll,inspect:()=>({version:'56.6.28',duration:DURATION,active:jobs.size,snapshot:window.ExorcistPaperSnapshot.inspect(),...info,jobs:[...jobs.values()].map(j=>({key:j.card.dataset.traitKey,action:j.action,preparing:j.preparing,time:j.time,switched:j.switched}))})});
// Optional harness hooks are absent in normal page loads and are not a UI.
if(window.__PAPER_ROLL_QA__){
 window.__PAPER_ROLL_QA__.capture=capture;
 window.__PAPER_ROLL_QA__.gpuErrors=()=>[...jobs.values()].map(j=>j.surface?.gpuError()||0);
 window.__PAPER_ROLL_QA__.geometry=(time,snapshot,software=true)=>{const c=document.createElement('article');const surface=createSurface(c,snapshot,software);const f=surface.fixture(time);surface.dispose();return f;};
 window.__PAPER_ROLL_QA__.fixture=(time,key='bio')=>{const job=[...jobs.values()].find(j=>j.card.dataset.traitKey===key);return job?.surface?.fixture(time);};
 window.__PAPER_ROLL_QA__.tracks=t=>({roll:rollTrack(t),angle:angleTrack(t),pre:preTrack(t),tail:tailTrack(t),tension:tensionTrack(t)});
 window.__PAPER_ROLL_QA__.seek=async function(time,key){
  if(frame){cancelAnimationFrame(frame);frame=0;}
  for(const job of [...jobs.values()]){
   if(key&&job.card.dataset.traitKey!==key)continue;
   if(!job.surface)continue;
   if(time>=SWITCH&&!job.switched){await changeTexture(job);}
   if(activeCard(job)){job.time=time;job.surface.render(time);job.started=performance.now()-time;}
  }
  if(frame){cancelAnimationFrame(frame);frame=0;}
 };
 window.__PAPER_ROLL_QA__.resume=schedule;
}
})();
