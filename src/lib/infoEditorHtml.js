export const MARK_ATTR = 'data-mark';
export const MARKS = ['handwriting', 'marker', 'faded'];

export const DEFAULT_INFO_EDITOR_HTML_BY_LANGUAGE = {
  ru: `
<div>
  СОВЕРШЕННО СЕКРЕТНО<br><br>
  МЕМОРАНДУМ ДЛЯ: ФАЙЛА КЛИЕНТА<br>
  ДАТА: 23 НОЯБРЯ 2026<br>
  ТЕМА: ОПИСАНИЕ ПОРТФОЛИО-ПРОДУКТА<br><br>
  Этот документ фиксирует авторскую позицию бюро и задаёт способ, которым должна
  быть показана каждая ландшафтная работа. Интерфейс должен читаться как найденный
  архивный лист, а не как отполированная презентация.<br><br>
  Страница должна сохранять напряжение между ясностью и сокрытием. Отдельные
  фрагменты могут быть <span data-mark="marker">изъяты из прямого чтения</span>, а ключевые
  формулировки могут оставаться <span data-mark="faded">как будто выжженными в бумаге</span>
  и нести ощущение возраста, трения и многократного прикосновения.<br><br>
  <span data-mark="handwriting">оставить место для заметок / штампов / помех</span>
</div>
`.trim(),
  en: `
<div>
  TOP SECRET<br><br>
  MEMORANDUM FOR: CLIENT FILE<br>
  DATE: NOVEMBER 23, 2026<br>
  SUBJECT: PORTFOLIO PRODUCT BRIEF<br><br>
  This memorandum records the core authorial position of the bureau and outlines the
  way each landscape work should be presented. The interface is intended to read as a
  recovered document, not a polished brochure.<br><br>
  The page must preserve the tension between clarity and concealment. Portions may be
  <span data-mark="marker">withheld from the casual reader</span>, while key phrases can remain
  <span data-mark="faded">partially burned into the page</span> and carry the feeling of age,
  friction and repeated handling.<br><br>
  <span data-mark="handwriting">leave room for notes / stamps / interference</span>
</div>
`.trim(),
};

export function getDefaultInfoEditorHtml(language = 'ru') {
  return DEFAULT_INFO_EDITOR_HTML_BY_LANGUAGE[language] ?? DEFAULT_INFO_EDITOR_HTML_BY_LANGUAGE.ru;
}

export const DEFAULT_PAPER_SETTINGS = {
  brightness: 96,
  grain: 14,
  vignette: 8,
  creases: 12,
  dirt: 8,
  textScale: 0.98,
  tone: 0,
  inkFade: 18,
  inkBleed: 10,
};

export function createDefaultInfoEditorDocument(language = 'ru') {
  return {
    version: 2,
    contentHtml: getDefaultInfoEditorHtml(language),
    paperSettings: { ...DEFAULT_PAPER_SETTINGS },
    overlays: [],
    updatedAt: new Date().toISOString(),
  };
}

function isElement(node) {
  return node?.nodeType === Node.ELEMENT_NODE;
}

function isBlockElement(node) {
  return isElement(node) && (node.tagName === 'DIV' || node.tagName === 'P');
}

export function isMarkElement(node, mark) {
  return isElement(node) && node.tagName === 'SPAN' && MARKS.includes(node.getAttribute(MARK_ATTR)) && (!mark || node.getAttribute(MARK_ATTR) === mark);
}

export function findClosestMark(node, mark) {
  let current = node?.nodeType === Node.TEXT_NODE ? node.parentNode : node;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    if (isMarkElement(current, mark)) {
      return current;
    }
    current = current.parentNode;
  }

  return null;
}

export function createMarkElement(documentRef, mark) {
  const span = documentRef.createElement('span');
  span.setAttribute(MARK_ATTR, mark);
  return span;
}

