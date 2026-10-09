'use strict';
(() => {
  const frame=document.querySelector('#portfolio-book');
  const sheet=frame.closest('.sheet');
  let active=false;
  const send=data=>frame.contentWindow?.postMessage(data,location.origin);
  const language=()=>send({type:'book-language',language:document.documentElement.lang});
  const setActive=value=>{
    active=value;
    if(active&&!frame.hasAttribute('src')) frame.src=frame.dataset.src;
    send({type:'book-visibility',active});
  };
  new IntersectionObserver(entries=>setActive(entries[0].isIntersecting),{threshold:.2}).observe(sheet);
  document.addEventListener('folio-sheet-change',event=>setActive(event.detail==='portfolio'));
  frame.addEventListener('load',()=>{send({type:'book-visibility',active});language();});
  frame.addEventListener('pointerenter',()=>document.querySelector('.cursor-dot')?.classList.remove('is-visible'));
  new MutationObserver(language).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow) return;
    if(event.data?.type==='book-ready') {send({type:'book-visibility',active});language();}
    if(event.data?.type==='book-wheel'&&active&&!document.querySelector('dialog[open]')) {
      document.querySelector('.folio').dispatchEvent(new WheelEvent('wheel',{deltaX:event.data.x,deltaY:event.data.y,deltaMode:event.data.mode,bubbles:true,cancelable:true}));
    }
    if(event.data?.type==='book-swipe'&&active&&!document.querySelector('dialog[open]')&&[-1,1].includes(event.data.direction)) {
      document.querySelector('.folio').dispatchEvent(new WheelEvent('wheel',{deltaY:event.data.direction*120,bubbles:true,cancelable:true}));
    }
  });
})();
