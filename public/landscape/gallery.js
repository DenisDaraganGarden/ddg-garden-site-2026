'use strict';
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.project-sheet').forEach(sheet => {
    const rail = sheet.querySelector('.project-gallery');
    const frames = [...rail.querySelectorAll('.gallery-frame')];
    const prev = sheet.querySelector('[data-gallery-prev]');
    const next = sheet.querySelector('[data-gallery-next]');
    const count = sheet.querySelector('[data-gallery-count]');
    const status = sheet.querySelector('[data-gallery-status]');
    let current = 0, destination = 0, timer, dragging = null, movedUntil = 0;
    const gutter = () => parseFloat(getComputedStyle(rail).paddingLeft);
    const position = frame => frame.offsetLeft - rail.offsetLeft - gutter();
    const refresh = () => {
      current = frames.reduce((near, frame, i) => Math.abs(position(frame) - rail.scrollLeft) < Math.abs(position(frames[near]) - rail.scrollLeft) ? i : near, 0);
      destination = current;
      if (count) count.textContent = `${String(current + 1).padStart(2, '0')} / ${String(frames.length).padStart(2, '0')}`;
      if (prev) prev.disabled = current === 0;
      if (next) next.disabled = current === frames.length - 1;
    };
    const go = (index, smooth = true) => {
      destination = Math.max(0, Math.min(frames.length - 1, index));
      rail.scrollTo({left: position(frames[destination]), behavior: smooth && !reduce.matches ? 'smooth' : 'instant'});
      if (smooth) status.textContent = `Кадр ${destination + 1} из ${frames.length}`;
      if (!smooth || reduce.matches) refresh();
    };
    prev?.addEventListener('click', () => go(destination - 1));
    next?.addEventListener('click', () => go(destination + 1));
    sheet.addEventListener('gallery-step', event => go(destination + event.detail));
    sheet.addEventListener('gallery-reveal', event => {
      const index = frames.indexOf(event.detail);
      if (index >= 0) go(index, false);
      delete sheet.dataset.galleryTarget;
    });
    rail.addEventListener('scroll', () => {clearTimeout(timer);timer = setTimeout(refresh, 120);}, {passive:true});
    // A horizontal trackpad gesture belongs to the images; vertical movement turns the project.
    rail.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey && (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey)) event.stopPropagation();
    }, {passive:true});
    rail.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || frames.length === 1) return;
      dragging = {id:event.pointerId, x:event.clientX, left:rail.scrollLeft, moved:false};
    });
    rail.addEventListener('pointermove', event => {
      if (!dragging || event.pointerId !== dragging.id) return;
      const dx = event.clientX - dragging.x;
      if (!dragging.moved && Math.abs(dx) < 8) return;
      dragging.moved = true;
      rail.setPointerCapture(event.pointerId);
      rail.classList.add('is-dragging');
      rail.scrollLeft = dragging.left - dx;
      movedUntil = performance.now() + 400;
    });
    const release = event => {
      if (!dragging || event.pointerId !== dragging.id) return;
      const moved = dragging.moved;
      dragging = null;
      rail.classList.remove('is-dragging');
      if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
      if (moved) {refresh();go(current);}
    };
    rail.addEventListener('pointerup', release);
    rail.addEventListener('pointercancel', release);
    rail.addEventListener('click', event => {
      if (performance.now() < movedUntil) {event.preventDefault();event.stopImmediatePropagation();}
    }, true);
    let width = 0, height = 0;
    new ResizeObserver(() => {
      if (width === rail.clientWidth && height === rail.clientHeight) return;
      width = rail.clientWidth; height = rail.clientHeight;
      rail.style.setProperty('--stage-height', `${height}px`);
      requestAnimationFrame(() => {
        rail.style.paddingRight = `${frames.length > 1 ? Math.max(gutter(), width - frames.at(-1).offsetWidth - gutter()) : gutter()}px`;
        go(destination, false);
      });
    }).observe(rail);
    const initial = document.getElementById(sheet.dataset.galleryTarget || location.hash.slice(1));
    delete sheet.dataset.galleryTarget;
    refresh();
    if (frames.includes(initial)) destination = frames.indexOf(initial);
  });
})();
