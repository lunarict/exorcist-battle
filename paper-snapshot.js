/* v56.6.28. Native, retina paper snapshots. No foreignObject, DOM clone, or
 * external renderer. Measure the live layout once, then paint the original
 * paper, atomic SVG artwork and native text into one texture. */
(() => {
'use strict';
const images=new Map(),cache=new WeakMap(),decorations=new Map(),baselines=new Map();
const stats={captures:0,hits:0,decoded:0,errors:0,lastMs:0};
const C=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;};
const split=s=>{let out=[],a=0,depth=0,quote='';for(let i=0;i<s.length;i++){const ch=s[i];if(quote){if(ch===quote&&s[i-1]!=='\\')quote='';}else if(ch==='"'||ch==="'")quote=ch;else if(ch==='(')depth++;else if(ch===')')depth--;else if(ch===','&&!depth){out.push(s.slice(a,i).trim());a=i+1;}}out.push(s.slice(a).trim());return out;};
const num=v=>parseFloat(v)||0;
const style=el=>{const cs=getComputedStyle(el),s={};for(const k of ['display','font','fontFamily','fontSize','fontStyle','fontWeight','fontStretch','fontKerning','fontVariantCaps','letterSpacing','color','opacity','textTransform','textShadow','mixBlendMode','backgroundImage','backgroundColor','backgroundSize','backgroundPosition','backgroundRepeat','backgroundOrigin','backgroundClip','borderTopWidth','borderTopColor','borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius','boxShadow','clipPath','transform','transformOrigin','width','height'])s[k]=cs[k];return s;};
function source(url){const key=url.split(/[?#]/)[0].split('/').pop();return window.ExorcistRollAssets?.[key]||url;}
function image(url){url=source(url);if(!images.has(url))images.set(url,new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{stats.decoded++;resolve(im);};im.onerror=()=>{images.delete(url);reject(Error('Paper image decode failed'));};im.src=url;}));return images.get(url);}
function font(s){return `${s.fontStyle||'normal'} ${s.fontWeight||'400'} ${s.fontSize} ${s.fontFamily}`;}
function textAscent(s){
 const key=font(s);if(baselines.has(key))return baselines.get(key);
 // WebKit and Chromium need not expose the same TextMetrics fields.
 // A zero-height inline box locates the real DOM baseline for this font.
 const span=document.createElement('span'),marker=document.createElement('i');
 span.style.cssText='all:initial;position:absolute;left:-10000px;top:0;display:inline-block;visibility:hidden;white-space:pre;pointer-events:none;';span.style.font=key;
 marker.style.cssText='all:initial;display:inline-block;width:0;height:0;vertical-align:baseline;';
 const text=document.createTextNode('Hg');span.append(text,marker);document.body.append(span);
 const range=document.createRange();range.selectNodeContents(text);
 const ascent=marker.getBoundingClientRect().top-range.getBoundingClientRect().top;span.remove();
 baselines.set(key,ascent);return ascent;
}
function box(el,root){const r=el.getBoundingClientRect(),s=style(el),w=num(s.width)||el.offsetWidth,h=num(s.height)||el.offsetHeight,m=new DOMMatrix(s.transform==='none'?undefined:s.transform),o=s.transformOrigin.split(' ').map(num),ox=o[0]||0,oy=o[1]||0;
 const pts=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>({x:m.a*(x-ox)+m.c*(y-oy)+m.e+ox,y:m.b*(x-ox)+m.d*(y-oy)+m.f+oy}));
 return {x:r.left-root.left-Math.min(...pts.map(p=>p.x)),y:r.top-root.top-Math.min(...pts.map(p=>p.y)),w,h,s,m:[m.a,m.b,m.c,m.d,m.e,m.f],ox,oy};}
function svgSource(svg){const n=svg.cloneNode(true),src=[svg,...svg.querySelectorAll('*')],dst=[n,...n.querySelectorAll('*')];
 // Only SVG presentation values. CSS width/height on path/rect/circle would
 // override their native geometry. Retain viewBox, transforms, ids and refs.
 const paint=['fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','stroke-dashoffset','stroke-opacity','opacity','color','paint-order'];
 src.forEach((e,i)=>{const s=getComputedStyle(e);dst[i].removeAttribute('class');dst[i].removeAttribute('style');for(const k of paint)dst[i].setAttribute(k,s.getPropertyValue(k));});
 n.setAttribute('xmlns','http://www.w3.org/2000/svg');n.setAttribute('width',Math.ceil(num(getComputedStyle(svg).width)*density()));n.setAttribute('height',Math.ceil(num(getComputedStyle(svg).height)*density()));
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(n));}
function measure(card){
 const saved=['transform','translate','rotate','scale','animation','transition'].map(k=>[k,card.style.getPropertyValue(k),card.style.getPropertyPriority(k)]);
 // No paint occurs between this synchronous measurement and restoration.
 // This removes ONLY the parent paper rotation; child rotations stay intact.
 for(const [k] of saved)card.style.setProperty(k,k==='scale'?'1':k==='translate'?'0 0':'none','important');
 try{
  const r=card.getBoundingClientRect(),cs=getComputedStyle(card);if(r.width<10||r.height<10)throw Error('Paper is not laid out');
  const bg=getComputedStyle(card,'::before').backgroundImage.match(/url\(["']?([^"')]+)/)?.[1];if(!bg)throw Error('Missing paper face');
  const result={width:r.width,height:r.height,pad:12,face:bg,text:[],parts:[]};
  const textEls=[card.querySelector('.trait-title > span:not(.trait-icon)'),card.querySelector('.trait-value .mystery-ink')||card.querySelector('.trait-value'),card.querySelector('.trait-meta'),card.querySelector('.close-button')].filter(Boolean);
  for(const el of textEls){const s=style(el);if(s.display==='none'||!el.textContent.trim())continue;
   const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),glyphs=[];let node;
   while(node=walker.nextNode()){
    const str=node.textContent,segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('ru',{granularity:'grapheme'}).segment(str)].map(x=>({text:x.segment,start:x.index})):Array.from(str).map((text,i,a)=>({text,start:a.slice(0,i).join('').length}));
    for(const seg of segments){const range=document.createRange();range.setStart(node,seg.start);range.setEnd(node,seg.start+seg.text.length);const b=range.getBoundingClientRect();if(!b.width&&!b.height)continue;glyphs.push({text:s.textTransform==='uppercase'?seg.text.toLocaleUpperCase('ru'):s.textTransform==='lowercase'?seg.text.toLocaleLowerCase('ru'):seg.text,x:b.left-r.left,y:b.top-r.top,h:b.height});}
   }
   result.text.push({s,glyphs,ascent:textAscent(s)});
   if(el.matches('.close-button')){const b=box(el,r);if(num(s.borderTopWidth)>0||s.backgroundColor!=='rgba(0, 0, 0, 0)'||s.backgroundImage!=='none')result.parts.push({...b,type:'button'});}
  }
  for(const sel of ['.trait-icon','.paper-tape']){const el=card.querySelector(sel);if(!el||getComputedStyle(el).display==='none')continue;const b=box(el,r),svg=el.querySelector('svg');if(svg){b.svg=svgSource(svg);b.svgW=num(getComputedStyle(svg).width);b.svgH=num(getComputedStyle(svg).height);}result.parts.push({...b,type:sel});}
  return result;
 }finally{for(const [k,v,p] of saved){if(v)card.style.setProperty(k,v,p);else card.style.removeProperty(k);}}
}
function radius(s,w,h){const val=s.borderTopLeftRadius;return val.endsWith('%')?num(val)*Math.min(w,h)/100:Math.min(num(val),w/2,h/2);}
function shape(ctx,w,h,s,inset=0){ctx.beginPath();const r=Math.max(0,radius(s,w,h)-inset);if(ctx.roundRect)ctx.roundRect(inset,inset,Math.max(.1,w-2*inset),Math.max(.1,h-2*inset),r);else ctx.rect(inset,inset,w-2*inset,h-2*inset);}
function clip(ctx,w,h,s){if(s.clipPath?.startsWith('polygon(')){const pts=split(s.clipPath.slice(8,-1));ctx.beginPath();pts.forEach((p,i)=>{const a=p.trim().split(/\s+/),x=a[0].includes('%')?num(a[0])*w/100:num(a[0]),y=a[1].includes('%')?num(a[1])*h/100:num(a[1]);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.clip();}else{shape(ctx,w,h,s);ctx.clip();}}
function shadowList(s){if(!s||s==='none')return [];return split(s).map(x=>{const color=x.match(/rgba?\([^)]*\)|#[\da-f]+/i)?.[0]||'#000';const ns=x.replace(color,'').replace('inset','').trim().split(/\s+/).map(num);return {color,x:ns[0]||0,y:ns[1]||0,blur:ns[2]||0,spread:ns[3]||0,inset:x.includes('inset')};});}
async function background(ctx,w,h,s){const layers=split(s.backgroundImage||'none'),sizes=split(s.backgroundSize||'auto'),poses=split(s.backgroundPosition||'0% 0%');
 ctx.fillStyle=s.backgroundColor||'transparent';ctx.fillRect(0,0,w,h);
 for(let i=layers.length-1;i>=0;i--){const l=layers[i];if(l==='none')continue;
  if(l.startsWith('url(')){const url=l.slice(4,-1).replace(/^["']|["']$/g,''),im=await image(url),sz=(sizes[i%sizes.length]||'auto').split(' '),pos=(poses[i%poses.length]||'50% 50%').split(' ');let iw,ih;
   if(sz[0]==='cover'||sz[0]==='contain'){const factor=(sz[0]==='cover'?Math.max:Math.min)(w/im.naturalWidth,h/im.naturalHeight);iw=im.naturalWidth*factor;ih=im.naturalHeight*factor;}
   else{iw=sz[0]==='auto'?im.naturalWidth:sz[0].includes('%')?w*num(sz[0])/100:num(sz[0]);ih=!sz[1]||sz[1]==='auto'?iw*im.naturalHeight/im.naturalWidth:sz[1].includes('%')?h*num(sz[1])/100:num(sz[1]);}
   if(!iw||!ih)continue;let x=pos[0].includes('%')?(w-iw)*num(pos[0])/100:num(pos[0]),y=(pos[1]||'50%').includes('%')?(h-ih)*num(pos[1]||'50%')/100:num(pos[1]);
   // Both decorations use small tiled source textures, paper uses drawImage.
   const repeat=!s.backgroundRepeat?.includes('no-repeat');if(repeat){while(x>0)x-=iw;while(y>0)y-=ih;for(let yy=y;yy<h;yy+=ih)for(let xx=x;xx<w;xx+=iw)ctx.drawImage(im,xx,yy,iw,ih);}else ctx.drawImage(im,x,y,iw,ih);
  }else if(l.startsWith('linear-gradient(')){let a=split(l.slice(16,-1)),angle=180;if(a[0].includes('deg'))angle=num(a.shift());const dx=Math.sin(angle*Math.PI/180),dy=-Math.cos(angle*Math.PI/180),len=Math.abs(w*dx)+Math.abs(h*dy),g=ctx.createLinearGradient(w/2-dx*len/2,h/2-dy*len/2,w/2+dx*len/2,h/2+dy*len/2);a.forEach((st,j)=>{const m=st.match(/^(.*?)(?:\s+([\d.]+)%)?$/);g.addColorStop(m[2]?num(m[2])/100:j/Math.max(1,a.length-1),m[1]);});ctx.fillStyle=g;ctx.fillRect(0,0,w,h);}
 }
}
async function decoration(b,res){const key=JSON.stringify([b.w,b.h,b.s,b.svg,res]);if(decorations.has(key))return decorations.get(key);
 const promise=(async()=>{const pad=8,c=C((b.w+pad*2)*res,(b.h+pad*2)*res),ctx=c.getContext('2d');ctx.setTransform(res,0,0,res,pad*res,pad*res);
  const shadows=shadowList(b.s.boxShadow);
  for(const v of shadows.slice().reverse().filter(v=>!v.inset)){ctx.save();ctx.shadowColor=v.color;ctx.shadowOffsetX=v.x*res;ctx.shadowOffsetY=v.y*res;ctx.shadowBlur=v.blur*res;shape(ctx,b.w,b.h,b.s,-v.spread);ctx.fillStyle=v.color;ctx.fill();ctx.restore();}
  ctx.save();clip(ctx,b.w,b.h,b.s);await background(ctx,b.w,b.h,b.s);
  for(const v of shadows.slice().reverse().filter(v=>v.inset)){ctx.save();ctx.shadowColor=v.color;ctx.shadowOffsetX=v.x*res;ctx.shadowOffsetY=v.y*res;ctx.shadowBlur=v.blur*res;ctx.fillStyle=v.color;ctx.beginPath();ctx.rect(-100,-100,b.w+200,b.h+200);if(ctx.roundRect)ctx.roundRect(v.spread,v.spread,Math.max(1,b.w-2*v.spread),Math.max(1,b.h-2*v.spread),Math.max(0,radius(b.s,b.w,b.h)-v.spread));else ctx.rect(v.spread,v.spread,b.w-2*v.spread,b.h-2*v.spread);ctx.fill('evenodd');ctx.restore();}
  ctx.restore();const border=num(b.s.borderTopWidth);if(border){shape(ctx,b.w,b.h,b.s,border/2);ctx.lineWidth=border;ctx.strokeStyle=b.s.borderTopColor;ctx.stroke();}
  if(b.svg){const im=await image(b.svg);ctx.save();ctx.shadowColor='rgba(0,0,0,.6)';ctx.shadowOffsetY=res;ctx.drawImage(im,(b.w-b.svgW)/2,(b.h-b.svgH)/2,b.svgW,b.svgH);ctx.restore();}
  return {canvas:c,pad};})();decorations.set(key,promise);if(decorations.size>40)decorations.delete(decorations.keys().next().value);promise.catch(()=>decorations.delete(key));return promise;
}
async function paint(d,res){const W=d.width+2*d.pad,H=d.height+2*d.pad,back=C(W*res,H*res),bc=back.getContext('2d'),front=C(W*res,H*res),ctx=front.getContext('2d');
 const face=await image(d.face);bc.setTransform(res,0,0,res,d.pad*res,d.pad*res);bc.drawImage(face,0,0,d.width,d.height);ctx.drawImage(back,0,0);ctx.setTransform(res,0,0,res,d.pad*res,d.pad*res);
 for(const b of d.parts){const deco=await decoration(b,res);ctx.save();ctx.globalAlpha=num(b.s.opacity);ctx.translate(b.x+b.ox,b.y+b.oy);ctx.transform(...b.m);ctx.translate(-b.ox,-b.oy);ctx.drawImage(deco.canvas,-deco.pad,-deco.pad,b.w+deco.pad*2,b.h+deco.pad*2);ctx.restore();}
 for(const run of d.text){ctx.save();ctx.font=font(run.s);ctx.textBaseline='alphabetic';ctx.fillStyle=run.s.color;ctx.globalAlpha=num(run.s.opacity);if(run.s.mixBlendMode==='multiply')ctx.globalCompositeOperation='multiply';const ascent=run.ascent;
  // Native glyph positions preserve wrapping, letterspacing and fitted sizes.
  // Text stays live DOM when idle; this texture exists only during the roll.
  for(const g of run.glyphs)ctx.fillText(g.text,g.x,g.y+ascent);ctx.restore();}
 return {front,back,width:d.width,height:d.height,W,H,pad:d.pad,res};
}
function density(){return Math.min(3,Math.max(1,window.devicePixelRatio||1));}
async function capture(card){const fitted=card.querySelector('.trait-value'),type=getComputedStyle(fitted||card),key=[card.dataset.stateSignature,card.offsetWidth,card.offsetHeight,density(),type.fontSize,type.lineHeight,type.letterSpacing,document.fonts?.status].join('|'),old=cache.get(card);if(old?.key===key){stats.hits++;return old.promise;}
 const d=measure(card),start=performance.now();const promise=paint(d,density()).then(s=>{stats.captures++;stats.lastMs=performance.now()-start;return s;}).catch(e=>{stats.errors++;if(cache.get(card)?.promise===promise)cache.delete(card);throw e;});cache.set(card,{key,promise});return promise;}
let warmPromise;
function warm(){if(!warmPromise)warmPromise=Promise.all(Array.from({length:6},(_,i)=>image('assets/paper-face-'+(i+1)+'.webp'))).then(()=>document.fonts?.ready).catch(e=>{warmPromise=null;throw e;});return warmPromise;}
window.ExorcistPaperSnapshot=Object.freeze({capture,warm,density,inspect:()=>({...stats,images:images.size,decorations:decorations.size})});
void warm().catch(()=>{});
})();
