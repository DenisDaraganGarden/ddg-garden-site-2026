'use strict';
(() => {
  const frame=document.querySelector('#portfolio-book');
  const sheet=frame.closest('.sheet');
  const root=document.documentElement;
  const handset=matchMedia('(pointer: coarse) and (max-width: 600px), (pointer: coarse) and (max-height: 600px)');
  const entry=sheet.querySelector('.book-entry');
  const entryTitle=entry.querySelector('[data-book-entry-title]');
  const entryHint=entry.querySelector('[data-book-entry-hint]');
  const exit=sheet.querySelector('.book-exit');
  const views=new Set(['cover','spread','face']);
  const faces=new Set(['left','right',null]);
  const phases=new Set(['idle','loading','dragging','animating','recovering','failed']);
  const languages=new Set(['ru','en']);
  let active=false;
  let activeSection=location.hash==='#portfolio';
  let intersecting=false;
  let bookState=null;
  let engaged=false, reading=false, sessionStarted=false, presentationKey='';

  const send=data=>frame.contentWindow?.postMessage(data,location.origin);
  const language=()=>{send({type:'book-language',language:root.lang});syncEntry();};
  const hasParentModal=()=>Boolean(document.querySelector('dialog[open]'));
  const visible=()=>activeSection&&(intersecting||reading)&&!document.hidden&&!hasParentModal();
  const syncVisibility=(force=false)=>{
    const next=visible();
    if(next&&!frame.hasAttribute('src')) frame.src=frame.dataset.src;
    if(next===active&&!force) return;
    active=next;
    send({type:'book-visibility',active});
  };
  const requestState=()=>send({type:'book-state-request',version:1});
  const landscape=()=>innerWidth>innerHeight;
  function syncEntry() {
    const en=root.lang==='en', portrait=!landscape();
    entry.hidden=!handset.matches||reading;
    entryTitle.textContent=engaged&&portrait ? (en?'Rotate your phone':'Поверните телефон') : (en?'Open portfolio':'Открыть портфолио');
    entryHint.textContent=portrait ? (engaged ? (en?'The portfolio will open in landscape':'Портфолио откроется в горизонтальном положении') : (en?'Best viewed with your phone in landscape':'Для просмотра поверните телефон горизонтально')) : '';
    entry.setAttribute('aria-label',`${entryTitle.textContent}. ${entryHint.textContent}`);
    entry.setAttribute('aria-pressed',String(engaged));
    exit.hidden=!handset.matches||!engaged;
    exit.setAttribute('aria-label',en?'Close portfolio':'Закрыть портфолио');
    frame.inert=handset.matches&&!reading;
    sheet.classList.toggle('book-preview',handset.matches&&!reading);
  }
  function syncPresentation(force=false) {
    const next=handset.matches&&engaged&&activeSection&&landscape();
    if(next!==reading) {
      reading=next;
      root.classList.toggle('book-reading',reading);
      if(!reading&&document.fullscreenElement===sheet)document.exitFullscreen().catch(()=>{});
      // The parent pager restores the section after updating its viewport.
      document.dispatchEvent(new CustomEvent('book-reading-change',{detail:reading}));
    }
    syncEntry();
    const mode=handset.matches?(reading?'reading':'preview'):'default';
    const key=`${mode}:${sessionStarted}`;
    if(force||key!==presentationKey) {
      const open=reading&&!sessionStarted;
      send({type:'book-presentation',mode,open});
      if(reading&&bookState?.ready) sessionStarted=true;
      presentationKey=`${mode}:${sessionStarted}`;
    }
    syncVisibility();
  }
  function leaveReader(focus=true) {
    engaged=false;sessionStarted=false;
    if(document.fullscreenElement===sheet)document.exitFullscreen().catch(()=>{});
    syncPresentation();
    if(focus&&handset.matches&&activeSection) entry.focus({preventScroll:true});
  }
  entry.addEventListener('click',()=>{
    engaged=true;
    if(landscape()&&document.fullscreenEnabled&&sheet.requestFullscreen)
      sheet.requestFullscreen({navigationUI:'hide'}).catch(()=>{});
    syncPresentation();
  });
  exit.addEventListener('click',()=>leaveReader());
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&reading&&engaged)leaveReader(false);});
  document.addEventListener('folio-leave-book',()=>leaveReader(false));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&engaged&&!hasParentModal()) {event.preventDefault();leaveReader();}
  });
  let resizeFrame;
  const queuePresentation=()=>{
    cancelAnimationFrame(resizeFrame);
    resizeFrame=requestAnimationFrame(()=>syncPresentation());
  };
  addEventListener('resize',queuePresentation,{passive:true});
  handset.addEventListener('change',queuePresentation);
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
    if(!activeSection&&engaged) leaveReader(false);
    syncVisibility();
  });
  document.addEventListener('visibilitychange',()=>syncVisibility());
  new MutationObserver(syncVisibility).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  frame.addEventListener('load',()=>{bookState=null;syncVisibility(true);syncPresentation(true);language();requestState();});
  frame.addEventListener('pointerenter',()=>document.querySelector('.cursor-dot')?.classList.remove('is-visible'));
  new MutationObserver(language).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow) return;
    if(event.data?.type==='book-ready') {syncVisibility(true);syncPresentation(true);language();requestState();return;}
    if(event.data?.type==='book-exit'&&reading) {leaveReader();return;}
    const state=decodeState(event.data);
    if(state) {
      const becameReady=state.ready&&!bookState?.ready;
      bookState=state;
      if(becameReady) syncPresentation(true);
      frame.dispatchEvent(new CustomEvent('book-state',{detail:state}));
      document.dispatchEvent(new CustomEvent('book-state',{detail:state}));
      return;
    }
    if(event.data?.type==='book-wheel'&&!reading&&active&&!hasParentModal()&&pagerAvailable()&&Number.isFinite(event.data.x)&&Number.isFinite(event.data.y)&&[0,1,2].includes(event.data.mode)) {
      document.querySelector('.folio').dispatchEvent(new WheelEvent('wheel',{deltaX:event.data.x,deltaY:event.data.y,deltaMode:event.data.mode,bubbles:true,cancelable:true}));
    }
    if(event.data?.type==='book-swipe'&&!reading&&active&&!hasParentModal()&&pagerAvailable()&&[-1,1].includes(event.data.direction)) {
      document.querySelector('.folio').dispatchEvent(new WheelEvent('wheel',{deltaY:event.data.direction*120,bubbles:true,cancelable:true}));
    }
  });
  syncPresentation(true);
  // The initial screen waits for a rendered book, including non-book entry URLs.
  if(!frame.hasAttribute('src'))frame.src=frame.dataset.src;
})();
