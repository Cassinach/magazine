#!/usr/bin/env node
// 出典ページの図版を取得して issues/<号>/figures/ に保存する（routine 用・信頼済みスクリプト）。
//   node scripts/fetch-figure.mjs <画像URL> issues/2026-12/figures/fig-01
// 受け付けるのは PNG / JPEG / GIF / WebP のみ（SVG は script を含みうるので不可）。
// 600 KB を超える画像・画像でないレスポンスは保存せず exit 1。保存したファイル名を stdout に出す。
import fs from 'node:fs';
import path from 'node:path';

export const MAX_FIGURE_BYTES = 600 * 1024;
export const FIGURE_TYPES = {
  png: { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  jpg: { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  gif: { mime: 'image/gif', magic: [0x47, 0x49, 0x46, 0x38] },
  webp: { mime: 'image/webp', magic: [0x52, 0x49, 0x46, 0x46] }, // RIFF....WEBP
};

// バッファの先頭バイトから画像種別を判定する。該当しなければ null。
export function sniffFigure(buf) {
  for (const [ext, t] of Object.entries(FIGURE_TYPES)) {
    if (!t.magic.every((b, i) => buf[i] === b)) continue;
    if (ext === 'webp' && buf.subarray(8, 12).toString('ascii') !== 'WEBP') continue;
    return ext;
  }
  return null;
}

async function main() {
  const [url, dest] = process.argv.slice(2);
  if (!url || !dest) { console.error('使い方: node scripts/fetch-figure.mjs <画像URL> issues/YYYY-MM/figures/fig-NN'); process.exit(2); }
  if (!/^https?:\/\//.test(url)) { console.error('✖ http(s) の URL だけ取得できます'); process.exit(1); }
  if (!/^issues\/\d{4}-\d{2}\/figures\/fig-\d{2}$/.test(dest)) { console.error('✖ 保存先は issues/YYYY-MM/figures/fig-NN（拡張子なし）の形にしてください'); process.exit(1); }
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'magazine-figure-fetcher/1.0' } });
  if (!res.ok) { console.error(`✖ HTTP ${res.status}`); process.exit(1); }
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_FIGURE_BYTES) { console.error(`✖ ${(len / 1024).toFixed(0)} KB は上限 ${MAX_FIGURE_BYTES / 1024} KB を超えています`); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_FIGURE_BYTES) { console.error(`✖ ${(buf.length / 1024).toFixed(0)} KB は上限 ${MAX_FIGURE_BYTES / 1024} KB を超えています`); process.exit(1); }
  const ext = sniffFigure(buf);
  if (!ext) { console.error(`✖ PNG/JPEG/GIF/WebP ではありません（content-type: ${res.headers.get('content-type')}）`); process.exit(1); }
  const out = `${dest}.${ext}`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log(out);
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('fetch-figure.mjs')) {
  main().catch((e) => { console.error('✖', e.message); process.exit(1); });
}
