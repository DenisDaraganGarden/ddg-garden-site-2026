'use strict';
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
