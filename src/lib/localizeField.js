export function localizeField(value, language) {
  if (!value || typeof value !== 'object') {
    return String(value ?? '');
  }

  return value[language] ?? value.ru ?? value.en ?? '';
}
