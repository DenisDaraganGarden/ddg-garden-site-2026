import type { CollectionConfig } from 'payload'
import { adminOnly, authenticated, publicMedia } from '../access'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Файл', plural: 'Медиа' },
  admin: {
    group: 'Контент',
    useAsTitle: 'alt',
    listSearchableFields: ['filename', 'alt', 'caption', 'rights'],
  },
  access: {
    create: authenticated,
    delete: adminOnly,
    read: publicMedia,
    update: authenticated,
  },
  upload: {
    staticDir: process.env.UPLOAD_DIR || '/app/uploads',
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'video/mp4',
      'video/webm',
      'audio/mpeg',
      'application/pdf',
      'model/gltf-binary',
    ],
    imageSizes: [
      { name: 'thumb', width: 480, height: 480, position: 'centre' },
      { name: 'card', width: 1200, height: 900, position: 'centre' },
      { name: 'large', width: 2400, withoutEnlargement: true },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Описание изображения (alt)',
      localized: true,
    },
    {
      name: 'caption',
      type: 'textarea',
      label: 'Подпись',
      localized: true,
    },
    {
      name: 'isPublic',
      type: 'checkbox',
      label: 'Разрешить публичную выдачу этого файла',
      defaultValue: false,
      admin: {
        description: 'Включайте только для файлов опубликованного проекта.',
      },
    },
    {
      name: 'rights',
      type: 'text',
      label: 'Права и источник',
    },
  ],
}