export function unwrapElement(element) {
  if (!element?.parentNode) {
    return;
  }

  const parent = element.parentNode;
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function sanitizeMarkElement(span) {
  const mark = span.classList.contains('handwriting')
    ? 'handwriting'
    : span.classList.contains('redacted')
      ? 'marker'
      : span.classList.contains('faded-copy')
        ? 'faded'
      : span.getAttribute(MARK_ATTR);

  if (!MARKS.includes(mark)) {
    unwrapElement(span);
    return;
  }

  const attributes = Array.from(span.attributes);
  for (const attribute of attributes) {
    if (attribute.name !== MARK_ATTR) {
      span.removeAttribute(attribute.name);
    }
  }

  span.setAttribute(MARK_ATTR, mark);
}

function mergeAdjacentMarks(root) {
  let didMerge = true;

  while (didMerge) {
    didMerge = false;
    const spans = root.querySelectorAll(`span[${MARK_ATTR}]`);

    for (const span of spans) {
      const next = span.nextSibling;
      if (isMarkElement(next) && next.getAttribute(MARK_ATTR) === span.getAttribute(MARK_ATTR)) {
        while (next.firstChild) {
          span.appendChild(next.firstChild);
        }
        next.remove();
        didMerge = true;
      }
    }
  }
}

function removeEmptyMarks(root) {
  const spans = Array.from(root.querySelectorAll(`span[${MARK_ATTR}]`));
  for (const span of spans) {
    const hasVisibleText = span.textContent?.length > 0;
    const hasBreak = span.querySelector('br');
    if (!hasVisibleText && !hasBreak) {
      span.remove();
    }
  }
}

function unwrapNestedMarks(root) {
  const spans = Array.from(root.querySelectorAll(`span[${MARK_ATTR}] span[${MARK_ATTR}]`));
  for (const span of spans) {
    const parentMark = span.parentElement?.getAttribute(MARK_ATTR);
    const mark = span.getAttribute(MARK_ATTR);
    if (parentMark === mark) {
      unwrapElement(span);
    }
  }
}

function sanitizeTree(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const elements = [];

  while (walker.nextNode()) {
    elements.push(walker.currentNode);
  }

  for (const element of elements) {
    if (element === root) {
      continue;
    }

    if (element.tagName === 'SPAN') {
      sanitizeMarkElement(element);
      continue;
    }

    if (element.tagName === 'BR') {
      continue;
    }

    if (isBlockElement(element)) {
      element.removeAttribute('class');
      element.removeAttribute('style');
      continue;
    }

    unwrapElement(element);
  }
}

function wrapLooseRootNodes(root) {
  const childNodes = Array.from(root.childNodes);
  let block = null;

  for (const node of childNodes) {
    if (node.nodeType === Node.COMMENT_NODE) {
      continue;
    }

    if (isBlockElement(node)) {
      block = null;
      continue;
    }

    if (!block) {
      block = root.ownerDocument.createElement('div');
      root.insertBefore(block, node);
    }

    block.appendChild(node);
  }
}

function normalizeBlocks(root) {
  const blocks = Array.from(root.childNodes).filter((node) => isBlockElement(node));

  for (const block of blocks) {
    if (!block.textContent?.length && !block.querySelector('br') && !block.querySelector(`span[${MARK_ATTR}]`)) {
      block.appendChild(root.ownerDocument.createElement('br'));
    }
  }

  if (!blocks.length) {
    const emptyBlock = root.ownerDocument.createElement('div');
    emptyBlock.appendChild(root.ownerDocument.createElement('br'));
    root.appendChild(emptyBlock);
  }
}

export function normalizeEditorRoot(root) {
  if (!root) {
    return '';
  }

  sanitizeTree(root);
  wrapLooseRootNodes(root);
  unwrapNestedMarks(root);
  removeEmptyMarks(root);
  mergeAdjacentMarks(root);
  normalizeBlocks(root);
  return root.innerHTML;
}

export function normalizeHtmlString(html, fallbackHtml = getDefaultInfoEditorHtml()) {
  const container = document.createElement('div');
  container.innerHTML = html || fallbackHtml;
  return normalizeEditorRoot(container);
}

export function getMarkState(root, range) {
  if (!root || !range) {
    return { handwriting: false, marker: false, faded: false, hasSelection: false, isCollapsed: true };
  }

  const hasSelection = !range.collapsed;

  if (range.collapsed) {
    return {
      handwriting: Boolean(findClosestMark(range.startContainer, 'handwriting')),
      marker: Boolean(findClosestMark(range.startContainer, 'marker')),
      faded: Boolean(findClosestMark(range.startContainer, 'faded')),
      hasSelection,
      isCollapsed: true,
    };
  }

  const textNodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeValue?.length && range.intersectsNode(node)) {
      textNodes.push(node);
    }
  }

  return {
    handwriting: textNodes.length > 0 && textNodes.every((node) => Boolean(findClosestMark(node, 'handwriting'))),
    marker: textNodes.length > 0 && textNodes.every((node) => Boolean(findClosestMark(node, 'marker'))),
    faded: textNodes.length > 0 && textNodes.every((node) => Boolean(findClosestMark(node, 'faded'))),
    hasSelection,
    isCollapsed: false,
  };
}
