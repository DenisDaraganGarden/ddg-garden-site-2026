import { getPayload } from 'payload'

import config from '../payload.config'

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD

if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  throw new Error('BOOTSTRAP_ADMIN_EMAIL must contain a valid email address.')
}
if (!password || password.length < 16) {
  throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 16 characters.')
}

const payload = await getPayload({ config })

try {
  const existingUsers = await payload.count({ collection: 'users', overrideAccess: true })
  if (existingUsers.totalDocs !== 0) {
    throw new Error('Bootstrap refused: the users collection is not empty.')
  }

  await payload.create({
    collection: 'users',
    data: {
      email,
      password,
      role: 'admin',
    },
    overrideAccess: true,
  })

  payload.logger.info({ email }, 'The first administrator was created by the one-shot bootstrap command.')
} finally {
  await payload.destroy()
}
