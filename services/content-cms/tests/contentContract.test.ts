import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizePublicOrigin,
  optionalLocalized,
  requiredLocalized,
  serializePortfolioProject,
  toPublicAssetPath,
} from '../src/contentContract'

test('localized fields fall back to the available language', () => {
  assert.deepEqual(requiredLocalized({ ru: 'Москва' }, 'title'), { ru: 'Москва', en: 'Москва' })
  assert.deepEqual(requiredLocalized({ en: 'Moscow' }, 'title'), { ru: 'Moscow', en: 'Moscow' })
  assert.equal(optionalLocalized(null), undefined)
  assert.equal(optionalLocalized({ ru: null, en: null }), undefined)
})

test('public media becomes a schema-compatible path', () => {
  assert.equal(
    toPublicAssetPath(
      {
        isPublic: true,
        url: 'https://admin.denisdaragan.com/api/media/file/original.webp',
        sizes: { large: { url: '/api/media/file/large.webp?version=2' } },
      },
      'https://content.denisdaragan.com',
    ),
    '/api/media/file/large.webp?version=2',
  )
  assert.equal(toPublicAssetPath({ isPublic: false, url: '/api/media/file/private.webp' }, 'https://content.denisdaragan.com'), null)
  assert.equal(toPublicAssetPath({ isPublic: true, url: '/admin' }, 'https://content.denisdaragan.com'), null)
})

test('public origin is normalized and rejects credentials', () => {
  assert.equal(normalizePublicOrigin('https://content.denisdaragan.com/path'), 'https://content.denisdaragan.com/')
  assert.throws(() => normalizePublicOrigin('https://user:secret@example.com'))
  assert.throws(() => normalizePublicOrigin('http://content.denisdaragan.com', true))
})

test('one unavailable image is omitted without invalidating its project', () => {
  const { droppedMediaCount, project } = serializePortfolioProject({
    slug: 'moscow-garden',
    year: '2026',
    fileCode: 'DDG-010',
    category: 'residences',
    title: { ru: 'Сад', en: 'Garden' },
    location: { ru: 'Москва' },
    images: [
      { image: { isPublic: true, url: '/api/media/file/garden.webp' } },
      { image: { isPublic: false, url: '/api/media/file/draft.webp' } },
    ],
  }, 'https://content.denisdaragan.com')

  assert.equal(droppedMediaCount, 1)
  assert.deepEqual(project.images, ['/api/media/file/garden.webp'])
  assert.deepEqual(project.location, { ru: 'Москва', en: 'Москва' })
})

test('malformed projects are rejected individually by the serializer', () => {
  assert.throws(() => serializePortfolioProject({
    slug: 'Bad Slug',
    year: '26',
    fileCode: 'DDG-010',
    category: 'residences',
    title: { ru: 'Сад' },
    location: { ru: 'Москва' },
  }, 'https://content.denisdaragan.com'))
})
