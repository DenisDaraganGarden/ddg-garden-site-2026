import assert from 'node:assert/strict';
import test from 'node:test';

import { projectRegistry } from '../../src/data/projectRegistry.js';
import {
  resolveAssetUrl,
  validatePortfolioManifest,
} from '../../src/features/portfolio-content/portfolioManifestValidation.js';

const makeManifest = (overrides = {}) => ({
  schemaVersion: 1,
  revision: 'a'.repeat(64),
  publishedAt: '2026-08-30T00:00:00.000Z',
  assetBaseUrl: '/',
  projects: projectRegistry,
  ...overrides,
});

test('root-relative asset base resolves against the current origin', () => {
  assert.equal(
    resolveAssetUrl('/portfolio/example/image.webp', '/'),
    'http://localhost/portfolio/example/image.webp',
  );
});

test('external asset base resolves media paths on the media origin', () => {
  assert.equal(
    resolveAssetUrl('/portfolio/example/image.webp', 'https://media.denisdaragan.com/assets/'),
    'https://media.denisdaragan.com/portfolio/example/image.webp',
  );
});

test('valid manifest is accepted and its media URLs are normalized', () => {
  const manifest = validatePortfolioManifest(makeManifest());
  assert.ok(manifest);
  assert.equal(manifest.projects.length, projectRegistry.length);
  assert.match(manifest.projects[0].images[0], /^http:\/\/localhost\/portfolio\//);
});

test('invalid, duplicate, or unsafe content rejects the whole release', () => {
  assert.equal(validatePortfolioManifest(makeManifest({ revision: 'not-a-hash' })), null);
  assert.equal(validatePortfolioManifest(makeManifest({ publishedAt: 'not-a-date' })), null);
  assert.equal(validatePortfolioManifest(makeManifest({
    projects: [...projectRegistry, { ...projectRegistry[0] }],
  })), null);
  assert.equal(validatePortfolioManifest(makeManifest({
    projects: [{
      ...projectRegistry[0],
      images: ['javascript:alert(1)'],
    }],
  })), null);
});
