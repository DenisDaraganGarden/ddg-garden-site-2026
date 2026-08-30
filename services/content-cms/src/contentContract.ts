export type LocalizedText = { en?: string | null; ru?: string | null } | string | null | undefined

export type PopulatedMedia = {
  isPublic?: boolean
  url?: string | null
  sizes?: { large?: { url?: string | null } | null } | null
} | number | string | null | undefined

export type ManifestProject = {
  id: string
  slug: string
  year: string
  fileCode: string
  category: string
  title: { ru: string; en: string }
  location: { ru: string; en: string }
  collaboration?: { ru: string; en: string }
  coordinates: { lat: number; lng: number } | null
  images?: string[]
  theme?: string
  status: 'placeholder' | 'published'
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const nonEmptyString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
)

export const normalizePublicOrigin = (value: string, requireHTTPS = false): string => {
  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol)
    || (requireHTTPS && url.protocol !== 'https:')
    || url.username
    || url.password
  ) {
    throw new Error(
      requireHTTPS
        ? 'PUBLIC_MEDIA_ORIGIN must be an HTTPS origin without credentials in production.'
        : 'PUBLIC_MEDIA_ORIGIN must be an HTTP(S) origin without credentials.',
    )
  }

  return `${url.origin}/`
}

export const requiredLocalized = (value: LocalizedText, fieldName: string) => {
  if (typeof value === 'string') {
    const text = nonEmptyString(value)
    if (text) return { ru: text, en: text }
  }

  if (value && typeof value === 'object') {
    const ru = nonEmptyString(value.ru) || nonEmptyString(value.en)
    const en = nonEmptyString(value.en) || nonEmptyString(value.ru)
    if (ru && en) return { ru, en }
  }

  throw new Error(`Published project is missing ${fieldName}.`)
}

export const optionalLocalized = (value: LocalizedText) => {
  if (!value) return undefined
  if (typeof value === 'string') {
    const text = nonEmptyString(value)
    return text ? { ru: text, en: text } : undefined
  }

  const ru = nonEmptyString(value.ru) || nonEmptyString(value.en)
  const en = nonEmptyString(value.en) || nonEmptyString(value.ru)
  return ru && en ? { ru, en } : undefined
}

export const toPublicAssetPath = (media: PopulatedMedia, mediaOrigin: string): string | null => {
  if (!media || typeof media !== 'object' || media.isPublic !== true) return null

  const rawURL = media.sizes?.large?.url || media.url
  if (!rawURL) return null

  try {
    const url = new URL(rawURL, normalizePublicOrigin(mediaOrigin))
    if (!['http:', 'https:'].includes(url.protocol) || !url.pathname.startsWith('/api/media/file/')) {
      return null
    }

    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

const requiredString = (value: unknown, fieldName: string): string => {
  const text = nonEmptyString(value)
  if (!text) throw new Error(`Published project is missing ${fieldName}.`)
  return text
}

const coordinatesOrNull = (value: unknown): ManifestProject['coordinates'] => {
  if (!value || typeof value !== 'object') return null

  const { lat, lng } = value as { lat?: unknown; lng?: unknown }
  if (
    typeof lat !== 'number'
    || typeof lng !== 'number'
    || !Number.isFinite(lat)
    || !Number.isFinite(lng)
    || lat < -90
    || lat > 90
    || lng < -180
    || lng > 180
  ) return null

  return { lat, lng }
}

export const serializePortfolioProject = (
  source: Record<string, unknown>,
  mediaOrigin: string,
): { droppedMediaCount: number; project: ManifestProject } => {
  const slug = requiredString(source.slug, 'slug')
  if (!SLUG_PATTERN.test(slug)) throw new Error(`Published project has an invalid slug: ${slug}`)

  const year = requiredString(source.year, 'year')
  if (!/^\d{4}$/.test(year)) throw new Error(`Published project has an invalid year: ${year}`)

  const imageRows = Array.isArray(source.images) ? source.images : []
  const imagePaths = imageRows
    .map((row) => (
      row && typeof row === 'object'
        ? toPublicAssetPath((row as { image?: PopulatedMedia }).image, mediaOrigin)
        : null
    ))
    .filter((path): path is string => Boolean(path))
  const collaboration = optionalLocalized(source.collaboration as LocalizedText)
  const theme = nonEmptyString(source.theme)

  return {
    droppedMediaCount: imageRows.length - imagePaths.length,
    project: {
      id: slug,
      slug,
      year,
      fileCode: requiredString(source.fileCode, 'fileCode'),
      category: requiredString(source.category, 'category'),
      title: requiredLocalized(source.title as LocalizedText, 'title'),
      location: requiredLocalized(source.location as LocalizedText, 'location'),
      ...(collaboration ? { collaboration } : {}),
      coordinates: coordinatesOrNull(source.coordinates),
      ...(imagePaths.length ? { images: imagePaths } : {}),
      ...(theme ? { theme } : {}),
      status: source.isPlaceholder ? 'placeholder' : 'published',
    },
  }
}
