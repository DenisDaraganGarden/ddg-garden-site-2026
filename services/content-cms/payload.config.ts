import { postgresAdapter } from '@payloadcms/db-postgres'
import { en } from '@payloadcms/translations/languages/en'
import { ru } from '@payloadcms/translations/languages/ru'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Media } from './src/collections/Media'
import { Projects } from './src/collections/Projects'
import { Tags } from './src/collections/Tags'
import { Users } from './src/collections/Users'
import { normalizePublicOrigin } from './src/contentContract'
import { healthEndpoint, portfolioManifestEndpoint } from './src/endpoints/portfolioManifest'
import { migrations } from './src/migrations'

const databaseURL = process.env.DATABASE_URL
const payloadSecret = process.env.PAYLOAD_SECRET
const production = process.env.NODE_ENV === 'production'

const requiredOrigin = (name: string, value: string | undefined): string => {
  if (!value) throw new Error(`${name} is required.`)

  const url = new URL(value)
  if (
    !['http:', 'https:'].includes(url.protocol)
    || (production && url.protocol !== 'https:')
    || url.username
    || url.password
  ) throw new Error(`${name} must be a valid${production ? ' HTTPS' : ' HTTP(S)'} origin.`)

  return url.origin
}

if (!databaseURL) throw new Error('DATABASE_URL is required.')
if (!payloadSecret || payloadSecret.length < 48 || payloadSecret.startsWith('CHANGE_ME')) {
  throw new Error('PAYLOAD_SECRET must contain at least 48 random characters.')
}

const payloadPublicServerURL = requiredOrigin('PAYLOAD_PUBLIC_SERVER_URL', process.env.PAYLOAD_PUBLIC_SERVER_URL)
normalizePublicOrigin(requiredOrigin('PUBLIC_MEDIA_ORIGIN', process.env.PUBLIC_MEDIA_ORIGIN), production)
const siteOrigin = requiredOrigin('SITE_ORIGIN', process.env.SITE_ORIGIN)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: process.cwd(),
    },
  },
  collections: [Users, Media, Tags, Projects],
  cors: [siteOrigin],
  csrf: [payloadPublicServerURL],
  db: postgresAdapter({
    pool: { connectionString: databaseURL },
    push: process.env.NODE_ENV !== 'production',
    migrationDir: `${process.cwd()}/src/migrations`,
    prodMigrations: migrations,
  }),
  endpoints: [portfolioManifestEndpoint, healthEndpoint],
  graphQL: {
    disable: true,
  },
  i18n: {
    fallbackLanguage: 'en',
    supportedLanguages: { en, ru },
  },
  localization: {
    defaultLocale: 'ru',
    fallback: true,
    locales: [
      { code: 'ru', label: 'Русский', fallbackLocale: 'en' },
      { code: 'en', label: 'English', fallbackLocale: 'ru' },
    ],
  },
  maxDepth: 2,
  routes: {
    admin: '/admin',
    api: '/api',
  },
  secret: payloadSecret,
  serverURL: payloadPublicServerURL,
  sharp,
  telemetry: false,
  upload: {
    limits: {
      fileSize: 50 * 1024 * 1024,
    },
  },
})
