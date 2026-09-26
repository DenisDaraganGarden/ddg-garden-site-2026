import type { CollectionBeforeChangeHook } from 'payload'

type MediaReference = number | string | { id?: number | string } | null | undefined

const mediaID = (value: MediaReference) => (
  value && typeof value === 'object' ? value.id : value
)

const assertMIMEType = async (
  media: MediaReference,
  requiredPrefix: string,
  req: Parameters<CollectionBeforeChangeHook>[0]['req'],
  requirePublic: boolean,
) => {
  const id = mediaID(media)
  if (!id) throw new Error('У проекта есть строка медиа без выбранного файла.')

  const document = await req.payload.findByID({
    collection: 'media',
    id,
    overrideAccess: true,
  })
  if (!document?.mimeType?.startsWith(requiredPrefix)) {
    throw new Error(`Для этого поля разрешены только файлы ${requiredPrefix}*.`)
  }
  if (requirePublic && document.isPublic !== true) {
    throw new Error('Перед публикацией проекта разрешите публичную выдачу всех выбранных файлов.')
  }
}

export const validateProjectMedia: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const images = data.images ?? originalDoc?.images ?? []
  const videos = data.videos ?? originalDoc?.videos ?? []
  const requirePublic = (data._status ?? originalDoc?._status) === 'published'

  await Promise.all([
    ...images.map((row: { image?: MediaReference }) => assertMIMEType(row.image, 'image/', req, requirePublic)),
    ...videos.flatMap((row: { video?: MediaReference; poster?: MediaReference }) => [
      assertMIMEType(row.video, 'video/', req, requirePublic),
      ...(row.poster ? [assertMIMEType(row.poster, 'image/', req, requirePublic)] : []),
    ]),
  ])

  return data
}
