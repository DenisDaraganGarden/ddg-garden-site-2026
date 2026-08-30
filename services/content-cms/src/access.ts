import type { Access, AccessResult } from 'payload'

export const authenticated: Access = ({ req }): AccessResult => Boolean(req.user)

export const adminOnly: Access = ({ req }): AccessResult => req.user?.role === 'admin'

export const authenticatedOrPublished: Access = ({ req }): AccessResult => {
  if (req.user) return true

  return {
    _status: {
      equals: 'published',
    },
  }
}

export const publicMedia: Access = ({ req }): AccessResult => {
  if (req.user) return true

  return {
    isPublic: {
      equals: true,
    },
  }
}
