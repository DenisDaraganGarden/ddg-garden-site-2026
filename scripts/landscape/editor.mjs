// Editor for the landscape portfolio (public/landscape).
// The works, the projects menu and the «О проекте» panels are rendered from
// src/data/landscapePortfolio.json between <!-- works -->, <!-- menu --> and
// <!-- about --> markers; everything else in index.html stays hand-written.
//
//   node scripts/landscape/editor.mjs         editor at http://127.0.0.1:41218
//   node scripts/landscape/editor.mjs build   rebuild the page from the data
//   node scripts/landscape/editor.mjs check   fail if the page and the data disagree
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '../..');
const pageDir = path.join(root, 'public/landscape');
const pageFile = path.join(pageDir, 'index.html');
const assets = path.join(pageDir, 'assets');
const dataFile = path.join(root, 'src/data/landscapePortfolio.json');
const PORT = 41218;
const QUALITY = 82;

const esc = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = n => String(n).padStart(2, '0');
const exists = file => fs.access(file).then(() => true, () => false);

function validate(data) {
  if (!Array.isArray(data?.projects) || !data.projects.length) throw new Error('В портфолио нет ни одного проекта');
  for (const p of data.projects) {
    const name = p.title?.trim() ? `«${p.title.trim()}»` : 'без названия';
    if (!p.title?.trim()) throw new Error(`У проекта ${name} нет названия`);
    if (!/^[a-z0-9-]+$/.test(p.id ?? '')) throw new Error(`У проекта ${name} плохой адрес: ${p.id}`);
    if (typeof p.subtitle !== 'string' || typeof p.about !== 'string') throw new Error(`Проект ${name} испорчен`);
    if (!Array.isArray(p.frames) || !p.frames.length) throw new Error(`В проекте ${name} нет кадров`);
    for (const frame of p.frames) if (!/^[\w-]+$/.test(frame)) throw new Error(`Плохое имя кадра: ${frame}`);
  }
}

async function srcset(frame) {
  const file = path.join(assets, `${frame}-1600.webp`);
  if (!await exists(file)) throw new Error(`Нет картинки ${frame}-1600.webp`);
  const {width, height} = await sharp(file).metadata();
  const small = await exists(path.join(assets, `${frame}-900.webp`)) ? `./assets/${frame}-900.webp 900w, ` : '';
  return {width, height, srcset: `${small}./assets/${frame}-1600.webp ${width}w`};
}

async function render({projects}, html) {
  validate({projects});
  const ids = new Set(['top', 'recognition', 'author', 'contact', 'works']);
  const works = [];
  for (const p of projects) {
    const title = esc(p.title.trim());
    for (const [i, frame] of p.frames.entries()) {
      const id = i ? `${p.id}-${i + 1}` : p.id;
      if (ids.has(id)) throw new Error(`Адрес #${id} повторяется, переименуйте проект`);
      ids.add(id);
      const image = await srcset(frame);
      const label = `${title}, кадр ${i + 1}`;
      const tools = (p.frames.length > 1 ? `<span class="frame-count">${pad(i + 1)} / ${pad(p.frames.length)}</span>` : '')
        + (p.about ? `<button data-panel="about-${p.id}" aria-haspopup="dialog">О проекте</button>` : '');
      works.push(`<section class="sheet work" id="${id}" aria-labelledby="title-${id}"><div class="image-stage"><button class="image-open" data-image aria-label="Рассмотреть: ${label}"><img src="./assets/${frame}-1600.webp" srcset="${image.srcset}" sizes="(max-width:759px) calc(100vw - 48px), 90vw" width="${image.width}" height="${image.height}" alt="${label}" loading="lazy" decoding="async" draggable="false"></button></div><div class="work-caption"><div><h2 id="title-${id}">${title}</h2>${p.subtitle.trim() ? `<p>${esc(p.subtitle.trim())}</p>` : ''}</div><div class="work-tools">${tools}</div></div></section>`);
    }
  }
  const menu = projects.map((p, i) => `<a href="#${p.id}"><span>${pad(i + 1)}</span>${esc(p.title.trim())}</a>`);
  const about = projects.filter(p => p.about).map(p => `<dialog class="panel-dialog" id="about-${p.id}" aria-labelledby="about-${p.id}-heading"><div class="panel-bar"><h2 id="about-${p.id}-heading">${esc(p.title.trim())}</h2><button data-close>Закрыть</button></div><div class="panel-copy">${p.about}</div></dialog>`);

  // The cover is always the first frame of the first project.
  const [first] = projects, cover = await srcset(first.frames[0]);
  const hero = `<img class="hero-image" src="./assets/${first.frames[0]}-1600.webp" srcset="${cover.srcset}" sizes="100vw" width="${cover.width}" height="${cover.height}" alt="${esc(first.title.trim())}" fetchpriority="high">`;

  const replace = (pattern, value) => {
    if (!pattern.test(html)) throw new Error(`В index.html нет места для ${pattern}`);
    html = html.replace(pattern, () => value);
  };
  for (const [tag, lines] of [['works', works], ['menu', menu], ['about', about]]) {
    replace(new RegExp(`(?<=<!-- ${tag} -->)[\\s\\S]*?(?=<!-- /${tag} -->)`), `\n${lines.join('\n')}\n`);
  }
  replace(/<img class="hero-image"[^>]*>/, hero);
  replace(/(?<=<a class="skip-link" href="#)[^"]*/, first.id);
  replace(/(?<=<div class="page-position" aria-hidden="true">)[^<]*/, `01 / ${pad(html.match(/class="sheet /g).length)}`);
  return html;
}

