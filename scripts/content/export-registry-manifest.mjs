import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { projectRegistry } from '../../src/data/projectRegistry.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(scriptDirectory, '../..');
export const outputPath = path.join(repositoryRoot, 'public/content/portfolio-manifest.json');
export const schemaPath = path.join(repositoryRoot, 'schemas/portfolio-manifest.schema.json');
export const ASSET_BASE_URL = '/';
export const SCHEMA_VERSION = 1;

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function revisionFor({ schemaVersion, publishedAt, assetBaseUrl, projects }) {
  return createHash('sha256')
    .update(stableJson({ schemaVersion, publishedAt, assetBaseUrl, projects }))
    .digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(`Portfolio manifest invalid: ${message}`);
}

export function validateRegistry(registry) {
  const ids = new Set();
  const slugs = new Set();
  for (const project of registry) {
    assert(typeof project.id === 'string' && project.id.length > 0, 'every project needs an id');
    assert(typeof project.slug === 'string' && project.slug.length > 0, `project ${project.id} needs a slug`);
    assert(!ids.has(project.id), `duplicate project id: ${project.id}`);
    assert(!slugs.has(project.slug), `duplicate project slug: ${project.slug}`);
    ids.add(project.id);
    slugs.add(project.slug);
  }
}

export function validateManifest(manifest) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'manifest must be an object');
  assert(manifest.schemaVersion === SCHEMA_VERSION, `schemaVersion must be ${SCHEMA_VERSION}`);
  assert(typeof manifest.revision === 'string' && /^[a-f0-9]{64}$/.test(manifest.revision), 'revision must be a SHA-256 hash');
  assert(typeof manifest.publishedAt === 'string' && !Number.isNaN(Date.parse(manifest.publishedAt)), 'publishedAt must be an ISO date');
  assert(typeof manifest.assetBaseUrl === 'string' && manifest.assetBaseUrl.length > 0, 'assetBaseUrl is required');
  assert(Array.isArray(manifest.projects), 'projects must be an array');
  validateRegistry(manifest.projects);
  assert(manifest.revision === revisionFor(manifest), 'revision does not match manifest contents');
}

export function createManifest(registry, publishedAt) {
  validateRegistry(registry);
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    publishedAt,
    assetBaseUrl: ASSET_BASE_URL,
    projects: registry,
  };
  const completedManifest = { ...manifest, revision: revisionFor(manifest) };
  validateManifest(completedManifest);
  return completedManifest;
}

export async function verifyLocalMediaPaths(registry, root = repositoryRoot) {
  const mediaPaths = registry.flatMap((project) => project.images ?? []);
  await Promise.all(mediaPaths.map(async (mediaPath) => {
    assert(mediaPath.startsWith('/'), `media path must begin with /: ${mediaPath}`);
    const localPath = path.join(root, 'public', mediaPath.slice(1));
    try {
      await access(localPath);
    } catch {
      throw new Error(`Portfolio manifest invalid: missing local media file: ${mediaPath}`);
    }
  }));
  return mediaPaths;
}

async function publishedAtFor(outputFile, suppliedPublishedAt) {
  if (suppliedPublishedAt) return suppliedPublishedAt;
  try {
    const previous = JSON.parse(await readFile(outputFile, 'utf8'));
    if (typeof previous.publishedAt === 'string' && previous.publishedAt) return previous.publishedAt;
  } catch {
    // The first export establishes a publication timestamp.
  }
  return new Date().toISOString();
}

export async function writeManifest({
  registry = projectRegistry,
  destination = outputPath,
  publishedAt,
} = {}) {
  const publicationTime = await publishedAtFor(destination, publishedAt);
  const manifest = createManifest(registry, publicationTime);
  await verifyLocalMediaPaths(registry);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, destination);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await writeManifest();
  process.stdout.write(`Wrote ${path.relative(repositoryRoot, outputPath)} (${manifest.revision})\n`);
}
