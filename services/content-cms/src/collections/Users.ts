import type { CollectionConfig, PayloadRequest } from 'payload'

const adminsOnly = ({ req }: { req: PayloadRequest }): boolean => req.user?.role === 'admin'
const authenticated = ({ req }: { req: PayloadRequest }): boolean => Boolean(req.user)

const adminsOrSelf = ({ req }: { req: PayloadRequest }) => {
  if (req.user?.role === 'admin') return true
  if (!req.user) return false
  return { id: { equals: req.user.id } }
}

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    tokenExpiration: 60 * 60 * 12,
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    cookies: {
      secure: true,
      sameSite: 'Lax',
    },
  },
  admin: {
    useAsTitle: 'email',
    group: 'Настройки',
  },
  access: {
    admin: authenticated,
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOrSelf,
    unlock: adminsOnly,
    update: adminsOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Имя',
    },
    {
      name: 'role',
      type: 'select',
      label: 'Роль',
      defaultValue: 'editor',
      required: true,
      saveToJWT: true,
      options: [
        { label: 'Администратор', value: 'admin' },
        { label: 'Редактор', value: 'editor' },
      ],
    },
  ],
}
