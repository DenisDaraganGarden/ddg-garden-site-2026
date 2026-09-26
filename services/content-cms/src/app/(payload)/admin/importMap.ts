import type { ImportMap } from 'payload'
import { CollectionCards } from '@payloadcms/next/rsc'

// Карта плоская: ключ вида "<пакет>#<экспорт>" → сам компонент. Обёртка
// { baseDir, importMap } здесь не работает — RootLayout ищет ключи на верхнем
// уровне и молча теряет дашборд.
//
// Единственный источник карты. `payload generate:importmap` пишет соседний
// `importMap.js`, но layout импортирует путь без расширения, и .ts выигрывает
// при резолве. Добавили свой компонент в конфиг — прогнать генератор и
// перенести новые строки сюда, сгенерированный .js не оставлять.
export const importMap: ImportMap = {
  '@payloadcms/next/rsc#CollectionCards': CollectionCards,
}
