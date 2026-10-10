'use strict';
(() => {
  const folio = document.querySelector('.folio');
  const nativeScroll = matchMedia('(pointer: coarse) and (max-width: 600px), (pointer: coarse) and (max-height: 600px)');
  const bookReading = () => document.documentElement.classList.contains('book-reading');
  document.documentElement.classList.toggle('native-scroll', nativeScroll.matches);
  const scrollHost = () => nativeScroll.matches ? document.scrollingElement : folio;
  const viewportHeight = () => window.visualViewport?.height || window.innerHeight;
  const allSheets = [...folio.querySelectorAll('.sheet')];
  const detached = sheet => sheet.matches('.work.project-sheet') || ['tractatus', 'elements', 'handwriting'].includes(sheet.id);
  const mainSheets = allSheets.filter(sheet => !detached(sheet));
  let sheets = mainSheets;
  allSheets.forEach(sheet => {sheet.hidden = !mainSheets.includes(sheet);});
  const catalogue = document.querySelector('.catalogue-scroll');
  const works = document.getElementById('works');
  const catalogueOffset = () => nativeScroll.matches ? Math.max(0, scrollHost().scrollTop - works.offsetTop) : catalogue.scrollTop;
  const viewReturn = document.querySelector('.view-return');
  const handwritingLink = document.querySelector('#author a[href="#handwriting"]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const pagePosition = document.querySelector('.page-position');
  const status = document.querySelector('#page-status');
  const viewer = document.querySelector('.image-dialog');
  const viewerImage = viewer.querySelector('img');
  const imageButtons = [...document.querySelectorAll('[data-image]')];
  const images = imageButtons.map(button => ({src: button.querySelector('img').src, alt: button.querySelector('img').alt, origin: button}));
  const focusOrigins = new WeakMap();
  const editable = target => target instanceof Element && target.closest('input,textarea,[contenteditable="true"]');
  document.querySelectorAll('img').forEach(image => {image.draggable = false;});
  document.addEventListener('copy', event => {if (!editable(event.target)) event.preventDefault();});
  document.addEventListener('dragstart', event => {
    if (event.target instanceof Element && event.target.closest('img')) event.preventDefault();
  });
  document.addEventListener('contextmenu', event => {
    if (event.target instanceof Element && event.target.closest('img,canvas,.image-open,.catalogue-card')) event.preventDefault();
  });
  let current = 0, destination = 0, navigationVersion = 0;
  let settleTimer, scrollFrame, pagingFrame, resizing = false;
  let sequence = images, imageIndex = 0, imageTicket = 0;
  let cataloguePosition = 0, catalogueOrigin = null, viewChanged = false;
  const catalogueCards = [...catalogue.querySelectorAll('.catalogue-card')];
  const catalogueFilters = [...document.querySelectorAll('[data-catalogue-filter]')];
  catalogueFilters.forEach(button => button.addEventListener('click', () => {
    const filter = button.dataset.catalogueFilter;
    catalogueFilters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    catalogueCards.forEach(card => {card.hidden = filter !== 'all' && !card.dataset.categories.split(' ').includes(filter);});
    const visible = catalogueCards.filter(card => !card.hidden).length;
    catalogue.querySelector('.catalogue-empty').hidden = visible > 0;
    document.querySelector('[data-catalogue-status]').textContent = `Показано работ: ${visible}`;
    cataloguePosition = 0;
    if (nativeScroll.matches) scrollHost().scrollTo({top:works.offsetTop, behavior:'instant'});
    else catalogue.scrollTop = 0;
    catalogueOrigin = null;
  }));

  const clamp = (value, last) => Math.max(0, Math.min(last, value));
  const pad = n => String(n).padStart(2, '0');
  const activate = sheet => {
    const toAuthor = sheet.id === 'handwriting';
    viewReturn.href = toAuthor ? '#author' : '#works';
    viewReturn.setAttribute('aria-label', toAuthor ? 'Вернуться к автопортрету' : 'Вернуться к работам');
    viewReturn.querySelector('[data-view-return-label]').textContent = toAuthor ? 'Автор' : 'Работы';
    const next = detached(sheet) ? [sheet] : mainSheets;
    if (next.length === sheets.length && next.every((item, index) => item === sheets[index])) return;
    if (sheets.includes(works) && sheets[current] === works) cataloguePosition = catalogueOffset();
    cancelAnimationFrame(pagingFrame);
    cancelAnimationFrame(scrollFrame);
    clearTimeout(settleTimer);
    pagingFrame = scrollFrame = null;
    folio.classList.remove('is-paging');
    sheets = next;
    allSheets.forEach(item => {item.hidden = !sheets.includes(item);});
    current = destination = 0;
    viewChanged = true;
    document.body.classList.toggle('on-detached', detached(sheet));
    if (sheet.id === 'works' && !nativeScroll.matches) requestAnimationFrame(() => {catalogue.scrollTop = cataloguePosition;});
  };
  const indexForHash = hash => {
    const target = document.getElementById(hash.slice(1));
    const sheet = target?.closest('.sheet') || mainSheets[0];
    activate(sheet);
    const chapter = target?.closest('[data-chapter-panel]');
    if (chapter) {
      sheet.dataset.chapterTarget = chapter.id;
      sheet.dispatchEvent(new CustomEvent('chapter-reveal', {detail:chapter}));
    }
    const frame = target?.closest('.gallery-frame');
    if (frame) {
      sheet.dataset.galleryTarget = frame.id;
      sheet.dispatchEvent(new CustomEvent('gallery-reveal', {detail:frame}));
    }
    const index = sheets.indexOf(sheet);
    return index < 0 ? 0 : index;
  };
  const themeColor = document.querySelector('meta[name="theme-color"]');
  let browserColor;
  const syncBrowserTheme = () => {
    const overlay = [...document.querySelectorAll('dialog[open]')].at(-1);
    const sheet = sheets[current];
    const dark = overlay ? overlay.classList.contains('image-dialog')
      : sheet.id === 'author' ? sheet.dataset.tone === 'ink'
      : sheet.matches('.dark-sheet,.hero');
    const color = dark ? '#000000' : '#f6f4f0';
    if (browserColor === color) return;
    browserColor = color;
    // Safari versions derive their chrome from either the document or theme-color.
    document.documentElement.style.backgroundColor = color;
    document.body.style.backgroundColor = color;
    themeColor?.setAttribute('content', color);
  };
  new MutationObserver(syncBrowserTheme).observe(document.body, {
    subtree:true, attributes:true, attributeFilter:['open','data-tone'],
  });
  const update = () => {
    if (bookReading()) { scrollFrame = null; return; }
    const top = scrollHost().scrollTop;
    current = nativeScroll.matches
      ? Math.max(0, sheets.findLastIndex(sheet => sheet.offsetTop <= top + viewportHeight() / 2))
      : sheets.reduce((nearest, sheet, index) => Math.abs(sheet.offsetTop - top) < Math.abs(sheets[nearest].offsetTop - top) ? index : nearest, 0);
    document.body.classList.toggle('on-dark', sheets[current].classList.contains('dark-sheet'));
    document.body.classList.toggle('on-cover', sheets[current].id === 'top');
    document.body.classList.toggle('on-author', sheets[current].id === 'author');
    document.body.classList.toggle('on-book', sheets[current].id === 'portfolio');
    document.dispatchEvent(new CustomEvent('folio-sheet-change',{detail:sheets[current].id}));
    pagePosition.hidden = sheets.length === 1 || sheets[current].id === 'works';
    pagePosition.textContent = pad(current + 1) + ' / ' + pad(sheets.length);
    syncBrowserTheme();
    scrollFrame = null;
  };
  const remember = () => {
    if (bookReading()) return;
    update();
    if (Math.abs(sheets[current].offsetTop - scrollHost().scrollTop) > 1 && !(nativeScroll.matches && sheets[current] === works)) return;
    destination = current;
    history.replaceState(null, '', '#' + (sheets[current].dataset.chapterActive || sheets[current].id));
    const title = sheets[current].querySelector('h1,h2')?.textContent.replace(/\s+/g, ' ').trim();
    status.textContent = title + ', ' + (current + 1) + ' из ' + sheets.length;
  };
  const go = (index, smooth = true) => {
    const next = clamp(index, sheets.length - 1);
    if (bookReading()) {
      if (sheets[next].id === 'portfolio') return;
      document.dispatchEvent(new Event('folio-leave-book'));
    }
    destination = next;
    ++navigationVersion;
    clearTimeout(settleTimer);
    cancelAnimationFrame(pagingFrame);
    pagingFrame = null;
    const from = scrollHost().scrollTop;
    const top = sheets[next].offsetTop + (nativeScroll.matches && viewChanged && sheets[next] === works ? cataloguePosition : 0);
    const changed = viewChanged;
    viewChanged = false;
    if (!smooth || changed || reduce.matches || Math.abs(top - from) < 1) {
      scrollHost().scrollTo({top, behavior:'instant'});
      folio.classList.remove('is-paging');
      remember();
      return;
    }
    // A short, interruptible turn: native smooth scrolling can take most of a
    // second per viewport. Restore native touch snapping once the turn lands.
    folio.classList.add('is-paging');
    const start = performance.now();
    const draw = now => {
      const progress = Math.min(1, (now - start) / 230);
      scrollHost().scrollTo({top:from + (top - from) * (1 - (1 - progress) ** 3), behavior:'instant'});
      if (progress < 1) pagingFrame = requestAnimationFrame(draw);
      else {
        pagingFrame = null;
        folio.classList.remove('is-paging');
        remember();
      }
    };
    pagingFrame = requestAnimationFrame(draw);
  };
  folio.addEventListener('pointerdown', () => {
    if (!pagingFrame) return;
    cancelAnimationFrame(pagingFrame);
    pagingFrame = null;
    folio.classList.remove('is-paging');
    update();
    destination = current;
  }, {passive:true});
  const onScroll = () => {
    if (bookReading()) return;
    if (!scrollFrame) scrollFrame = requestAnimationFrame(update);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(remember, 160);
  };
  folio.addEventListener('scroll', onScroll, {passive:true});
  window.addEventListener('scroll', onScroll, {passive:true});
  document.addEventListener('book-reading-change', event => {
    cancelAnimationFrame(pagingFrame);cancelAnimationFrame(scrollFrame);clearTimeout(settleTimer);
    pagingFrame=scrollFrame=null;folio.classList.remove('is-paging');
    if (!event.detail) {fitViewport();remember();}
  });

  // Keep inertia in its gesture, but let a fresh flick interrupt the animation.
  const wheelPager = (element, turn, enabled = () => true) => {
    let last = -Infinity, turnedAt = -Infinity, direction = 0;
    let used = false, distance = 0, opposite = 0, peak = 0, previous = 0, tail = 0, rebound = null;
    const begin = next => {
      direction = next;
      used = false;
      distance = opposite = peak = previous = tail = 0;
      rebound = null;
    };
    element.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey || !enabled(event)) return;
      event.preventDefault();
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY)
        * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? folio.clientHeight : 1);
      if (!delta) return;
      const now = performance.now();
      const sign = Math.sign(delta), magnitude = Math.abs(delta);
      const gap = now - last;
      if (gap > 85) begin(sign);
      last = now;

      if (sign !== direction) {
        // Tiny sign changes can be noise; an intentional reversal needs no lockout.
        opposite += magnitude;
        if (opposite < 24) return;
        const carried = opposite - magnitude;
        begin(sign);
        distance = carried;
      } else opposite = 0;

      if (used) {
        // A notched wheel repeats substantial, equally sized steps. A trackpad
        // tail decreases instead. Let those deliberate steps keep advancing.
        const wheelStep = event.deltaMode !== 0 || gap >= 35 && magnitude >= 40
          && Math.abs(magnitude - previous) <= Math.max(1, magnitude * .08);
        if (wheelStep && now - turnedAt >= 170) begin(sign);
        else if (rebound && magnitude >= rebound.floor) {
          const carried = rebound.distance;
          begin(sign);
          distance = carried;
        } else {
          rebound = null;
          // Require a decayed tail and two renewed samples, not the initial ramp
          // or a single irregular momentum sample, before accepting another flick.
          if (tail >= 2 && now - turnedAt > 100 && magnitude >= Math.max(16, previous * 2)) {
            rebound = {distance: magnitude, floor: Math.max(8, previous * 1.5)};
          }
        }
      }
      peak = Math.max(peak, magnitude);
      tail = magnitude <= peak * .35 ? tail + 1 : 0;
      previous = magnitude;
      if (used) return;
      distance += magnitude;
      if (distance < 24) return;
      used = true;
      turnedAt = now;
      turn(direction);
    }, {passive: false});
  };
  wheelPager(folio, direction => {
    if (sheets.length === 1) {
      if (sheets[0].matches('.project-sheet')) sheets[0].dispatchEvent(new CustomEvent('gallery-step', {detail:direction}));
    } else go(destination + direction);
  }, event => {
    if (document.querySelector('dialog[open]')) return false;
    // A wheel forwarded out of the book iframe has no native default action.
    if (nativeScroll.matches) return !event.isTrusted;
    if (sheets[destination].id !== 'works') return true;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? catalogue.clientHeight : 1);
    const canScroll = delta < 0 ? catalogue.scrollTop > 1
      : delta > 0 && catalogue.scrollTop < catalogue.scrollHeight - catalogue.clientHeight - 1;
    if (!canScroll) return true;
    // Scroll the catalogue first; only turn a sheet at its top or bottom edge.
    if (!catalogue.contains(event.target)) {
      event.preventDefault();
      catalogue.scrollBy({top:delta, behavior:'instant'});
    }
    return false;
  });
  wheelPager(viewer, direction => changeImage(imageIndex + direction));

  const closeDialog = dialog => new Promise(resolve => {
    if (!dialog.open || dialog.classList.contains('closing')) {resolve(); return;}
    dialog.classList.add('closing');
    const finish = () => {
      if (dialog === viewer && sequence[imageIndex].origin) {
        const origin = sequence[imageIndex].origin;
        const chapter = origin.closest('[data-chapter-panel]');
        if (chapter) origin.closest('.sheet').dispatchEvent(new CustomEvent('chapter-reveal', {detail:chapter}));
        go(sheets.indexOf(origin.closest('.sheet')), false);
        origin.closest('.sheet').dispatchEvent(new CustomEvent('gallery-reveal', {detail:origin.closest('.gallery-frame')}));
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
    if (link.matches('.catalogue-card')) catalogueOrigin = link;
    if (location.hash !== link.hash) history.pushState(null, '', link.hash);
    go(indexForHash(link.hash));
    if (link.hash === '#works') { if(link.dataset.portfolioCategory) document.querySelector(`[data-catalogue-filter="${link.dataset.portfolioCategory}"]`)?.click(); (catalogueOrigin || catalogue).focus({preventScroll:true}); }
    else if (link.hash === '#author' && link === viewReturn) handwritingLink?.focus({preventScroll:true});
    else folio.focus({preventScroll: true});
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
      if (event.button !== 0 || event.target.closest('a,[data-panel],.image-close,.author-controls,.study-controls,.project-gallery,.gallery-navigation,.essay-controls,.chapter-tabs,.catalogue-scroll,.book-entry,.book-exit')) return;
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
        turn(delta < 0 ? 1 : -1, horizontal);
      }
      start = null;
    });
    element.addEventListener('pointercancel', event => {pointers.delete(event.pointerId);start = null;});
    return () => performance.now() < movedUntil;
  };
  const folioSwiped = swipe(folio, (direction, horizontal) => {
    if (horizontal && sheets[current].id === 'author') sheets[current].dispatchEvent(new CustomEvent('author-step', {detail:direction}));
    else if (horizontal && sheets[current].hasAttribute('data-chapter')) sheets[current].dispatchEvent(new CustomEvent('chapter-step', {detail:direction}));
    else if (horizontal && sheets[current].hasAttribute('data-study')) sheets[current].dispatchEvent(new CustomEvent('study-step', {detail:direction}));
    else go(destination + direction);
  });
  const viewerSwiped = swipe(viewer, direction => changeImage(imageIndex + direction), true);
  imageButtons.forEach((button, index) => button.addEventListener('click', () => {
    if (folioSwiped()) return;
    images[index].src = button.querySelector('img').src;
    images[index].alt = button.querySelector('img').alt;
    const gallery = button.closest('.project-gallery,[data-chapter]');
    if (gallery) {
      const group = images.filter(image => gallery.contains(image.origin));
      openImage(group.indexOf(images[index]), button, group);
    } else openImage(index, button);
  }));
  viewer.querySelector('.image-canvas').addEventListener('click', () => {
    if (!viewerSwiped()) closeDialog(viewer);
  });

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
    if (viewer.open) {
      if (['ArrowRight','ArrowDown','PageDown','ArrowLeft','ArrowUp','PageUp'].includes(event.key)) {
        event.preventDefault();
        changeImage(imageIndex + (['ArrowRight','ArrowDown','PageDown'].includes(event.key) ? 1 : -1));
      }
      return;
    }
    if (document.querySelector('dialog[open]') || event.target.closest('input,textarea,select')) return;
    if (bookReading()) return;
    if (event.key === 'Escape' && sheets.length === 1) {
      event.preventDefault();
      const hash = sheets[0].id === 'handwriting' ? '#author' : '#works';
      if (location.hash !== hash) history.pushState(null, '', hash);
      go(indexForHash(hash), false);
      (hash === '#author' ? handwritingLink : catalogueOrigin || catalogue)?.focus({preventScroll:true});
      return;
    }
    if (sheets[current].id === 'works') return;
    if (sheets[current].id === 'author' && ['ArrowLeft','ArrowRight'].includes(event.key)) {
      event.preventDefault();
      sheets[current].dispatchEvent(new CustomEvent('author-step', {detail:event.key === 'ArrowRight' ? 1 : -1}));
      return;
    }
    if (sheets[current].hasAttribute('data-chapter') && ['ArrowLeft','ArrowRight'].includes(event.key)) {
      event.preventDefault();
      sheets[current].dispatchEvent(new CustomEvent('chapter-step', {detail:event.key === 'ArrowRight' ? 1 : -1}));
      return;
    }
    if (sheets[current].hasAttribute('data-study') && ['ArrowLeft','ArrowRight'].includes(event.key)) {
      event.preventDefault();
      sheets[current].dispatchEvent(new CustomEvent('study-step', {detail:event.key === 'ArrowRight' ? 1 : -1}));
      return;
    }
    if (sheets[current].matches('.project-sheet') && ['ArrowLeft','ArrowRight'].includes(event.key)) {
      event.preventDefault();
      sheets[current].dispatchEvent(new CustomEvent('gallery-step', {detail:event.key === 'ArrowRight' ? 1 : -1}));
      return;
    }
    if ([' ', 'Enter'].includes(event.key) && event.target.closest('button,a')) return;
    const direction = ['ArrowDown','ArrowRight','PageDown',' '].includes(event.key) ? 1 : ['ArrowUp','ArrowLeft','PageUp'].includes(event.key) ? -1 : 0;
    if (direction || ['Home','End'].includes(event.key)) {
      event.preventDefault();
      if (sheets.length === 1) {
        if (sheets[0].matches('.project-sheet')) {
          if (direction) sheets[0].dispatchEvent(new CustomEvent('gallery-step', {detail:direction}));
          else {
            const frames = [...sheets[0].querySelectorAll('.gallery-frame')];
            sheets[0].dispatchEvent(new CustomEvent('gallery-reveal', {detail:event.key === 'Home' ? frames[0] : frames.at(-1)}));
          }
        }
        return;
      }
      go(event.key === 'Home' ? 0 : event.key === 'End' ? sheets.length - 1 : destination + direction);
    }
  });
  const viewport = window.visualViewport;
  let viewportFrame;
  const fitViewport = () => {
    viewportFrame = null;
    // Pinch zoom must magnify the page, never resize/reflow its composition.
    if (viewport && Math.abs(viewport.scale - 1) > .01) return;
    const height = Math.ceil(viewport?.height || window.innerHeight);
    if (height <= 0) return;
    const sheet = sheets[current], before = sheet.offsetTop, offset = scrollHost().scrollTop - before;
    document.documentElement.style.setProperty('--viewport-height', height + 'px');
    // Browser bars change the height of every preceding sheet. Keep the same
    // reading position while the root document remains free to scroll normally.
    if (nativeScroll.matches && !bookReading() && sheet.offsetTop !== before && !pagingFrame) {
      scrollHost().scrollTo({top:sheet.offsetTop + offset, behavior:'instant'});
    }
  };
  const queueViewport = () => {
    if (!viewportFrame) viewportFrame = requestAnimationFrame(fitViewport);
  };
  window.addEventListener('resize', queueViewport, {passive:true});
  viewport?.addEventListener('resize', queueViewport, {passive:true});
  window.addEventListener('pageshow', queueViewport);
  nativeScroll.addEventListener('change', () => {
    const keep = sheets[current];
    cataloguePosition = catalogueOffset();
    document.documentElement.classList.toggle('native-scroll', nativeScroll.matches);
    fitViewport();
    go(sheets.indexOf(keep), false);
  });
  fitViewport();
  let lastHeight = folio.clientHeight, lastWidth = folio.clientWidth;
  new ResizeObserver(() => {
    if (folio.clientHeight === lastHeight && folio.clientWidth === lastWidth) return;
    const widthChanged = folio.clientWidth !== lastWidth;
    lastHeight = folio.clientHeight; lastWidth = folio.clientWidth;
    if (bookReading()) return;
    if (nativeScroll.matches && !widthChanged) return;
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
  // WebKit resolves the mobile visual viewport after deferred scripts. Read
  // the final sheet positions before following a direct chapter link.
  const initialHash = location.hash;
  requestAnimationFrame(() => {
    fitViewport();
    go(indexForHash(initialHash), false);
    update();
    if (sheets[current].id === 'works') catalogue.focus({preventScroll:true});
  });
})();
