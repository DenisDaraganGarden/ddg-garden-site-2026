/* Local organization labels for this standalone study only. */
window.createOuroborosIconColors = function ({nodes, groups, onChange, onOpen}) {
  const palette = [
    ['Мел', '#dddcd4'], ['Серый', '#a0a5aa'], ['Песок', '#c4b293'],
    ['Охра', '#cbb26b'], ['Янтарь', '#e4b45b'], ['Оранжевый', '#e49b69'],
    ['Коралл', '#df887b'], ['Красный', '#d76b72'], ['Розовый', '#d994bb'],
    ['Сиреневый', '#bd92d7'], ['Фиолетовый', '#9d8bd8'], ['Индиго', '#899ddd'],
    ['Голубой', '#7fbbdf'], ['Бирюзовый', '#70c3be'], ['Зелёный', '#9cbf86'],
  ];
  const storageKey = 'ouroboros-ui-study.icon-colors.v1';
  const validColors = new Set(palette.map(([,color]) => color));
  const validKeys = new Set([...nodes.map(n => 'node:' + n.id), ...groups.map(g => 'group:' + g.id)]);
  let labels = {};
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    labels = Object.fromEntries(Object.entries(saved).filter(([key,color]) => validKeys.has(key) && validColors.has(color)));
  } catch { /* The palette still works when local storage is unavailable. */ }
  const effective = key => labels[key] || (key.startsWith('node:') ? labels['group:' + nodes.find(n => n.id === key.slice(5))?.groupKey] : '') || '';
  const name = key => key.startsWith('node:') ? nodes.find(n => n.id === key.slice(5))?.label : groups.find(g => g.id === key.slice(6))?.label;
  let popup, anchor, key;
  function close(restoreFocus = false) {
    popup?.remove(); popup = null;
    if (restoreFocus && anchor?.isConnected) anchor.focus();
  }
  function select(color) {
    if (color) labels[key] = color; else delete labels[key];
    try { localStorage.setItem(storageKey, JSON.stringify(labels)); } catch { /* In-memory fallback. */ }
    close(true); onChange();
  }
  function open(target, x, y) {
    close(); onOpen?.(); anchor = target; key = target.dataset.colorTarget;
    if (!validKeys.has(key)) return;
    popup = document.createElement('div');
    popup.className = 'icon-palette'; popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', 'Цвет значка: ' + name(key));
    const heading = document.createElement('div'); heading.className = 'palette-heading'; heading.textContent = name(key); popup.append(heading);
    const grid = document.createElement('div'); grid.className = 'palette-grid'; grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', '15 цветов');
    for (const [label,color] of palette) {
      const button = document.createElement('button');
      button.className = 'palette-swatch'; button.style.setProperty('--swatch', color); button.dataset.swatch = color;
      button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(effective(key) === color)); button.title = label;
      button.addEventListener('click', () => select(color)); grid.append(button);
    }
    popup.append(grid);
    const reset = document.createElement('button'); reset.className = 'palette-reset';
    reset.textContent = key.startsWith('node:') ? 'Цвет группы' : 'Без метки'; reset.addEventListener('click', () => select('')); popup.append(reset);
    const hint = document.createElement('small'); hint.textContent = key.startsWith('group:') ? 'Наследуется значками объектов' : 'Один цвет в списке и инспекторе'; popup.append(hint);
    document.body.append(popup);
    const bounds = popup.getBoundingClientRect();
    popup.style.left = Math.max(8, Math.min(x, innerWidth - bounds.width - 8)) + 'px';
    popup.style.top = Math.max(8, Math.min(y, innerHeight - bounds.height - 8)) + 'px';
    (popup.querySelector('[aria-pressed=true]') || grid.firstElementChild).focus();
  }
  document.addEventListener('contextmenu', event => {
    const target = event.target.closest('[data-color-target]'); if (!target) return;
    event.preventDefault(); event.stopPropagation(); open(target, event.clientX, event.clientY);
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-color-button]'); if (!target) return;
    event.preventDefault(); event.stopImmediatePropagation(); const r = target.getBoundingClientRect(); open(target, r.left, r.bottom + 5);
  }, true);
  document.addEventListener('pointerdown', event => { if (popup && !popup.contains(event.target)) close(); }, true);
  document.addEventListener('keydown', event => {
    if (!popup) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(true); return; }
    const buttons = [...popup.querySelectorAll('button')], current = buttons.indexOf(document.activeElement);
    const swatches = [...popup.querySelectorAll('.palette-swatch')], colorIndex = swatches.indexOf(document.activeElement);
    const offsets = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-5, ArrowDown:5};
    if (event.key in offsets && colorIndex >= 0) { event.preventDefault(); swatches[(colorIndex + offsets[event.key] + swatches.length) % swatches.length].focus(); }
    if (event.key === 'Tab' && ((event.shiftKey && current === 0) || (!event.shiftKey && current === buttons.length - 1))) { event.preventDefault(); close(true); }
  }, true);
  addEventListener('resize', () => close());
  return {color: effective, close};
};
