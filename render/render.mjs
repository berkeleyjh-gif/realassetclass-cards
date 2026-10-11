// realassetclass 카드뉴스 렌더러
// bundles/*.json(슬라이드 HTML) → posts/{date}_{slug}/{n}.jpg + queue/{date}.json
// 사용: node render/render.mjs [bundle.json ...] [--out DIR] [--no-queue] [--force]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const RAW = 'https://raw.githubusercontent.com/berkeleyjh-gif/realassetclass-cards/main/';
const W = 1080, H = 1350;

const argv = process.argv.slice(2);
const opt = { out: ROOT, queue: true, force: false, files: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--out') opt.out = path.resolve(argv[++i]);
  else if (a === '--no-queue') opt.queue = false;
  else if (a === '--force') opt.force = true;
  else opt.files.push(a);
}
if (!opt.files.length) {
  const dir = path.join(ROOT, 'bundles');
  const all = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort() : [];
  if (all.length) opt.files.push(path.join('bundles', all[all.length - 1]));
}

function findChrome() {
  const c = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
  for (const p of c) if (p && fs.existsSync(p)) return p;
  throw new Error('Chrome/Chromium 실행 파일을 찾지 못함 (CHROME_PATH 지정 필요)');
}

const nm = (p) => pathToFileURL(path.join(ROOT, 'node_modules', p)).href;
const fontLinks = [
  '@fontsource/black-han-sans/400.css',
  '@fontsource/ibm-plex-sans-kr/400.css',
  '@fontsource/ibm-plex-sans-kr/500.css',
  '@fontsource/ibm-plex-sans-kr/600.css',
  '@fontsource/ibm-plex-sans-kr/700.css',
].map(p => `<link rel="stylesheet" href="${nm(p)}">`).join('');
const baseCss = pathToFileURL(path.join(ROOT, 'render', 'base.css')).href;

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

const HANDLE = '@budongsan.soksajeong';
function topBar(i, n, handle) {
  return `<div class="top"><span>${handle || HANDLE}</span><span>${i} / ${n}</span></div>`;
}

function buildHtml(slide, i, n, css, handle) {
  let s = slide.replace(/\{\{page\}\}/g, String(i)).replace(/\{\{total\}\}/g, String(n));
  if (!/data-notop/.test(s.slice(0, 300))) {
    const k = s.indexOf('>');
    s = s.slice(0, k + 1) + topBar(i, n, handle) + s.slice(k + 1);
  }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="${pathToFileURL(ROOT + '/').href}">${fontLinks}` +
    `<link rel="stylesheet" href="${baseCss}"><style>${css || ''}</style></head><body>${s}</body></html>`;
}

function validatePost(p) {
  const e = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) e.push('date 형식 오류');
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(p.slug || '')) e.push('slug는 영문 소문자·숫자·하이픈');
  if (!Array.isArray(p.slides) || p.slides.length < 2 || p.slides.length > 10) e.push('slides 2~10장');
  else p.slides.forEach((s, i) => {
    if (!/^\s*<section[\s>]/.test(s)) e.push(`slide ${i + 1}: <section>으로 시작해야 함`);
    for (const m of s.matchAll(/(?:url\(\s*['"]?|src=['"])(assets\/[^'")\s]+)/g)) {
      if (!fs.existsSync(path.join(ROOT, m[1]))) e.push(`slide ${i + 1}: 사진 없음 ${m[1]}`);
    }
  });
  if (typeof p.caption !== 'string' || !p.caption.trim()) e.push('caption 없음');
  else {
    if (p.caption.length > 2200) e.push('caption 2200자 초과');
    if ((p.caption.match(/#[^\s#]+/g) || []).length > 30) e.push('해시태그 30개 초과');
  }
  return e;
}

const report = { renderedAt: new Date().toISOString(), bundles: [], posts: [], warnings: [], errors: [] };
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const tmpDir = path.join(ROOT, 'render', '.tmp');
fs.mkdirSync(tmpDir, { recursive: true });

for (const f of opt.files) {
  const bundle = JSON.parse(fs.readFileSync(path.resolve(ROOT, f), 'utf8'));
  report.bundles.push(f);
  for (const p of bundle.posts || []) {
    const errs = validatePost(p);
    if (errs.length) { report.errors.push({ post: p.slug || '?', errs }); continue; }
    const qRel = `queue/${p.date}.json`;
    const qAbs = path.join(opt.out, qRel);
    if (opt.queue && fs.existsSync(qAbs) && !(opt.force || p.force)) {
      report.warnings.push(`${qRel} 이미 있음 → ${p.slug} 건너뜀`);
      continue;
    }
    const dirRel = `posts/${p.date}_${p.slug}`;
    fs.mkdirSync(path.join(opt.out, dirRel), { recursive: true });
    const n = p.slides.length;
    const files = [];
    for (let i = 0; i < n; i++) {
      const html = buildHtml(p.slides[i], i + 1, n, (bundle.css || '') + (p.css || ''), bundle.handle);
      const tmp = path.join(tmpDir, `s${i + 1}.html`);
      fs.writeFileSync(tmp, html);
      await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
      await page.evaluate(async () => {
        await document.fonts.ready;
        const urls = [...document.querySelectorAll('[style*="url("]')].map(e => (getComputedStyle(e).backgroundImage.match(/url\("?(.*?)"?\)/) || [])[1]).filter(Boolean);
        await Promise.all([...urls.map(u => new Promise(r => { const im = new Image(); im.onload = im.onerror = r; im.src = u; })),
          ...[...document.images].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; }))]);
      });
      await page.waitForTimeout(300);
      await page.evaluate(async () => { await document.fonts.ready; });
      const issues = await page.evaluate(({ W, H }) => {
        const out = [];
        const sec = document.querySelector('section');
        if (!sec) return ['section 없음'];
        for (const el of sec.querySelectorAll('*')) {
          if (el.closest('[data-bleed]')) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > W + 1 || r.bottom > H + 1 || r.left < -1) {
            const t = (el.textContent || '').trim().slice(0, 24);
            if (t) out.push(`화면 밖: <${el.tagName.toLowerCase()}> "${t}"`);
          }
          if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') {
            out.push(`넘침: "${(el.textContent || '').trim().slice(0, 24)}"`);
          }
        }
        const missing = [...document.fonts].filter(ff => ff.status === 'error').length;
        if (missing) out.push(`폰트 로드 실패 ${missing}개`);
        return [...new Set(out)].slice(0, 8);
      }, { W, H });
      issues.forEach(m => report.warnings.push(`${dirRel}/${i + 1}.jpg ${m}`));
      const outFile = path.join(opt.out, dirRel, `${i + 1}.jpg`);
      await page.screenshot({ path: outFile, type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: W, height: H } });
      files.push({ media_type: 'IMAGE', image_url: RAW + `${dirRel}/${i + 1}.jpg` });
    }
    if (opt.queue) {
      fs.mkdirSync(path.join(opt.out, 'queue'), { recursive: true });
      fs.writeFileSync(qAbs, JSON.stringify({ type: 'carousel', caption: p.caption, files }, null, 1));
    }
    report.posts.push({ date: p.date, slug: p.slug, slides: n, dir: dirRel, queued: opt.queue });
  }
}
await browser.close();
fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(path.join(opt.out, 'render'), { recursive: true });
fs.writeFileSync(path.join(opt.out, 'render', 'last-report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
if (report.errors.length) process.exitCode = 1;
