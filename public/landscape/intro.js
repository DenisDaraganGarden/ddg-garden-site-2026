'use strict';
(() => {
  const root=document.documentElement,reduce=matchMedia('(prefers-reduced-motion: reduce)');
  root.classList.add('portfolio-starting');root.dataset.loadState='loading';
  let intro,finished=false,previousFocus;
  const suspended=[],en=()=>root.lang==='en';
  let bookResolve,bookReject;
  const bookReady=new Promise((resolve,reject)=>{bookResolve=resolve;bookReject=reject;});
  bookReady.catch(()=>{});
  addEventListener('message',event=>{
    const frame=document.querySelector('#portfolio-book');
    if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
    if(event.data?.type==='book-ready')bookResolve();
    if(event.data?.type==='book-failed')bookReject(Error('book'));
  });
  const close=()=>{
    if(finished)return;finished=true;
    root.classList.remove('portfolio-starting');intro.hidden=true;
    suspended.forEach(({element,inert})=>{element.inert=inert;});
    if(document.activeElement===intro||document.activeElement===document.body)
      (previousFocus instanceof HTMLElement&&previousFocus.isConnected?previousFocus:document.querySelector('.folio'))?.focus({preventScroll:true});
  };
  document.addEventListener('DOMContentLoaded',async()=>{
    intro=document.querySelector('.portfolio-intro');if(!intro)return;
    previousFocus=document.activeElement;
    document.querySelectorAll('.site-header,.folio').forEach(element=>{
      suspended.push({element,inert:element.inert});element.inert=true;
    });
    intro.hidden=false;intro.setAttribute('aria-busy','true');intro.classList.add('is-ready');
    const status=intro.querySelector('[data-load-status]'),retry=intro.querySelector('[data-load-retry]');
    status.textContent=en()?'Loading portfolio':'Загрузка портфолио';
    retry.addEventListener('click',()=>location.reload());
    let timeout;
    try {
      // Warm the site's image resources with bounded concurrency. Decode only
      // the initial section now; large offscreen galleries remain evictable.
      const files=[...new Set([...document.images].map(img=>img.currentSrc||img.src))];
      files.push(new URL('./assets/denis-daragan-signature-20261009.png',location.href).href);
      let cursor=0;
      const worker=async()=>{while(cursor<files.length){const response=await fetch(files[cursor++],{cache:'force-cache'});if(!response.ok)throw Error('image');await response.arrayBuffer();}};
      const first=document.getElementById(location.hash.slice(1))||document.querySelector('.sheet');
      const initial=[...first.querySelectorAll('img')].map(img=>img.decode());
      await Promise.race([
        Promise.all([bookReady,document.fonts.ready,...initial,...Array.from({length:3},worker)]),
        new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('timeout')),45000);})
      ]);
      await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
      root.dataset.loadState='ready';intro.setAttribute('aria-busy','false');
      if(reduce.matches)close();else {intro.classList.add('is-leaving');setTimeout(close,300);}
    } catch {
      root.dataset.loadState='failed';intro.setAttribute('aria-busy','false');
      status.textContent=en()?'Could not load the portfolio':'Не удалось загрузить портфолио';
      retry.textContent=en()?'Retry':'Повторить';retry.hidden=false;
    } finally {clearTimeout(timeout);}
  },{once:true});
})();