async function build(data) {
  const html = await render(data, await fs.readFile(pageFile, 'utf8'));
  await fs.writeFile(dataFile, JSON.stringify({projects: data.projects}, null, 2) + '\n');
  await fs.writeFile(pageFile, html);
  // Frames removed in the editor, and uploads that were never saved, leave no files behind.
  for (const file of await fs.readdir(assets)) {
    if (/-(900|1600)\.webp$/.test(file) && !html.includes(`./assets/${file}`)) await fs.rm(path.join(assets, file));
  }
}

let uploads = 0;
// Any size and orientation in; the page's two widths out: 1600 (within 1600×2000) and 900.
async function adapt(buffer, prefix) {
  const name = `${(prefix ?? '').replace(/[^a-z0-9-]/g, '') || 'frame'}-${Date.now().toString(36)}${(uploads++).toString(36)}`;
  let big;
  try {
    big = await sharp(buffer).rotate().resize({width: 1600, height: 2000, fit: 'inside', withoutEnlargement: true})
      .webp({quality: QUALITY}).toFile(path.join(assets, `${name}-1600.webp`));
  } catch {
    throw new Error('это не картинка или формат не читается (подойдут JPG, PNG, TIFF, WebP, AVIF)');
  }
  if (big.width > 900) await sharp(buffer).rotate().resize({width: 900}).webp({quality: QUALITY}).toFile(path.join(assets, `${name}-900.webp`));
  return {name, width: big.width, height: big.height};
}

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
const readBody = req => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk)).on('end', () => resolve(Buffer.concat(chunks))).on('error', reject);
});

function serve() {
  http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (code, body, type = types['.json'], cache = 'no-store') => {
      res.writeHead(code, {'content-type': type, 'cache-control': cache});
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    try {
      if (url.pathname === '/') return send(200, await fs.readFile(path.join(import.meta.dirname, 'editor.html')), types['.html']);
      if (url.pathname === '/api/portfolio' && req.method === 'GET') return send(200, await fs.readFile(dataFile));
      if (url.pathname === '/api/portfolio' && req.method === 'PUT') {
        await build(JSON.parse(await readBody(req)));
        return send(200, {ok: true});
      }
      if (url.pathname === '/api/upload' && req.method === 'POST') return send(200, await adapt(await readBody(req), url.searchParams.get('prefix')));
      if (url.pathname === '/landscape') {
        res.writeHead(301, {location: '/landscape/'});
        return res.end();
      }
      if (url.pathname.startsWith('/landscape/')) {
        const file = path.join(pageDir, decodeURIComponent(url.pathname.slice('/landscape/'.length)) || 'index.html');
        if (file.startsWith(pageDir + path.sep) && await exists(file)) {
          return send(200, await fs.readFile(file), types[path.extname(file)] ?? 'application/octet-stream', file.startsWith(assets) ? 'max-age=3600' : 'no-store');
        }
      }
      send(404, 'Нет такой страницы', types['.txt']);
    } catch (error) {
      send(400, {error: error.message});
    }
  }).listen(PORT, '127.0.0.1', () => console.log(`Редактор ландшафта: http://127.0.0.1:${PORT}/  ·  страница: http://127.0.0.1:${PORT}/landscape/`));
}

const mode = process.argv[2];
if (mode === 'build') {
  await build(JSON.parse(await fs.readFile(dataFile, 'utf8')));
  console.log('Страница собрана');
} else if (mode === 'check') {
  const html = await fs.readFile(pageFile, 'utf8');
  if (await render(JSON.parse(await fs.readFile(dataFile, 'utf8')), html) !== html) {
    console.error('public/landscape/index.html не совпадает с src/data/landscapePortfolio.json: node scripts/landscape/editor.mjs build');
    process.exit(1);
  }
  console.log('Страница совпадает с данными');
} else serve();
