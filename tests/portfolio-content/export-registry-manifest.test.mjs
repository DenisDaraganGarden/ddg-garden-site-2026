import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { projectRegistry } from '../../src/data/projectRegistry.js';
import {
  createManifest,
  outputPath,
  revisionFor,
  validateManifest,
  validateRegistry,
  verifyLocalMediaPaths,
  writeManifest,
} from '../../scripts/content/export-registry-manifest.mjs';

test('registry creates a version 1 manifest with all current projects', () => {
  const manifest = createManifest(projectRegistry, '2026-08-30T00:00:00.000Z');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.projects.length, 6);
  assert.equal(manifest.assetBaseUrl, '/');
  assert.match(manifest.revision, /^[a-f0-9]{64}$/);
  assert.equal(manifest.revision, revisionFor(manifest));
  assert.doesNotThrow(() => validateManifest(manifest));
  assert.throws(
    () => validateManifest({ ...manifest, revision: '0'.repeat(64) }),
    /revision does not match/,
  );
});

test('registry ids and slugs are unique', () => {
  assert.doesNotThrow(() => validateRegistry(projectRegistry));
  assert.throws(
    () => validateRegistry([...projectRegistry, { ...projectRegistry[0] }]),
    /duplicate project id/,
  );
});

test('every registered portfolio image exists locally', async () => {
  const mediaPaths = await verifyLocalMediaPaths(projectRegistry);
  assert.equal(mediaPaths.length, 23);
});

test('generation is deterministic when publication time is fixed', async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'portfolio-manifest-'));
  const destination = path.join(temporaryDirectory, 'portfolio-manifest.json');
  const publishedAt = '2026-08-30T00:00:00.000Z';
  const first = await writeManifest({ destination, publishedAt });
  const firstBytes = await readFile(destination, 'utf8');
  const second = await writeManifest({ destination, publishedAt });
  const secondBytes = await readFile(destination, 'utf8');
  assert.deepEqual(second, first);
  assert.equal(secondBytes, firstBytes);
});

test('checked-in manifest is reproducible from the registry', async () => {
  const existing = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.deepEqual(createManifest(projectRegistry, existing.publishedAt), existing);
});
