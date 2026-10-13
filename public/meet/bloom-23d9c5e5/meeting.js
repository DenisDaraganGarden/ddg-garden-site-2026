const storeKey = 'ddg-bloom-23d9c5e5-notes-v1';
const savedStatus = document.getElementById('save-status');
const savedFields = [...document.querySelectorAll('[data-save]')];
try {
  const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
  savedFields.forEach(field => {
    if (!Object.hasOwn(saved, field.id)) return;
    if (field.type === 'checkbox') field.checked = saved[field.id] === true;
    else if (typeof saved[field.id] === 'string') field.value = saved[field.id];
  });
} catch {
  savedStatus.textContent = 'Сохранение недоступно. Скачай заметки перед закрытием.';
}

function saveNotes() {
  const values = Object.fromEntries(savedFields.map(field => [field.id, field.type === 'checkbox' ? field.checked : field.value]));
  try {
    localStorage.setItem(storeKey, JSON.stringify(values));
    savedStatus.textContent = 'Сохранено в этом браузере';
  } catch {
    savedStatus.textContent = 'Не удалось сохранить. Скачай заметки перед закрытием.';
  }
}
savedFields.forEach(field => field.addEventListener('input', saveNotes));

document.getElementById('export-notes').addEventListener('click', () => {
  const text = ['Bloom × Denis Daragan', 'Заметки встречи', '', ...savedFields.flatMap(field => {
    const label = field.closest('label').firstChild.textContent.trim();
    return field.type === 'checkbox' ? [(field.checked ? '[x] ' : '[ ] ') + field.closest('label').textContent.trim()] : [label, field.value || 'Не заполнено', ''];
  })].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Bloom-Denis-Daragan-notes.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const strip = document.getElementById('case-strip');
const cases = [...strip.querySelectorAll('.case')];
const tabs = [...document.querySelectorAll('[data-case]')];
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let currentCase = 0;
let scrollFrame = 0;

function setTabs(index) {
  currentCase = index;
  tabs.forEach((tab, position) => tab.setAttribute('aria-pressed', String(position === index)));
}
function selectCase(index, instant = false) {
  const target = cases[index].offsetLeft - cases[0].offsetLeft;
  strip.scrollTo({ left: target, behavior: motion.matches || instant ? 'auto' : 'smooth' });
  setTabs(index);
}
tabs.forEach(tab => tab.addEventListener('click', () => selectCase(Number(tab.dataset.case))));
strip.addEventListener('scroll', () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    const left = strip.getBoundingClientRect().left;
    const distances = cases.map(item => Math.abs(item.getBoundingClientRect().left - left));
    setTabs(distances.indexOf(Math.min(...distances)));
    scrollFrame = 0;
  });
}, { passive: true });
strip.addEventListener('keydown', event => {
  if (event.target !== strip || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  selectCase(Math.max(0, Math.min(cases.length - 1, currentCase + (event.key === 'ArrowRight' ? 1 : -1))));
});

const dialog = document.getElementById('presentation');
const fullImage = document.getElementById('presentation-image');
const presentTabs = [...document.querySelectorAll('[data-present]')];
let presentedCase = 0;
let pointerStart = null;
let ignoreClick = false;
let previousScroll = 0;
let previousFocus = null;

function presentCase(index) {
  presentedCase = index;
  const project = cases[index];
  const image = project.querySelector('img');
  fullImage.src = image.getAttribute('src');
  fullImage.alt = image.alt;
  document.getElementById('presentation-title').textContent = project.dataset.title;
  document.getElementById('presentation-credit').textContent = project.dataset.credit;
  presentTabs.forEach((tab, position) => tab.setAttribute('aria-pressed', String(position === index)));
}
function openPresentation(index) {
  presentCase(index);
  previousScroll = window.scrollY;
  previousFocus = document.activeElement;
  document.documentElement.classList.add('presenting');
  dialog.hidden = false;
  window.scrollTo(0, 0);
  document.getElementById('close-presentation').focus({ preventScroll: true });
}
function closePresentation() {
  dialog.hidden = true;
  document.documentElement.classList.remove('presenting');
  window.scrollTo(0, previousScroll);
  pointerStart = null;
  ignoreClick = false;
  selectCase(presentedCase, true);
  previousFocus?.focus({ preventScroll: true });
}
document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openPresentation(Number(button.dataset.open))));
document.getElementById('show-works').addEventListener('click', () => openPresentation(currentCase));
document.getElementById('close-presentation').addEventListener('click', closePresentation);
presentTabs.forEach(tab => tab.addEventListener('click', () => presentCase(Number(tab.dataset.present))));
dialog.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closePresentation(); return; }
  if (event.key === 'Tab') {
    const buttons = [...dialog.querySelectorAll('button:not([disabled])')];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    return;
  }
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  presentCase(Math.max(0, Math.min(cases.length - 1, presentedCase + (event.key === 'ArrowRight' ? 1 : -1))));
});
const imageButton = document.getElementById('presentation-image-button');
imageButton.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  ignoreClick = false;
  pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  imageButton.setPointerCapture(event.pointerId);
});
imageButton.addEventListener('pointerup', event => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
    ignoreClick = true;
    presentCase(Math.max(0, Math.min(cases.length - 1, presentedCase + (dx < 0 ? 1 : -1))));
  }
});
imageButton.addEventListener('pointercancel', () => { pointerStart = null; });
imageButton.addEventListener('click', () => {
  if (ignoreClick) { ignoreClick = false; return; }
  closePresentation();
});
