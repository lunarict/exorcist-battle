/* 56.6.7 - bound-page navigation. Presentation only; content is committed once.
 * One viewport-sized, inert outgoing leaf; no duplicated screens, timers,
 * animated layout heights, or continuously running rendering loop.
 */
(() => {
  'use strict';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const jobs = new Map();
  const ease = 'cubic-bezier(.24,.72,.24,1)';

  function cleanup(page, job) {
    job.animations.forEach(a => a.cancel());
    job.stage.remove();
    job.viewport.removeEventListener('scroll', job.onScroll);
    if (jobs.get(page) === job) {
      jobs.delete(page);
      delete page.dataset.leafTurning;
    }
  }
  function cancel(page) {
    const job = jobs.get(page);
    if (job) cleanup(page, job);
  }
  function cancelIn(root) {
    for (const [page] of jobs) if (root.contains(page)) cancel(page);
  }
  function settled() { for (const [page] of jobs) cancel(page); }

  function snapshot(page, viewport) {
    const r = page.getBoundingClientRect(), v = viewport.getBoundingClientRect();
    const x = Math.max(r.left, v.left), y = Math.max(r.top, v.top);
    const right = Math.min(r.right, v.right), bottom = Math.min(r.bottom, v.bottom);
    if (right-x < 20 || bottom-y < 20) return null;
    const copy = page.cloneNode(true);
    for (const node of [copy, ...copy.querySelectorAll('*')]) {
      node.removeAttribute('id');
      node.removeAttribute('autofocus');
      node.removeAttribute('aria-live');
      node.removeAttribute('aria-busy');
    }
    copy.classList.add('bound-snapshot');
    const paint=getComputedStyle(page);
    // Freeze the outgoing suit. The live cover/tabs may already use the new ink.
    for(const property of ['--f-ink','--f-ink-soft','--book-accent','--suit-rgb'])
      copy.style.setProperty(property,paint.getPropertyValue(property));
    copy.removeAttribute('data-leaf-turning');
    const innerScroll = page === viewport ? viewport.scrollTop : 0;
    Object.assign(copy.style, {
      position:'absolute', left:`${r.left-x}px`, top:`${r.top-y-innerScroll}px`,
      width:`${r.width}px`, height:`${page===viewport ? page.scrollHeight : r.height}px`,
      minHeight:'0', maxHeight:'none', margin:'0', overflow:'visible',
      flex:'none', transform:'none', translate:'none', rotate:'none', scale:'none'
    });
    return {copy,x,y,width:right-x,height:bottom-y};
  }
  function turn(page, viewport, commit, direction = 1) {
    if (!page || !viewport || typeof commit !== 'function') return;
    cancel(page);
    const dialog=page.closest('dialog');
    if (reduced.matches || document.hidden || !page.animate || !dialog?.open ||
        dialog.dataset.motion === 'opening' || page.hidden) {
      commit(); return;
    }
    const shot=snapshot(page,viewport);
    if(!shot){commit();return;}
    const host=viewport.closest('.entity-leaves') || viewport.closest('.rules-layout') || viewport.parentElement;
    const rect=host.getBoundingClientRect();
    const stage=document.createElement('div');
    stage.className='bound-turn-stage';
    stage.setAttribute('aria-hidden','true'); stage.inert=true;
    stage.dataset.direction=direction<0?'previous':'next';
    Object.assign(stage.style,{
      left:`${shot.x-rect.left}px`,top:`${shot.y-rect.top}px`,
      width:`${shot.width}px`,height:`${shot.height}px`
    });
    const shadow=document.createElement('div');shadow.className='bound-turn-shadow';
    const leaf=document.createElement('div');leaf.className='bound-turn-leaf';
    const front=document.createElement('div');front.className='bound-turn-front';front.append(shot.copy);
    const back=document.createElement('div');back.className='bound-turn-back';
    const light=document.createElement('div');light.className='bound-turn-light';
    leaf.append(front,back,light);stage.append(shadow,leaf);host.append(stage);
    const job={stage,viewport,animations:[],onScroll:null};
    jobs.set(page,job);page.dataset.leafTurning='true';
    try { commit(); } catch(error) { cleanup(page,job); throw error; }
    // Both the bestiary and the rulebook use the same SINGLE bound folio, not a 3D door. Its translucent
    // curled edge travels across the sheet while printed text stays at its
    // real size. This avoids the stretched/cropped type from rotateY(102deg).
    if (page.id === 'entity-detail' || page.id === 'rules-paper') {
      const duration = 560;
      const forward = direction >= 0;
      const easeFolio = 'cubic-bezier(.52,.03,.25,1)';
      const add = (el,frames,options) => {
        const a=el.animate(frames,options);job.animations.push(a);
        a.finished.catch(()=>{});return a;
      };
      stage.classList.add('grimoire-peel-stage');
      leaf.classList.add('grimoire-peel-leaf');
      const crease=document.createElement('div');
      crease.className='grimoire-crease';
      stage.append(crease);
      // Edge line bends a few pixels, like a thick sheet lifted by hand;
      // the rasterised DOM is clipped, never transformed or reflowed.
      const mask = (percentage,curve=0) => forward
        ? `polygon(0 0,${percentage}% 0,${percentage-curve}% 30%,${percentage+curve*.46}% 68%,${percentage}% 100%,0 100%)`
        : `polygon(${percentage}% 0,100% 0,100% 100%,${percentage}% 100%,${percentage-curve*.46}% 68%,${percentage+curve}% 30%)`;
      const move = p => shot.width * p / 100 - 17;
      const path=forward ? [100,94,57,18,0] : [0,6,43,82,100];
      const offsets=[0,.15,.49,.82,1];
      try {
        const keyframes=path.map((p,i)=>({clipPath:mask(p,i===0||i===4?0:i===2?3.0:1.4),offset:offsets[i]}));
        const main=add(leaf,keyframes,{duration,easing:easeFolio,fill:'forwards'});
        const travel=path.map((p,i)=>({transform:`translateX(${move(p)}px)`,
          opacity:i===0||i===4?0:i===1?.28:i===2?.44:.22,offset:offsets[i]}));
        add(shadow,travel,{duration,easing:easeFolio,fill:'forwards'});
        add(crease,travel.map(f=>({...f,opacity:f.opacity*.85})),
          {duration,easing:easeFolio,fill:'forwards'});
        main.finished.catch(()=>{}).then(()=>{if(jobs.get(page)===job)cleanup(page,job);});
        const top=viewport.scrollTop;
        job.onScroll=()=>{if(Math.abs(viewport.scrollTop-top)>2)cancel(page);};
        viewport.addEventListener('scroll',job.onScroll,{passive:true});
      } catch (_) {cleanup(page,job);}
      return;
    }
    // A selected bookmark immediately changes the live page under the old leaf.
    // Only this visible slice rotates, so very long chapters never animate their height.
    // Moving the free edge AWAY from the viewer is crucial: the old
    // direction brought it towards the camera and enlarged/cropped text.
    const sign=direction<0?-1:1;
    const duration = 470;
    const add=(el,frames,options)=>{
      const a=el.animate(frames,options);job.animations.push(a);
      a.finished.catch(()=>{});return a;
    };
    try {
      const main=add(leaf,[
        {transform:'rotateY(0deg)',offset:0},
        {transform:`rotateY(${sign*5}deg)`,offset:.16},
        {transform:`rotateY(${sign*42}deg)`,offset:.53},
        {transform:`rotateY(${sign*75}deg)`,offset:.81},
        {transform:`rotateY(${sign*89}deg)`,offset:1}
      ],{duration,easing:ease,fill:'forwards'});
      add(leaf,[{opacity:1,offset:0},{opacity:1,offset:.68},{opacity:.85,offset:.86},{opacity:0,offset:1}],{duration,easing:'linear',fill:'forwards'});
      add(shadow,[
        {opacity:0,transform:'scaleX(.94)'},
        {opacity:.17,transform:'scaleX(.76)',offset:.24},
        {opacity:.28,transform:'scaleX(.43)',offset:.63},
        {opacity:0,transform:'scaleX(.10)'}
      ],{duration,easing:ease,fill:'forwards'});
      add(light,[{opacity:0},{opacity:.10,offset:.58},{opacity:.16,offset:.82},{opacity:0}],{duration,easing:ease,fill:'forwards'});
      main.finished.catch(()=>{}).then(()=>{if(jobs.get(page)===job)cleanup(page,job);});
      const top=viewport.scrollTop;
      job.onScroll=()=>{if(Math.abs(viewport.scrollTop-top)>2)cancel(page);};
      viewport.addEventListener('scroll',job.onScroll,{passive:true});
    } catch (_) {cleanup(page,job);}
  }
  window.ExorcistBinding=Object.freeze({turn,cancel,cancelIn});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)settled();});
  window.addEventListener('pagehide',settled);
  reduced.addEventListener?.('change',()=>{if(reduced.matches)settled();});
  let width=document.documentElement.clientWidth;
  window.addEventListener('resize',()=>{
    const next=document.documentElement.clientWidth;
    if(next!==width){width=next;settled();}
  },{passive:true});
})();
