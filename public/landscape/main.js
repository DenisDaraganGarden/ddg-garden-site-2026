'use strict';
(() => {
  const folio = document.querySelector('.folio');
  const sheets = [...folio.querySelectorAll('.sheet')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const pagePosition = document.querySelector('.page-position');
  const status = document.querySelector('#page-status');
  const viewer = document.querySelector('.image-dialog');
  const viewerImage = viewer.querySelector('img');
  const imageButtons = [...document.querySelectorAll('[data-image]')];
  const images = imageButtons.map(button => ({src: button.querySelector('img').src, alt: button.querySelector('img').alt}));
  const focusOrigins = new WeakMap();
  let current = 0, destination = 0, navigationVersion = 0;
  let settleTimer, scrollFrame, resizing = false;
  let sequence = images, imageIndex = 0, imageTicket = 0;

  const clamp = (value, last) => Math.max(0, Math.min(last, value));
  const pad = n => String(n).padStart(2, '0');
  const indexForHash = hash => {
    const id = hash.slice(1) === 'works' ? 'secret-garden' : hash.slice(1);
    const index = sheets.findIndex(sheet => sheet.id === id);
    return index < 0 ? 0 : index;
  };
  const update = () => {
    current = sheets.reduce((nearest, sheet, index) => Math.abs(sheet.offsetTop - folio.scrollTop) < Math.abs(sheets[nearest].offsetTop - folio.scrollTop) ? index : nearest, 0);
    document.body.classList.toggle('on-dark', sheets[current].classList.contains('dark-sheet'));
    document.body.classList.toggle('on-cover', current === 0);
    pagePosition.textContent = pad(current + 1) + ' / ' + pad(sheets.length);
    scrollFrame = null;
  };
  const remember = () => {
    update();
    if (Math.abs(sheets[current].offsetTop - folio.scrollTop) > 1) return;
    destination = current;
    history.replaceState(null, '', '#' + sheets[current].id);
    const title = sheets[current].querySelector('h1,h2')?.textContent.replace(/\s+/g, ' ').trim();
    status.textContent = title + ', ' + (current + 1) + ' из ' + sheets.length;
  };
  const go = (index, smooth = true) => {
    const next = clamp(index, sheets.length - 1);
    destination = next;
    ++navigationVersion;
    clearTimeout(settleTimer);
    folio.scrollTo({top: sheets[next].offsetTop, behavior: smooth && !reduce.matches ? 'smooth' : 'instant'});
    if (!smooth || reduce.matches) remember();
  };
  folio.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(update);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(remember, 160);
  }, {passive: true});

  // A wheel gesture owns one turn, including its trackpad inertia.
  const wheelPager = (element, turn, enabled = () => true) => {
    let last = -Infinity, lockedUntil = 0, used = false, distance = 0;
    element.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey || !enabled()) return;
      event.preventDefault();
      const now = performance.now();
      if (now - last > 220 && now > lockedUntil) {used = false; distance = 0;}
      last = now;
      if (used) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      distance += delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? folio.clientHeight : 1);
      if (Math.abs(distance) < 24) return;
      used = true;
      lockedUntil = now + 600;
      turn(Math.sign(distance));
    }, {passive: false});
  };
  wheelPager(folio, direction => go(current + direction), () => !document.querySelector('dialog[open]'));
  wheelPager(viewer, direction => changeImage(imageIndex + direction));

  const closeDialog = dialog => new Promise(resolve => {
    if (!dialog.open || dialog.classList.contains('closing')) {resolve(); return;}
    dialog.classList.add('closing');
    const finish = () => {
      if (dialog === viewer && sequence === images) {
        const origin = imageButtons[imageIndex];
        go(sheets.indexOf(origin.closest('.sheet')), false);
        focusOrigins.set(dialog, origin);
      }
      dialog.classList.remove('closing');
      dialog.close();
      focusOrigins.get(dialog)?.focus({preventScroll: true});
      resolve();
    };
    if (reduce.matches) finish();
    else setTimeout(finish, 180);
  });
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('cancel', event => {event.preventDefault(); closeDialog(dialog);});
    dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(dialog)));
    if (dialog !== viewer) dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) closeDialog(dialog);
    });
  });
  document.querySelectorAll('[data-panel]').forEach(button => button.addEventListener('click', () => {
    const dialog = document.getElementById(button.dataset.panel);
    focusOrigins.set(dialog, button);
    dialog.showModal();
  }));
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', async event => {
    event.preventDefault();
    const panel = link.closest('dialog');
    if (panel) await closeDialog(panel);
    go(indexForHash(link.hash));
    folio.focus({preventScroll: true});
  }));

  const imageLabel = () => {
    viewer.querySelector('.image-position').textContent = sequence.length > 1 ? pad(imageIndex + 1) + ' / ' + pad(sequence.length) : '';
  };
  const changeImage = async next => {
    next = clamp(next, sequence.length - 1);
    if (next === imageIndex) return;
    imageIndex = next;
    const ticket = ++imageTicket;
    const slide = sequence[next];
    viewerImage.classList.add('changing');
    const preload = new Image();
    preload.src = slide.src;
    await Promise.all([preload.decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, reduce.matches ? 0 : 140))]);
    if (ticket !== imageTicket || !viewer.open) return;
    viewerImage.src = slide.src;
    viewerImage.alt = slide.alt;
    imageLabel();
    viewerImage.classList.remove('changing');
  };
  const openImage = (index, origin, source = images) => {
    sequence = source;
    imageIndex = index;
    ++imageTicket;
    viewerImage.classList.remove('changing');
    viewerImage.src = sequence[index].src;
    viewerImage.alt = sequence[index].alt;
    imageLabel();
    focusOrigins.set(viewer, origin);
    viewer.showModal();
  };
  viewer.querySelector('.image-close').addEventListener('click', () => closeDialog(viewer));
  viewer.addEventListener('close', () => {++imageTicket; viewerImage.classList.remove('changing');});
  document.querySelectorAll('[data-document]').forEach(button => button.addEventListener('click', () => {
    openImage(0, button, [{src: button.dataset.document, alt: button.dataset.caption}]);
  }));

  // Native vertical touch snapping; horizontal swipes and mouse drags turn one sheet.
  const swipe = (element, turn, allDirections = false) => {
    let start = null, blocked = false, movedUntil = 0;
    const pointers = new Set();
    element.addEventListener('pointerdown', event => {
      pointers.add(event.pointerId);
      if (pointers.size > 1) {start = null; blocked = true; return;}
      if (event.button !== 0 || event.target.closest('a,[data-panel],.image-close')) return;
      blocked = false;
      start = {x: event.clientX, y: event.clientY, id: event.pointerId};
    });
    element.addEventListener('pointermove', event => {
      if (!start || blocked || event.pointerId !== start.id) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) movedUntil = performance.now() + 400;
    });
    element.addEventListener('pointerup', event => {
      pointers.delete(event.pointerId);
      if (!start || blocked || event.pointerId !== start.id) {if (!pointers.size) blocked = false; return;}
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      const horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      const delta = horizontal ? dx : dy;
      if (Math.abs(delta) > 45 && (horizontal || allDirections || event.pointerType === 'mouse')) {
        movedUntil = performance.now() + 400;
        turn(delta < 0 ? 1 : -1);
      }
      start = null;
    });
    element.addEventListener('pointercancel', event => {pointers.delete(event.pointerId);start = null;});
    return () => performance.now() < movedUntil;
  };
  const folioSwiped = swipe(folio, direction => go(current + direction));
  const viewerSwiped = swipe(viewer, direction => changeImage(imageIndex + direction), true);
  imageButtons.forEach((button, index) => button.addEventListener('click', () => {
    if (!folioSwiped()) openImage(index, button);
  }));
  viewer.querySelector('.image-canvas').addEventListener('click', () => {
    if (!viewerSwiped()) closeDialog(viewer);
  });

  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (viewer.open) {
      if (['ArrowRight','ArrowDown','PageDown','ArrowLeft','ArrowUp','PageUp'].includes(event.key)) {
        event.preventDefault();
        changeImage(imageIndex + (['ArrowRight','ArrowDown','PageDown'].includes(event.key) ? 1 : -1));
      }
      return;
    }
    if (document.querySelector('dialog[open]') || event.target.closest('input,textarea,select')) return;
    if ([' ', 'Enter'].includes(event.key) && event.target.closest('button,a')) return;
    const direction = ['ArrowDown','ArrowRight','PageDown',' '].includes(event.key) ? 1 : ['ArrowUp','ArrowLeft','PageUp'].includes(event.key) ? -1 : 0;
    if (direction || ['Home','End'].includes(event.key)) {
      event.preventDefault();
      go(event.key === 'Home' ? 0 : event.key === 'End' ? sheets.length - 1 : current + direction);
    }
  });
  let lastHeight = folio.clientHeight, lastWidth = folio.clientWidth;
  new ResizeObserver(() => {
    if (folio.clientHeight === lastHeight && folio.clientWidth === lastWidth) return;
    lastHeight = folio.clientHeight; lastWidth = folio.clientWidth;
    if (!resizing) {
      resizing = true;
      const keep = destination, version = navigationVersion;
      requestAnimationFrame(() => {
        if (version === navigationVersion) go(keep, false);
        resizing = false;
      });
    }
  }).observe(folio);
  window.addEventListener('hashchange', event => go(indexForHash(new URL(event.newURL).hash)));
  history.scrollRestoration = 'manual';
  go(indexForHash(location.hash), false);
  update();
})();
