/* v56.6.25: data-only generator; no DOM, animation or network changes.
 * A single draw identity is shared by gender forms and duplicate phrases.
 * History persists on this device; private browsing/storage failure falls back to RAM.
 */
(function(root){
  'use strict';
  const KEYS=['health','job','hobby','love','secret'];
  const norm=s=>String(s||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
  function ageText(age){
    const last=age%10, teen=age%100;
    return `${age} ${teen>=11&&teen<=14?'лет':last===1?'год':last>=2&&last<=4?'года':'лет'}`;
  }
  function create({data,randomIndex,storage=null,funnyNames=[]}){
    if(!data||!data.config||typeof randomIndex!=='function') throw new TypeError('Invalid trait generator configuration');
    const config=data.config;
    const pools=new Map(), lookup={};
    for(const key of KEYS){
      const groups=new Map();lookup[key]=new Map();
      for(const entry of data.traits[key]){
        if(!groups.has(entry.group))groups.set(entry.group,[]);
        groups.get(entry.group).push(entry);
        for(const text of [...entry.male,...entry.female,...(entry.original?[entry.original]:[])])lookup[key].set(norm(text),entry.group);
      }
      pools.set(key,groups);
    }
    const poolIds={};
    for(const [key,groups] of pools)poolIds[key]=Array.from(groups.keys());
    poolIds.special=data.specials.map(p=>p.id);
    poolIds.funny=funnyNames.map((_,i)=>'funny-'+i);
    const history={schema:config.version,remaining:{},recent:{}};
    const limits={};
    for(const key of Object.keys(poolIds)){
      limits[key]=key==='special'?5:key==='funny'?4:config.cooldown;
      history.remaining[key]=poolIds[key].slice();history.recent[key]=[];
    }
    try{
      const raw=storage?.getItem(config.historyKey);
      const saved=raw&&raw.length<100000?JSON.parse(raw):null;
      if(saved?.schema===config.version){
        for(const key of Object.keys(poolIds)){
          const valid=new Set(poolIds[key]);
          const sanitize=a=>Array.from(new Set(a.filter(x=>typeof x==='string'&&valid.has(x))));
          if(Array.isArray(saved.remaining?.[key]))history.remaining[key]=sanitize(saved.remaining[key]);
          if(Array.isArray(saved.recent?.[key]))history.recent[key]=sanitize(saved.recent[key]).slice(-limits[key]);
        }
      }
    }catch(_){/* Malformed/disabled storage must not prevent a game from starting. */}
    function pick(a){if(!a.length)return null;return a[randomIndex(a.length)];}
    function weighted(entries){
      const total=entries.reduce((sum,e)=>sum+e.weight,0);
      let n=randomIndex(total);
      for(const e of entries){if(n<e.weight)return e;n-=e.weight;}
      return entries[entries.length-1];
    }
    function identity(){
      const band=weighted(config.ageBands);
      const age=band.min+randomIndex(band.max-band.min+1);
      const type=weighted(config.types);
      const nameSex=type.nameSex||(randomIndex(2)===0?'male':'female');
      return {age,type:type.value,nameSex,details:`${ageText(age)}, ${type.value}`};
    }
    function record(key,id){
      if(!poolIds[key]?.includes(id))return;
      history.remaining[key]=history.remaining[key].filter(x=>x!==id);
      const recent=history.recent[key];
      history.recent[key]=recent.filter(x=>x!==id).concat(id).slice(-limits[key]);
    }
    function drawId(key,allowed,blocked=new Set()){
      const allowedSet=new Set(allowed.filter(x=>!blocked.has(x)));
      if(!allowedSet.size)return null;
      let candidates=history.remaining[key].filter(x=>allowedSet.has(x));
      if(!candidates.length){
        // Keep currently ineligible entries (e.g. the male-only entry), refill the exhausted domain.
        const pending=new Set(history.remaining[key]);
        for(const id of poolIds[key])pending.add(id);
        history.remaining[key]=Array.from(pending);
        candidates=history.remaining[key].filter(x=>allowedSet.has(x));
      }
      const recent=new Set(history.recent[key]);
      const fresh=candidates.filter(x=>!recent.has(x));
      // Finite, bounded fallback if a caller excludes almost the entire pool.
      const id=pick(fresh.length?fresh:candidates);
      if(id!==null)record(key,id);
      return id;
    }
    function round(){return {used:Object.fromEntries(KEYS.map(k=>[k,new Set()])),specials:new Set()};}
    function trait(key,sex,context=round()){
      if(!KEYS.includes(key)||(sex!=='male'&&sex!=='female'))throw new TypeError('Unknown trait key or grammatical sex');
      const groups=pools.get(key);
      const allowed=Array.from(groups).filter(([,es])=>es.some(e=>e[sex].length)).map(([id])=>id);
      const id=drawId(key,allowed,context.used[key]);
      if(id===null)throw new RangeError('No unused trait available for this round');
      context.used[key].add(id);
      const forms=Array.from(new Set(groups.get(id).flatMap(e=>e[sex])));
      return {id,value:pick(forms)};
    }
    function groupForValue(key,value){return lookup[key]?.get(norm(value))||null;}
    function rememberPlayers(players){
      for(const player of players||[]){
        for(const key of KEYS){
          const id=groupForValue(key,player?.character?.traits?.[key]?.value);
          if(id)record(key,id);
        }
        const bio=player?.character?.traits?.bio?.value;
        if(typeof bio!=='string')continue;
        const p=data.specials.find(p=>p.bio===bio);
        if(p)record('special',p.id);
        const name=bio.split(/\s*·\s*/)[0];
        const fi=funnyNames.findIndex(n=>n.name===name);
        if(fi>=0)record('funny','funny-'+fi);
      }
    }
    function availableSpecials(profiles,context){
      return profiles.filter(p=>KEYS.every(key=>{
        const id=groupForValue(key,p[key]);
        return !id||(!context.used[key].has(id)&&!history.recent[key].includes(id));
      }));
    }
    function special(profiles,context=round()){
      const eligible=availableSpecials(profiles,context);
      const id=drawId('special',eligible.map(p=>p.id),context.specials);
      if(!id)return null;
      const selected=eligible.find(p=>p.id===id);context.specials.add(id);
      for(const key of KEYS){
        const group=groupForValue(key,selected[key]);
        if(group){context.used[key].add(group);record(key,group);}
      }
      return selected;
    }
    function funny(sex,usedNames=new Set()){
      const allowed=funnyNames.flatMap((n,i)=>n.sex===sex&&!usedNames.has(n.name)?['funny-'+i]:[]);
      const id=drawId('funny',allowed);
      return id?funnyNames[Number(id.slice(6))].name:null;
    }
    function save(){try{storage?.setItem(config.historyKey,JSON.stringify(history));return Boolean(storage);}catch(_){return false;}}
    function snapshot(){return JSON.parse(JSON.stringify(history));}
    return {identity,trait,round,special,funny,save,rememberPlayers,groupForValue,snapshot,config,ageText};
  }
  const api={create,ageText};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ExorcistTraitGenerator=api;
})(typeof globalThis!=='undefined'?globalThis:this);