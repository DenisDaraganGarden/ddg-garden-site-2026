import type { CollectionConfig } from 'payload'
import { adminOnly, authenticated } from '../access'

export const Tags: CollectionConfig = {
  slug: 'tags',
  labels: { singular: 'Тег', plural: 'Теги' },
  admin: { group: 'Контент', useAsTitle: 'name', listSearchableFields: ['name', 'slug'] },
  access: { create: authenticated, delete: adminOnly, read: authenticated, update: authenticated },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Название',
      localized: true,
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      label: 'Код тега',
      unique: true,
      required: true,
      index: true,
      admin: { description: 'Латиница, цифры и дефисы.' },
    },
  ],
}
