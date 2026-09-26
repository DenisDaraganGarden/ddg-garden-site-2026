import { createHash } from 'node:crypto'
import { headersWithCors, type Endpoint } from 'payload'
import { normalizePublicOrigin, serializePortfolioProject } from '../contentContract'

export const portfolioManifestEndpoint: Endpoint = {
  path: '/portfolio-manifest',
  method: 'get',
  handler: async (req) => {
    const configuredMediaOrigin = process.env.PUBLIC_MEDIA_ORIGIN
    if (!configuredMediaOrigin) {
      return Response.json({ error: 'Content service is not configured.' }, { status: 503 })
    }

    let mediaOrigin: string
    try {
      mediaOrigin = normalizePublicOrigin(configuredMediaOrigin, process.env.NODE_ENV === 'production')
    } catch (error) {
      req.payload.logger.error(error, 'PUBLIC_MEDIA_ORIGIN is invalid.')
      return Response.json({ error: 'Content service is not configured.' }, { status: 503 })
    }

    const { docs } = await req.payload.find({
      collection: 'projects',
      depth: 2,
      locale: 'all',
      limit: 1000,
      overrideAccess: false,
      sort: 'sortOrder',
      where: {
        and: [
          { _status: { equals: 'published' } },
          { displayInPortfolio: { equals: true } },
        ],
      },
    })

    try {
      const sortedDocs = [...docs].sort((left, right) => {
        const order = Number(left.sortOrder ?? 100) - Number(right.sortOrder ?? 100)
        if (order !== 0) return order
        return String(left.slug ?? '').localeCompare(String(right.slug ?? ''), 'en')
      })
      const projects = sortedDocs.flatMap((source) => {
        try {
          const result = serializePortfolioProject({ ...source }, mediaOrigin)
          if (result.droppedMediaCount > 0) {
            req.payload.logger.warn(
              { droppedMediaCount: result.droppedMediaCount, slug: result.project.slug },
              'Unavailable media was omitted from the public portfolio manifest.',
            )
          }
          return [result.project]
        } catch (error) {
          req.payload.logger.error(
            { err: error, projectID: source.id, slug: source.slug },
            'One invalid project was omitted from the public portfolio manifest.',
          )
          return []
        }
      })

      if (projects.length === 0) {
        return Response.json({ error: 'No complete published projects are available.' }, { status: 503 })
      }

      const newestPublishedAt = docs.reduce((latest, project) => {
        const value = typeof project.updatedAt === 'string' ? project.updatedAt : ''
        return value > latest ? value : latest
      }, '1970-01-01T00:00:00.000Z')
      const bodyWithoutRevision = {
        schemaVersion: 1,
        publishedAt: newestPublishedAt,
        assetBaseUrl: mediaOrigin,
        projects,
      }
      const revision = createHash('sha256')
        .update(JSON.stringify({ schemaVersion: 1, assetBaseUrl: mediaOrigin, projects }))
        .digest('hex')

      return Response.json(
        { ...bodyWithoutRevision, revision },
        {
          headers: headersWithCors({ headers: new Headers({ 'Cache-Control': 'public, max-age=60' }), req }),
        },
      )
    } catch (error) {
      req.payload.logger.error(error, 'Portfolio manifest could not be built.')
      return Response.json({ error: 'Published content is incomplete.' }, { status: 503 })
    }
  },
}

export const healthEndpoint: Endpoint = {
  path: '/health',
  method: 'get',
  handler: async (req) => Response.json(
    { ok: true, service: 'ddg-content-cms' },
    { headers: headersWithCors({ headers: new Headers({ 'Cache-Control': 'no-store' }), req }) },
  ),
}
