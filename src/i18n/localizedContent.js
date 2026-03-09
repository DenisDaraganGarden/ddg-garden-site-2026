export const SUPPORTED_LANGUAGES = ['ru', 'en'];
export const DEFAULT_LANGUAGE = 'ru';

export function createLocalizedText(ru, en = ru) {
  return {
    ru: String(ru ?? ''),
    en: String(en ?? ru ?? ''),
  };
}

export function normalizeLocalizedText(value, fallback = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const ru = typeof value.ru === 'string' ? value.ru : '';
    const en = typeof value.en === 'string' ? value.en : '';
    const fallbackText = String(fallback ?? '');
    const resolvedRu = ru || en || fallbackText;
    const resolvedEn = en || ru || fallbackText;

    return {
      ru: resolvedRu,
      en: resolvedEn,
    };
  }

  const text = typeof value === 'string' ? value : String(fallback ?? '');
  return createLocalizedText(text, text);
}

export function getLocalizedText(value, language = DEFAULT_LANGUAGE, fallback = '') {
  const localized = normalizeLocalizedText(value, fallback);
  return localized[language] || localized[DEFAULT_LANGUAGE] || localized.ru || localized.en || String(fallback ?? '');
}

export function updateLocalizedText(currentValue, language, nextValue) {
  const normalized = normalizeLocalizedText(currentValue);
  return {
    ...normalized,
    [language]: String(nextValue ?? ''),
  };
}

export function createLocalizedSheetLabel(index) {
  const labelNumber = String(index + 1).padStart(2, '0');
  return createLocalizedText(`Лист ${labelNumber}`, `Sheet ${labelNumber}`);
}

export function getOtherLanguage(language) {
  return language === 'ru' ? 'en' : 'ru';
}
