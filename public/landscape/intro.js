'use strict';
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let intro, timer = 0, fade = 0, finished = false, leaving = false;
  let previousFocus;
  const suspended = [];
  root.classList.add('portfolio-starting');

  const close = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    clearTimeout(fade);
    clearTimeout(safety);
    root.classList.remove('portfolio-starting');
    if (intro) intro.hidden = true;
    suspended.forEach(({element, inert}) => {element.inert = inert;});
    document.removeEventListener('keydown', skip, true);
    if (intro && (document.activeElement === document.body || document.activeElement === intro)) {
      (previousFocus instanceof HTMLElement && previousFocus.isConnected ? previousFocus : document.querySelector('.folio'))?.focus({preventScroll:true});
    }
  };
  const leave = () => {
    if (finished || leaving) return;
    leaving = true;
    clearTimeout(timer);
    if (!intro || reduce.matches) return close();
    intro.classList.add('is-leaving');
    fade = setTimeout(close, 500);
  };
  const skip = event => {
    if (!['Escape', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    leave();
  };
  // Even a missing image, slow font or interrupted page must release the site.
  const safety = setTimeout(close, 4500);
  window.addEventListener('pagehide', close, {once:true});
  document.addEventListener('DOMContentLoaded', async () => {
    if (finished) return;
    intro = document.querySelector('.portfolio-intro');
    if (!intro) return close();
    previousFocus = document.activeElement;
    document.querySelectorAll('.site-header,.folio').forEach(element => {
      suspended.push({element, inert:element.inert});
      element.inert = true;
    });
    intro.hidden = false;
    intro.addEventListener('click', leave, {once:true});
    document.addEventListener('keydown', skip, true);
    await Promise.race([
      Promise.all([intro.querySelector('img').decode().catch(close), document.fonts.ready]),
      new Promise(resolve => setTimeout(resolve, 700)),
    ]);
    if (finished || leaving) return;
    intro.classList.add('is-ready');
    timer = setTimeout(leave, reduce.matches ? 650 : 1800);
  }, {once:true});
})();
