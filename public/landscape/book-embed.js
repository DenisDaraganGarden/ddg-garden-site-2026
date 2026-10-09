'use strict';
(() => {
  const frame=document.querySelector('#portfolio-book');
  const sheet=frame.closest('.sheet');
  const views=new Set(['cover','spread','face']);
  const faces=new Set(['left','right',null]);
  const phases=new Set(['idle','loading','dragging','animating','recovering','failed']);
  const languages=new Set(['ru','en']);
  let active=false;
  let activeSection=location.hash==='#portfolio';
  let intersecting=false;
  let bookState=null;

  const send=data=>frame.contentWindow?.postMessage(data,location.origin);
  const language=()=>send({type:'book-language',language:document.documentElement.lang});
  const hasParentModal=()=>Boolean(document.querySelector('dialog[open]'));
  const visible=()=>activeSection&&intersecting&&!document.hidden&&!hasParentModal();
  const syncVisibility=(force=false)=>{
    const next=visible();
    if(next&&!frame.hasAttribute('src')) frame.src=frame.dataset.src;
    if(next===active&&!force) return;
    active=next;
    send({type:'book-visibility',active});
  };
  const requestState=()=>send({type:'book-state-request',version:1});
  const pagerAvailable=()=>!bookState||(!bookState.overlay&&!bookState.busy);
  const decodeState=data=>{
    if(data?.type!=='book-state'||data.version!==1||!views.has(data.view)||!phases.has(data.phase)) return null;
    const fields=['ready','canNext','canPrevious','busy','active','overlay'];
    if(fields.some(field=>typeof data[field]!=='boolean')||!faces.has(data.face)||!Number.isInteger(data.totalOpenings)||data.totalOpenings<1||data.totalOpenings>1000||!Number.isInteger(data.opening)||data.opening<0||data.opening>=data.totalOpenings||!languages.has(data.language)) return null;
    return {version:1,ready:data.ready,view:data.view,opening:data.opening,face:data.face,canNext:data.canNext,canPrevious:data.canPrevious,busy:data.busy,active:data.active,overlay:data.overlay,phase:data.phase,language:data.language,totalOpenings:data.totalOpenings};
  };

  new IntersectionObserver(entries=>{
    const entry=entries.find(item=>item.target===sheet);
    if(!entry) return;
    intersecting=entry.isIntersecting&&entry.intersectionRatio>=.2;
    syncVisibility();
  },{threshold:.2}).observe(sheet);
  document.addEventListener('folio-sheet-change',event=>{
    activeSection=event.detail==='portfolio';
    syncVisibility();
  });
  document.addEventListener('visibilitychange',()=>syncVisibility());
  new MutationObserver(syncVisibility).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  frame.addEventListener('load',()=>{bookState=null;syncVisibility(true);language();requestState();});
  frame.addEventListener('pointerenter',()=>document.querySelector('.cursor-dot')?.classList.remove('is-visible'));
  new MutationObserver(language).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow) return;
    if(event.data?.type==='book-ready') {syncVisibility(true);language();requestState();return;}
    const state=decodeState(event.data);
    if(state) {
      bookState=state;
      frame.dispatchEvent(new CustomEvent('book-state',{detail:state}));
      document.dispatchEvent(new CustomEvent('book-state',{detail:state}));
      return;
    }
    if(event.data?.type==='book-wheel'&&active&&!hasParentModal()&&pagerAvailable()&&Number.isFinite(event.data.x)&&Number.isFinite(event.data.y)&&[0,1,2].includes(event.data.mode)) {
      document.querySelector('.folio').dispatchEvent(new WheelEvent('wheel',{deltaX:event.data.x,deltaY:event.data.y,deltaMode:event.data.mode,bubbles:true,cancelable:true}));
    }
    if(event.data?.type==='book-swipe'&&active&&!hasParentModal()&&pagerAvailable()&&[-1,1].includes(event.data.direction)) {
      document.querySelector('.folio').dispatchEvent(new WheelEvent('wheel',{deltaY:event.data.direction*120,bubbles:true,cancelable:true}));
    }
  });
  syncVisibility(true);
})();
