import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const registryPath = path.join(projectRoot, 'src', 'data', 'projectRegistry.js');

const DEFAULT_MAX_LONG_EDGE = 2800;
const DEFAULT_QUALITY = 82;
const DEFAULT_METHOD = 6;

function parseArgs(argv) {
  const options = {
    quality: DEFAULT_QUALITY,
    maxLongEdge: DEFAULT_MAX_LONG_EDGE,
    pruneOriginals: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--prune-originals') {
      options.pruneOriginals = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--quality') {
      options.quality = Number(argv[index + 1] ?? DEFAULT_QUALITY);
      index += 1;
      continue;
    }

    if (arg === '--max-long-edge') {
      options.maxLongEdge = Number(argv[index + 1] ?? DEFAULT_MAX_LONG_EDGE);
      index += 1;
    }
  }

  return options;
}

function roundDimension(value) {
  return Math.max(1, Math.round(value));
}

async function getImageSize(filePath) {
  const { stdout } = await execFileAsync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath]);
  const widthMatch = stdout.match(/pixelWidth:\s+(\d+)/);
  const heightMatch = stdout.match(/pixelHeight:\s+(\d+)/);

  if (!widthMatch || !heightMatch) {
    throw new Error(`Could not read dimensions for ${filePath}`);
  }

  return {
    width: Number(widthMatch[1]),
    height: Number(heightMatch[1]),
  };
}

function buildTargetSize({ width, height }, maxLongEdge) {
  const longEdge = Math.max(width, height);

  if (longEdge <= maxLongEdge) {
    return { width, height };
  }

  const scale = maxLongEdge / longEdge;
  return {
    width: roundDimension(width * scale),
    height: roundDimension(height * scale),
  };
}

async function convertToWebp(sourcePath, outputPath, options) {
  const currentSize = await getImageSize(sourcePath);
  const targetSize = buildTargetSize(currentSize, options.maxLongEdge);
  const args = [
    '-q',
    String(options.quality),
    '-m',
    String(DEFAULT_METHOD),
    '-mt',
    '-sharp_yuv',
    '-metadata',
    'none',
    '-resize',
    String(targetSize.width),
    String(targetSize.height),
    sourcePath,
    '-o',
    outputPath,
  ];

  if (options.dryRun) {
    return targetSize;
  }

  await execFileAsync('cwebp', args);
  return targetSize;
}

async function loadRegistry() {
  const moduleUrl = `${pathToFileURL(registryPath).href}?ts=${Date.now()}`;
  const module = await import(moduleUrl);
  return module.projectRegistry;
}

function collectPortfolioImages(projectRegistry) {
  const imagePaths = new Set();

  projectRegistry.forEach((project) => {
    (project.images ?? []).forEach((imagePath) => {
      if (typeof imagePath === 'string' && imagePath.startsWith('/portfolio/')) {
        imagePaths.add(imagePath);
      }
    });
  });

  return [...imagePaths];
}

async function fileSize(filePath) {
  const stats = await fs.stat(filePath);
  return stats.size;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function rewriteRegistry(pathMap) {
  let source = await fs.readFile(registryPath, 'utf8');

  for (const [fromPath, toPath] of pathMap.entries()) {
    source = source.split(`'${fromPath}'`).join(`'${toPath}'`);
    source = source.split(`"${fromPath}"`).join(`"${toPath}"`);
  }

  await fs.writeFile(registryPath, source, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const registry = await loadRegistry();
  const imagePaths = collectPortfolioImages(registry);
  const pathMap = new Map();
  let originalTotal = 0;
  let optimizedTotal = 0;

  for (const publicPath of imagePaths) {
    const sourcePath = path.join(projectRoot, 'public', publicPath.slice(1));
    const extension = path.extname(sourcePath);
    const outputPath = sourcePath.slice(0, -extension.length) + '.webp';
    const outputPublicPath = publicPath.slice(0, -extension.length) + '.webp';
    const sourceSize = await fileSize(sourcePath);
    const targetSize = await convertToWebp(sourcePath, outputPath, options);
    const outputSize = options.dryRun ? 0 : await fileSize(outputPath);

    originalTotal += sourceSize;
    optimizedTotal += outputSize;
    pathMap.set(publicPath, outputPublicPath);

    console.log(
      `${publicPath} -> ${outputPublicPath} ` +
      `[${targetSize.width}x${targetSize.height}] ` +
      `${formatBytes(sourceSize)} -> ${options.dryRun ? 'dry-run' : formatBytes(outputSize)}`,
    );

    if (options.pruneOriginals && !options.dryRun) {
      await fs.unlink(sourcePath);
    }
  }

  if (!options.dryRun) {
    await rewriteRegistry(pathMap);
  }

  console.log('');
  console.log(`Portfolio images processed: ${imagePaths.length}`);
  console.log(`Original total: ${formatBytes(originalTotal)}`);
  if (!options.dryRun) {
    console.log(`Optimized total: ${formatBytes(optimizedTotal)}`);
    console.log(`Saved: ${formatBytes(originalTotal - optimizedTotal)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
