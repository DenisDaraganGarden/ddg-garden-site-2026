import {bookContent} from './content/book-content.js?v=20261011-english1';

// The printed book and its accessible description share one content source.
const position = document.querySelector('#reader-position');
const description = document.querySelector('#reader-description');
const canvas = document.querySelector('#book-canvas');
let lastConfirmed = '';
function update(state) {
  if (!state || !document.body.classList.contains('reader')) return;
  const en = state.language === 'en';
  const previous = document.querySelector('#previous');
  const next = document.querySelector('#turn');
  previous.disabled = !state.canPrevious;
  next.disabled = !state.canNext;
  previous.setAttribute('aria-label', en ? 'Previous page' : 'Предыдущая страница');
  next.setAttribute('aria-label', state.view === 'cover' ? en ? 'Open book' : 'Открыть книгу' : en ? 'Next page' : 'Следующая страница');
  next.textContent = state.view === 'cover' ? en ? 'Open' : 'Открыть' : '→';
  canvas.setAttribute('aria-label', en ? 'Portfolio book. Swipe horizontally or use the page buttons. Tap an image to inspect it.' : 'Книга работ. Листайте горизонтальным движением или кнопками. Нажмите на изображение, чтобы рассмотреть.');
  const nav = document.querySelector('.page-navigation');
  nav.setAttribute('aria-label', en ? 'Book navigation' : 'Перелистывание книги');
  const opening = bookContent.spreads[state.opening];
  const chapter = bookContent.chapters.find(item => item.id === opening?.chapter);
  const title = (en ? chapter?.title_en : chapter?.title) || '';
  const label = state.view === 'cover' ? en ? 'Cover' : 'Обложка'
    : state.view === 'face' ? `${state.opening * 2 + (state.face === 'right' ? 2 : 1)} / ${state.totalOpenings * 2}`
    : `${state.opening + 1} / ${state.totalOpenings}`;
  position.textContent = label;
  position.setAttribute('aria-label', state.view === 'cover' ? label : `${en ? state.view === 'face' ? 'Page' : 'Spread' : state.view === 'face' ? 'Страница' : 'Разворот'} ${label}. ${title}`);
  // Announce completed positions only; loading and animation must stay quiet.
  if (state.ready && !state.busy && !state.overlay) {
    const confirmed = `${state.view}:${state.opening}:${opening?.id}:${state.face}:${state.language}`;
    if (confirmed !== lastConfirmed) {
      lastConfirmed = confirmed;
      description.textContent = state.view === 'cover' ? `Denis Daragan. ${en ? 'Portfolio. Cover.' : 'Книга работ. Обложка.'}` : `${title}. ${position.getAttribute('aria-label')}${chapter?.credit ? `. ${en ? chapter.credit_en || chapter.credit : chapter.credit}` : ''}`;
    }
  }
}
document.addEventListener('book-reader-state', event => update(event.detail));
if (window.bookReader) update(window.bookReader.getState());
