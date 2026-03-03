import { createMarkElement, findClosestMark, getMarkState, isMarkElement, normalizeEditorRoot, unwrapElement } from './infoEditorHtml';

function selectionWithin(root) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const ancestor = range.commonAncestorContainer;

  if (!root.contains(ancestor)) {
    return null;
  }

  return range;
}

function insertMarkers(range) {
  const startMarker = document.createComment('info-editor-start');
  const endMarker = document.createComment('info-editor-end');

  const endRange = range.cloneRange();
  endRange.collapse(false);
  endRange.insertNode(endMarker);

  const startRange = range.cloneRange();
  startRange.collapse(true);
  startRange.insertNode(startMarker);

  return { startMarker, endMarker };
}

function removeMarkers(startMarker, endMarker) {
  startMarker?.remove();
  endMarker?.remove();
}

function restoreSelection(startMarker, endMarker) {
  const selection = window.getSelection();
  if (!selection || !startMarker?.parentNode || !endMarker?.parentNode) {
    return null;
  }

  const range = document.createRange();
  range.setStartAfter(startMarker);
  range.setEndBefore(endMarker);
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

function getNodesBetweenMarkers(root, startMarker, endMarker, filterFn) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
  const nodes = [];
  let collecting = false;

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (node === startMarker) {
      collecting = true;
      continue;
    }

    if (node === endMarker) {
      break;
    }

    if (collecting && (!filterFn || filterFn(node))) {
      nodes.push(node);
    }
  }

  return nodes;
}

function getTextNodesBetweenMarkers(root, startMarker, endMarker) {
  return getNodesBetweenMarkers(
    root,
    startMarker,
    endMarker,
    (node) => node.nodeType === Node.TEXT_NODE && node.nodeValue?.length,
  );
}

function getTouchingMarkElements(root, startMarker, endMarker, mark) {
  const nodes = getTextNodesBetweenMarkers(root, startMarker, endMarker);
  const elements = new Set();

  if (!nodes.length) {
    let current = startMarker.parentNode;
    while (current && current !== root) {
      if (isMarkElement(current, mark)) {
        elements.add(current);
      }
      current = current.parentNode;
    }
    return [...elements];
  }

  for (const node of nodes) {
    const target = findClosestMark(node, mark);
    if (target) {
      elements.add(target);
    }
  }

  return [...elements];
}

function unwrapMarks(elements) {
  const sorted = [...elements].sort((left, right) => {
    const leftDepth = depthOf(left);
    const rightDepth = depthOf(right);
    return rightDepth - leftDepth;
  });

  for (const element of sorted) {
    unwrapElement(element);
  }
}

function depthOf(node) {
  let depth = 0;
  let current = node;
  while (current?.parentNode) {
    depth += 1;
    current = current.parentNode;
  }
  return depth;
}

function wrapTextNodes(textNodes, mark) {
  for (const node of textNodes) {
    if (!node.parentNode || !node.nodeValue?.length) {
      continue;
    }

    if (findClosestMark(node, mark)) {
      continue;
    }

    const markNode = createMarkElement(node.ownerDocument, mark);
    node.parentNode.insertBefore(markNode, node);
    markNode.appendChild(node);
  }
}

export function normalizeEditorWithSelection(root) {
  const range = selectionWithin(root);

  if (!range) {
    normalizeEditorRoot(root);
    return null;
  }

  const { startMarker, endMarker } = insertMarkers(range);
  normalizeEditorRoot(root);
  const restoredRange = restoreSelection(startMarker, endMarker);
  removeMarkers(startMarker, endMarker);
  return restoredRange;
}

export function getEditorSelectionState(root) {
  const range = selectionWithin(root);
  return getMarkState(root, range);
}

export function clearMarks(root) {
  const range = selectionWithin(root);
  if (!range) {
    return false;
  }

  const { startMarker, endMarker } = insertMarkers(range);
  const markElements = getTouchingMarkElements(root, startMarker, endMarker);

  if (!markElements.length) {
    restoreSelection(startMarker, endMarker);
    removeMarkers(startMarker, endMarker);
    return false;
  }

  unwrapMarks(markElements);
  normalizeEditorRoot(root);
  restoreSelection(startMarker, endMarker);
  removeMarkers(startMarker, endMarker);
  return true;
}

export function toggleMark(root, mark) {
  const range = selectionWithin(root);
  if (!range) {
    return false;
  }

  const { startMarker, endMarker } = insertMarkers(range);
  const textNodes = getTextNodesBetweenMarkers(root, startMarker, endMarker);
  const allMarked = textNodes.length
    ? textNodes.every((node) => Boolean(findClosestMark(node, mark)))
    : Boolean(findClosestMark(startMarker.parentNode, mark));

  if (allMarked) {
    unwrapMarks(getTouchingMarkElements(root, startMarker, endMarker, mark));
  } else {
    unwrapMarks(getTouchingMarkElements(root, startMarker, endMarker));
    wrapTextNodes(getTextNodesBetweenMarkers(root, startMarker, endMarker), mark);
  }

  normalizeEditorRoot(root);
  restoreSelection(startMarker, endMarker);
  removeMarkers(startMarker, endMarker);
  return true;
}

export function insertPlainText(root, text) {
  const range = selectionWithin(root);
  if (!range) {
    return false;
  }

  const normalizedText = text.replace(/\r/g, '');
  const fragments = normalizedText.split('\n');
  const fragment = document.createDocumentFragment();

  fragments.forEach((line, index) => {
    if (index > 0) {
      fragment.appendChild(document.createElement('br'));
    }
    fragment.appendChild(document.createTextNode(line));
  });

  range.deleteContents();
  range.insertNode(fragment);
  range.collapse(false);

  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  normalizeEditorWithSelection(root);
  return true;
}
