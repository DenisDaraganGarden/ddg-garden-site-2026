import type { CollectionConfig } from 'payload'
import { adminOnly, authenticated, authenticatedOrPublished } from '../access'
import { SLUG_PATTERN } from '../contentContract'
import { validateProjectMedia } from './projectMediaValidation'

const localizedText = (name: string, label: string, required = false) => ({
  name,
  type: 'text' as const,
  label,
  localized: true,
  required,
})

export const Projects: CollectionConfig = {
  slug: 'projects',
  labels: { singular: 'Проект', plural: 'Проекты' },
  admin: {
    group: 'Контент',
    useAsTitle: 'slug',
    defaultColumns: ['slug', 'fileCode', 'category', '_status', 'sortOrder', 'updatedAt'],
    listSearchableFields: ['slug', 'fileCode', 'title', 'location'],
  },
  access: {
    create: authenticated,
    delete: adminOnly,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  hooks: {
    beforeChange: [validateProjectMedia],
  },
  versions: {
    maxPerDoc: 100,
    drafts: {
      autosave: { interval: 8000 },
      schedulePublish: true,
      validate: true,
    },
  },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'slug',
          type: 'text',
          label: 'Адрес проекта',
          required: true,
          unique: true,
          index: true,
          admin: { width: '50%', description: 'Например: moscow-golf-club-raevo' },
          validate: (value: unknown) => (
            typeof value === 'string' && SLUG_PATTERN.test(value)
              ? true
              : 'Используйте только строчные латинские буквы, цифры и дефисы.'
          ),
        },
        {
          name: 'fileCode',
          type: 'text',
          label: 'Код проекта',
          required: true,
          admin: { width: '25%' },
        },
        {
          name: 'year',
          type: 'text',
          label: 'Год',
          required: true,
          admin: { width: '25%' },
          validate: (value: unknown) => /^\d{4}$/.test(String(value)) || 'Введите год из четырёх цифр.',
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'category',
          type: 'select',
          label: 'Категория',
          required: true,
          options: [
            { label: 'Парки', value: 'parks' },
            { label: 'Резиденции', value: 'residences' },
            { label: 'Все / служебное', value: 'all' },
          ],
          admin: { width: '40%' },
        },
        {
          name: 'theme',
          type: 'select',
          label: 'Визуальная тема',
          options: [
            { label: 'Elite', value: 'elite' },
            { label: 'Panorama', value: 'panorama' },
            { label: 'Noir', value: 'noir' },
            { label: 'Magazine', value: 'magazine' },
          ],
          admin: { width: '30%' },
        },
        {
          name: 'sortOrder',
          type: 'number',
          label: 'Порядок',
          defaultValue: 100,
          required: true,
          index: true,
          admin: { width: '30%', description: 'Меньшее число показывается выше.' },
        },
      ],
    },
    {
      type: 'group',
      label: 'Тексты (RU / EN)',
      fields: [
        localizedText('title', 'Название', true),
        localizedText('location', 'Место', true),
        localizedText('collaboration', 'Сотрудничество'),
      ],
    },
    {
      name: 'coordinates',
      type: 'group',
      label: 'Координаты для карты',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'lat', type: 'number', label: 'Широта', min: -90, max: 90, admin: { width: '50%' } },
            { name: 'lng', type: 'number', label: 'Долгота', min: -180, max: 180, admin: { width: '50%' } },
          ],
        },
      ],
    },
    {
      name: 'images',
      type: 'array',
      label: 'Изображения в порядке показа',
      minRows: 0,
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
          filterOptions: {
            mimeType: { contains: 'image/' },
          },
        },
      ],
    },
    {
      name: 'videos',
      type: 'array',
      label: 'Видео в порядке показа',
      minRows: 0,
      fields: [
        {
          name: 'video',
          type: 'upload',
          relationTo: 'media',
          required: true,
          filterOptions: {
            mimeType: { contains: 'video/' },
          },
        },
        {
          name: 'poster',
          type: 'upload',
          relationTo: 'media',
          filterOptions: {
            mimeType: { contains: 'image/' },
          },
        },
        localizedText('caption', 'Подпись к видео'),
      ],
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      label: 'Теги',
    },
    {
      type: 'row',
      fields: [
        {
          name: 'displayInPortfolio',
          type: 'checkbox',
          label: 'Показывать в портфолио',
          defaultValue: true,
          admin: { width: '33%' },
        },
        {
          name: 'displayOnMap',
          type: 'checkbox',
          label: 'Показывать на карте',
          defaultValue: true,
          admin: { width: '33%' },
        },
        {
          name: 'isPlaceholder',
          type: 'checkbox',
          label: 'Служебная карточка',
          defaultValue: false,
          admin: { width: '33%', description: 'В манифесте получит статус placeholder.' },
        },
      ],
    },
  ],
}
