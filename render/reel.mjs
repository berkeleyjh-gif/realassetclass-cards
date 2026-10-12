// realassetclass 릴스 빌더: 사진 + 텍스트 오버레이 → 1080×1920 MP4 (음악 없음)
// 사용: node render/reel.mjs reel.json out.mp4
// 첫 컷은 0프레임부터 훅 문구가 떠 있음(페이드 없음)·줌 강하게. dur 기본 2.0초, 첫 컷은 1.2~1.5초 권장
// reel.json: {"shots":[{"photo":"/abs/path.jpg","dur":1.4,"html":"<div class=\"shade\"></div><div class=\"box\">...</div>"}]}
// 오버레이 클래스: .shade .box .tag .h .m .s .n .two .src .handle .o .b
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const [specPath, outPath] = process.argv.slice(2);
if (!specPath || !outPath) { console.error('usage: node render/reel.mjs reel.json out.mp4'); process.exit(1); }
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const ROOT = process.cwd();
const nm = (p) => pathToFileURL(path.join(ROOT, 'node_modules', p)).href;
const fonts = ['@fontsource/black-han-sans/400.css', '@fontsource/ibm-plex-sans-kr/500.css', '@fontsource/ibm-plex-sans-kr/700.css']
  .map(p => `<link rel="stylesheet" href="${nm(p)}">`).join('');
const css = `html,body{margin:0;width:1080px;height:1920px;background:transparent;overflow:hidden}
.f{position:absolute;inset:0;font-family:'IBM Plex Sans KR';color:#F4F6FA;word-break:keep-all}
.shade{position:absolute;left:0;right:0;bottom:0;height:1150px;background:linear-gradient(to top,rgba(13,20,33,.92) 0%,rgba(13,20,33,.75) 45%,rgba(13,20,33,0) 100%)}
.shade.top{top:0;bottom:auto;height:900px;background:linear-gradient(to bottom,rgba(13,20,33,.9) 0%,rgba(13,20,33,.6) 50%,rgba(13,20,33,0) 100%)}
.box{position:absolute;left:80px;right:80px;bottom:330px}
.box.up{top:250px;bottom:auto}
.tag{display:inline-block;border:3px solid #FF8A3D;color:#FF8A3D;border-radius:999px;padding:8px 26px 10px;font-size:34px;font-weight:700}
.h{font-family:'Black Han Sans';font-size:112px;line-height:1.14;letter-spacing:-1px;margin-top:28px;text-shadow:0 4px 24px rgba(0,0,0,.35)}
.m{font-family:'Black Han Sans';font-size:250px;line-height:1;color:#FF8A3D;letter-spacing:-4px}
.s{font-size:44px;font-weight:700;line-height:1.45;margin-top:18px}
.n{font-size:34px;font-weight:500;color:#C9D2E3;margin-top:14px}
.o{color:#FF8A3D}.b{color:#5B9BFF}
.two{display:flex;gap:40px;margin-top:30px}.two>div{flex:1;background:rgba(13,20,33,.72);border:2px solid #26344F;border-radius:30px;padding:34px 36px}
.src{position:absolute;left:80px;right:80px;bottom:150px;font-size:28px;color:#AAB6CC;line-height:1.4}
.handle{position:absolute;left:80px;bottom:90px;font-size:30px;font-weight:700;color:#F4F6FA;opacity:.85}`;

const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
  .find(p => p && fs.existsSync(p));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-'));
const b = await chromium.launch({ executablePath: chrome });
const pg = await b.newPage({ viewport: { width: 1080, height: 1920 } });
for (let i = 0; i < spec.shots.length; i++) {
  const f = path.join(work, `s${i + 1}.html`);
  fs.writeFileSync(f, `<!doctype html><html><head><meta charset="utf-8">${fonts}<style>${css}${spec.css || ''}</style></head><body><div class="f">${spec.shots[i].html}</div></body></html>`);
  await pg.goto(pathToFileURL(f).href);
  await pg.evaluate(async () => { await document.fonts.ready; });
  await pg.waitForTimeout(300);
  await pg.screenshot({ path: path.join(work, `s${i + 1}.png`), omitBackground: true });
}
await b.close();

const X = 0.25, FPS = 30;
const clips = [];
spec.shots.forEach((s, i) => {
  const d = s.dur || 2.0, fr = Math.round(d * FPS);
  const z = i % 2 === 0
    ? `zoompan=z='1+${i === 0 ? '0.18' : '0.10'}*on/${fr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}`
    : `zoompan=z='1.10':x='(iw-iw/zoom)*(0.15+0.7*on/${fr})':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}`;
  const out = path.join(work, `c${i + 1}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', String(FPS), '-t', String(d), '-i', s.photo,
    '-loop', '1', '-framerate', String(FPS), '-t', String(d), '-i', path.join(work, `s${i + 1}.png`),
    '-filter_complex', `[0]scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,eq=saturation=0.92:contrast=1.04,${z},trim=duration=${d},setpts=PTS-STARTPTS[bg];[1]format=rgba${i === 0 ? '' : ',fade=in:st=0.05:d=0.25:alpha=1'}[ov];[bg][ov]overlay=0:0:shortest=1,format=yuv420p[v]`,
    '-map', '[v]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-t', String(d), out]);
  clips.push({ out, d });
});
const inputs = clips.flatMap(c => ['-i', c.out]);
let f = '', off = 0, last = '0';
for (let i = 1; i < clips.length; i++) {
  off = +(off + clips[i - 1].d - X).toFixed(2);
  f += `${f ? ';' : ''}[${last}][${i}]xfade=transition=fade:duration=${X}:offset=${off}[a${i}]`;
  last = `a${i}`;
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', f, '-map', `[${last}]`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-maxrate', '4.5M', '-bufsize', '9M', '-movflags', '+faststart', outPath]);
fs.rmSync(work, { recursive: true, force: true });
console.log('reel:', outPath);
