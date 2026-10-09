(() => {
  const fine=matchMedia('(hover:hover) and (pointer:fine)');
  const dot=document.querySelector('.cursor-dot');
  if (!dot) return;
  const sync=()=>{document.documentElement.classList.toggle('has-dot-cursor',fine.matches);if(!fine.matches)dot.classList.remove('is-visible');};
  document.addEventListener('pointermove',e=>{if(!fine.matches||e.pointerType==='touch')return;const host=e.target.closest?.('dialog[open]')||document.body;if(dot.parentElement!==host)host.append(dot);dot.style.left=e.clientX+'px';dot.style.top=e.clientY+'px';dot.classList.add('is-visible');},{passive:true});
  const hide=()=>dot.classList.remove('is-visible');
  document.addEventListener('pointerout',e=>{if(!e.relatedTarget)hide();});window.addEventListener('blur',hide);document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
  new MutationObserver(()=>{const host=document.querySelector('dialog[open]')||document.body;if(dot.parentElement!==host)host.append(dot);}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  fine.addEventListener('change',sync);sync();
})();
