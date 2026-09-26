/* Standalone interaction for the study's camera film strip. */
(() => {
  'use strict';
  const dragThreshold = 5;

  function closeMenu(host) {
    host.querySelector('.camera-strip-add-menu')?.remove();
    host.querySelector('[data-camera-add-menu]')?.setAttribute('aria-expanded', 'false');
    if (host._cameraStripOutside) {
      document.removeEventListener('pointerdown', host._cameraStripOutside, true);
      host._cameraStripOutside = null;
    }
  }

  function openMenu(host, anchor) {
    const old = host.querySelector('.camera-strip-add-menu');
    if (old) { closeMenu(host); return; }
    const menu = document.createElement('div');
    menu.className = 'camera-strip-add-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = '<button type="button" role="menuitem" data-add-camera="work">+ Рабочая камера</button><button type="button" role="menuitem" data-add-camera="scene">+ Сцена</button>';
    host.querySelector('[data-camera-strip]')?.append(menu);
    menu.addEventListener('click', () => closeMenu(host));
    menu.querySelector('button')?.focus();
    anchor.setAttribute('aria-expanded', 'true');
    host._cameraStripOutside = (event) => {
      if (host.contains(event.target)) return;
      closeMenu(host);
    };
    setTimeout(() => document.addEventListener('pointerdown', host._cameraStripOutside, true), 0);
  }

  function enhance(host) {
    const strip = host.querySelector('[data-camera-strip]');
    const scroller = host.querySelector('.camera-strip-scroll');
    if (!strip || !scroller || strip.dataset.enhanced) return;
    strip.dataset.enhanced = 'true';
    let startX = 0;
    let startScroll = 0;
    let pointerId = null;
    let dragged = false;
    let suppressClick = false;

    scroller.addEventListener('wheel', (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      scroller.scrollLeft += event.deltaY;
    }, { passive: false });

    scroller.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startScroll = scroller.scrollLeft;
      dragged = false;
    });
    scroller.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointerId) return;
      const distance = event.clientX - startX;
      if (!dragged && Math.abs(distance) > dragThreshold) {
        dragged = true;
        scroller.dataset.dragging = 'true';
        scroller.setPointerCapture(pointerId);
      }
      if (dragged) scroller.scrollLeft = startScroll - distance;
    });
    const finishDrag = (event) => {
      if (event.pointerId !== pointerId) return;
      if (dragged) suppressClick = true;
      pointerId = null;
      dragged = false;
      delete scroller.dataset.dragging;
      if (scroller.hasPointerCapture?.(event.pointerId)) scroller.releasePointerCapture(event.pointerId);
    };
    scroller.addEventListener('pointerup', finishDrag);
    scroller.addEventListener('pointercancel', finishDrag);
    scroller.addEventListener('click', (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
    }, true);

    strip.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      scroller.scrollBy({ left: event.key === 'ArrowLeft' ? -160 : 160, behavior: 'smooth' });
    });
    strip.addEventListener('click', (event) => {
      const add = event.target.closest('[data-camera-add-menu]');
      if (!add) return;
      event.preventDefault();
      event.stopPropagation();
      openMenu(host, add);
    });
  }

window.OuroborosCameraStrip = { enhance };
})();
