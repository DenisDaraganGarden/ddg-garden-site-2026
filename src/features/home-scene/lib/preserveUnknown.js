// Поля, которых работающий код не знает, возвращаются в результат нормализации
// как пришли. Окно или приложение на старой версии движка открывает проект,
// который уже правила новая, и при первой правке пишет его обратно: всё, что
// нормализатор выбросил как незнакомое, пропало бы с диска (так 2026-09-25
// старый сервер стёр kind «Ростова», 7135555).
//
// Корень — запись: любой ключ, которого нет в результате, переносится, кроме
// старых, которые нормализатор сам переводит в новые (dropped). Внутри — на один
// уровень: у элементов списков с id и у словарей записей переносятся поля,
// которых нет ни у одного элемента результата, то есть незнакомые этому коду.
// Удалённое не возвращается: переносятся только поля тех элементов, что
// остались в результате, а сами элементы и ключи словарей — никогда.
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasId = (item) => isRecord(item) && (typeof item.id === 'string' || typeof item.id === 'number');

function knownFields(items) {
  const known = new Set();
  for (const item of items) if (isRecord(item)) for (const key of Object.keys(item)) known.add(key);
  return known;
}

function carryFields(source, target, known) {
  let result = target;
  for (const [key, value] of Object.entries(source)) {
    if (Object.prototype.hasOwnProperty.call(target, key) || known.has(key)) continue;
    if (result === target) result = { ...target };
    result[key] = value;
  }
  return result;
}

function carryList(input, output) {
  const byId = new Map(input.filter(hasId).map((item) => [item.id, item]));
  if (!byId.size) return output;
  const known = knownFields(output);
  let changed = false;
  const next = output.map((item) => {
    if (!hasId(item) || !byId.has(item.id)) return item;
    const carried = carryFields(byId.get(item.id), item, known);
    if (carried !== item) changed = true;
    return carried;
  });
  return changed ? next : output;
}

function carryMap(input, output) {
  const entries = Object.values(output);
  if (!entries.length || !entries.every(isRecord)) return output;
  const known = knownFields(entries);
  let result = output;
  for (const [key, entry] of Object.entries(output)) {
    if (!isRecord(input[key])) continue;
    const carried = carryFields(input[key], entry, known);
    if (carried === entry) continue;
    if (result === output) result = { ...output };
    result[key] = carried;
  }
  return result;
}

// skip — ключи, внутрь которых не заглядывать (каталоги камер живут по своим
// правилам); dropped — старые ключи, которые нормализатор уже перевёл в новые.
export function preserveUnknownFields(input, output, { skip = [], dropped = [] } = {}) {
  if (!isRecord(input) || !isRecord(output)) return output;
  const skipped = new Set(skip), gone = new Set(dropped);
  let result = output;
  const set = (key, value) => {
    if (result === output) result = { ...output };
    result[key] = value;
  };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(output, key)) {
      if (!gone.has(key)) set(key, value);
      continue;
    }
    if (skipped.has(key)) continue;
    const current = output[key];
    const next = Array.isArray(value) && Array.isArray(current) ? carryList(value, current)
      : isRecord(value) && isRecord(current) ? carryMap(value, current)
        : current;
    if (next !== current) set(key, next);
  }
  return result;
}
