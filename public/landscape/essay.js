'use strict';
(() => {
  document.querySelectorAll('[data-chapter]').forEach(sheet => {
    const panels = [...sheet.querySelectorAll('[data-chapter-panel]')];
    const tabs = [...sheet.querySelectorAll('[data-chapter-tab]')];
    let current = 0;
    const show = (index, remember = false) => {
      current = (index + panels.length) % panels.length;
      panels.forEach((panel, i) => {panel.hidden = i !== current;});
      tabs.forEach((tab, i) => {
        tab.setAttribute('aria-selected', String(i === current));
        tab.tabIndex = i === current ? 0 : -1;
      });
      const id = panels[current].id;
      sheet.dataset.chapterActive = id === 'wave' ? sheet.id : id;
      if (remember) history.replaceState(null, '', '#' + sheet.dataset.chapterActive);
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => show(index, true));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        show(event.key === 'Home' ? 0 : event.key === 'End' ? panels.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1), true);
        tabs[current].focus({preventScroll:true});
      });
    });
    sheet.addEventListener('chapter-step', event => show(current + event.detail, true));
    sheet.addEventListener('chapter-reveal', event => {
      const index = panels.indexOf(event.detail);
      if (index >= 0) show(index);
    });
    const initial = panels.findIndex(panel => panel.id === (sheet.dataset.chapterTarget || location.hash.slice(1)));
    show(Math.max(0, initial));
    delete sheet.dataset.chapterTarget;
  });
})();

(() => {
  const sheet = document.querySelector('#tractatus');
  const image = sheet?.querySelector('[data-essay-image]');
  if (!image) return;
  const views = {
    full: {src:'./assets/essay-ninth-wave.webp', alt:'Иван Айвазовский. Девятый вал, 1850', caption:'Иван Айвазовский · «Девятый вал», 1850', width:1500, height:1000},
    detail: {src:'./assets/essay-ninth-wave-detail.webp', alt:'Девятый вал. Фрагмент: моряки на обломке мачты', caption:'«Девятый вал» · обломок мачты, фрагмент', width:944, height:708},
  };
  sheet.querySelectorAll('[data-essay-view]').forEach(button => button.addEventListener('click', () => {
    const view = views[button.dataset.essayView];
    image.src = view.src;
    image.alt = view.alt;
    image.width = view.width;
    image.height = view.height;
    image.closest('button').setAttribute('aria-label', `Рассмотреть: ${view.alt}`);
    sheet.querySelector('[data-essay-caption]').textContent = view.caption;
    sheet.querySelectorAll('[data-essay-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  }));
})();
