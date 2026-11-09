#!/usr/bin/env node
// publish-gate: PR（routine が作った号ブランチ）を main 側の信頼済みコードで機械的に検証する。
// このスクリプト自身・validate.mjs・build.mjs・template は常に main のものが使われ、PR 側のコードは一切実行しない。
//
//   node scripts/gate.mjs --base origin/main --head refs/remotes/pr/head --pr-dir pr --branch issue/2026-11 [--report gate-report.md]
//
// 検査:
//   1. 変更パスが許可リスト内か（原稿データと生成物だけ）
//   2. validate.mjs が通るか
//   3. HTML / index.html / watchlist スナップショットが main のテンプレ＋スクリプトから byte 一致で再現できるか
//   4. HTML の静的検査（script は 1 つ、CSP あり、iframe/form/src/on*= なし、危険なスキームなし）
//   5. サイズ上限
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { sniffFigure, MAX_FIGURE_BYTES } from './fetch-figure.mjs';

const MAX_HTML = 12 * 1024 * 1024;
const MAX_JSON = 1 * 1024 * 1024;

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--base') a.base = argv[++i];
    else if (v === '--head') a.head = argv[++i];
    else if (v === '--pr-dir') a.prDir = argv[++i];
    else if (v === '--branch') a.branch = argv[++i];
    else if (v === '--report') a.report = argv[++i];
    else throw new Error(`不明な引数: ${v}`);
  }
  for (const k of ['base', 'head', 'prDir', 'branch']) if (!a[k]) throw new Error(`--${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())} は必須です`);
  return a;
}

const results = []; // { name, ok, detail }
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? `\n    ${detail.split('\n').join('\n    ')}` : ''}`); return ok; };

function git(args, cwd = REPO) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const prDir = path.resolve(a.prDir);

  // 1. ブランチ名 → 号
  const m = /^issue\/(\d{4}-\d{2})(?:-r\d+)?$/.exec(a.branch);
  if (!record('ブランチ名が issue/YYYY-MM 形式', !!m, m ? '' : `受け取ったブランチ: ${a.branch}`)) return finish(a);
  const issue = m[1];

  // 2. 変更パスの許可リスト
  const allowed = new Set([
    `issues/${issue}/content.json`,
    `issues/${issue}/watchlist.json`,
    `issues/${issue}.html`,
    'index.html',
    'state/watchlist.json',
  ]);
  const changed = git(['diff', '--name-only', '--diff-filter=ACDMRT', `${a.base}...${a.head}`]).split('\n').map((s) => s.trim()).filter(Boolean);
  const figureRe = new RegExp(`^issues/${issue}/figures/fig-\\d{2}\\.(png|jpe?g|gif|webp)$`);
  const extra = changed.filter((f) => !allowed.has(f) && !figureRe.test(f));
  const missing = [`issues/${issue}/content.json`, `issues/${issue}.html`].filter((f) => !changed.includes(f));
  record('変更パスが許可リスト内', extra.length === 0 && missing.length === 0 && changed.length > 0,
    [extra.length ? `許可外のパス:\n${extra.map((f) => `  - ${f}`).join('\n')}` : '',
      missing.length ? `必須ファイルが変更に含まれていない: ${missing.join(', ')}` : '',
      `変更ファイル ${changed.length} 件`].filter(Boolean).join('\n'));
  if (extra.length) return finish(a); // 以降の検査は PR のファイルを読むので、ここで止める

  const prFile = (f) => path.join(prDir, f);
  for (const f of [`issues/${issue}/content.json`, `issues/${issue}.html`, `issues/${issue}/watchlist.json`, 'index.html', 'state/watchlist.json']) {
    if (!fs.existsSync(prFile(f))) record(`PR に ${f} が存在`, false);
  }
  if (results.some((r) => !r.ok)) return finish(a);

  // 図版ファイル: 実体が画像で、サイズ上限内か
  const figDir = prFile(`issues/${issue}/figures`);
  const figFiles = fs.existsSync(figDir) ? fs.readdirSync(figDir) : [];
  const badFigs = [];
  for (const f of figFiles) {
    const fp = path.join(figDir, f);
    if (!/^fig-\d{2}\.(png|jpe?g|gif|webp)$/.test(f)) { badFigs.push(`${f}: 名前が fig-NN.ext 形式でない`); continue; }
    const st = fs.statSync(fp);
    if (st.size > MAX_FIGURE_BYTES) badFigs.push(`${f}: ${(st.size / 1024).toFixed(0)} KB（上限 ${MAX_FIGURE_BYTES / 1024} KB）`);
    if (!sniffFigure(fs.readFileSync(fp))) badFigs.push(`${f}: PNG/JPEG/GIF/WebP ではない`);
  }
  record('図版ファイルが画像でサイズ上限内', badFigs.length === 0, badFigs.length ? badFigs.join('\n') : `${figFiles.length} 枚`);
  if (badFigs.length) return finish(a);

  // 5. サイズ（先に見る。巨大ファイルを後段に渡さない）
  const htmlSize = fs.statSync(prFile(`issues/${issue}.html`)).size;
  const jsonSize = fs.statSync(prFile(`issues/${issue}/content.json`)).size;
  record('サイズ上限', htmlSize <= MAX_HTML && jsonSize <= MAX_JSON, `HTML ${(htmlSize / 1024).toFixed(0)} KB / content.json ${(jsonSize / 1024).toFixed(0)} KB`);
  if (results.some((r) => !r.ok)) return finish(a);

  // 3. validate（main の validate.mjs を PR のデータに対して）
  const v = spawnSync(process.execPath, [path.join(REPO, 'scripts/validate.mjs'), prFile(`issues/${issue}/content.json`), '--watchlist', prFile('state/watchlist.json')], { encoding: 'utf8' });
  record('validate.mjs', v.status === 0, (v.stdout + v.stderr).trim().split('\n').slice(-12).join('\n'));
  if (v.status !== 0) return finish(a);

  // 4. 再現ビルド: PR のツリーを一時ディレクトリにコピーし、main の build.mjs で再生成して比較
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
  fs.cpSync(prDir, tmp, { recursive: true, filter: (src) => !src.split(path.sep).includes('.git') });
  const b = spawnSync(process.execPath, [path.join(REPO, 'scripts/build.mjs'), issue, '--root', tmp], { encoding: 'utf8' });
  record('build.mjs（main のテンプレで再生成）', b.status === 0, (b.stdout + b.stderr).trim().split('\n').slice(-6).join('\n'));
  if (b.status === 0) {
    for (const f of [`issues/${issue}.html`, 'index.html', `issues/${issue}/watchlist.json`]) {
      const x = fs.readFileSync(path.join(tmp, f));
      const y = fs.readFileSync(prFile(f));
      let detail = '';
      if (!x.equals(y)) {
        const xl = x.toString('utf8').split('\n'), yl = y.toString('utf8').split('\n');
        let i = 0; while (i < xl.length && i < yl.length && xl[i] === yl[i]) i++;
        detail = `最初の差分は ${i + 1} 行目\n  再生成: ${(xl[i] ?? '(EOF)').slice(0, 160)}\n  PR    : ${(yl[i] ?? '(EOF)').slice(0, 160)}`;
      }
      record(`再現性: ${f} が byte 一致`, x.equals(y), detail);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  // 4. HTML 静的検査（再現性が通っていればテンプレ由来のはずだが、二重に見る）
  const html = fs.readFileSync(prFile(`issues/${issue}.html`), 'utf8');
  const count = (re) => (html.match(re) || []).length;
  record('<script> がテンプレ由来の 1 つだけ', count(/<script\b/gi) === 1, `script タグ ${count(/<script\b/gi)} 個`);
  record('CSP メタタグがある', count(/<meta http-equiv="Content-Security-Policy"/g) === 1);
  const tags = html.match(/<[a-zA-Z][^>]*>/g) || [];
  const bad = [];
  for (const t of tags) {
    if (/^<(iframe|object|embed|form|link|base|applet|frame|frameset)\b/i.test(t)) bad.push(`禁止タグ: ${t.slice(0, 80)}`);
    else if (/^<meta\b/i.test(t) && /http-equiv\s*=\s*["']?refresh/i.test(t)) bad.push(`meta refresh: ${t.slice(0, 80)}`);
    if (/\son[a-z]+\s*=/i.test(t)) bad.push(`インラインイベントハンドラ: ${t.slice(0, 80)}`);
    if (/^<img\b/i.test(t)) {
      if (!/\ssrc="data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+"/.test(t) || /\s(srcset|usemap)\s*=/i.test(t)) bad.push(`img は data URI の画像のみ: ${t.slice(0, 80)}`);
    } else if (/\s(src|srcset|action|formaction|poster|background)\s*=/i.test(t)) bad.push(`外部リソース属性: ${t.slice(0, 80)}`);
    if (/\s(href|xlink:href)\s*=\s*["']?\s*(javascript|vbscript|data|file):/i.test(t)) bad.push(`危険なスキーム: ${t.slice(0, 80)}`);
    if (/\sstyle\s*=\s*["'][^"']*(url\(|expression\(|@import)/i.test(t)) bad.push(`style 内の外部参照: ${t.slice(0, 80)}`);
  }
  record('危険なタグ・属性が無い', bad.length === 0, bad.slice(0, 10).join('\n'));
  record('ページ数が妥当', count(/<section class="page /g) >= 10, `${count(/<section class="page /g)} ページ`);

  finish(a);
}

function finish(a) {
  const failed = results.filter((r) => !r.ok);
  const lines = [
    `## publish-gate: ${failed.length ? '❌ 不合格' : '✅ 合格'}`,
    '',
    `ブランチ \`${a.branch}\`　検査 ${results.length} 件中 ${failed.length} 件 NG`,
    '',
    ...results.map((r) => `- ${r.ok ? '✅' : '❌'} ${r.name}${r.detail ? `\n\n  \`\`\`\n  ${r.detail.split('\n').join('\n  ')}\n  \`\`\`` : ''}`),
    '',
    failed.length
      ? '不合格の PR は merge されません。原稿（content.json / watchlist.json）側の問題なら routine の次回 run か手動修正で、スクリプト・テンプレートに手が入っている場合はインジェクションの可能性を疑ってください。'
      : 'main に merge します。',
  ];
  if (a.report) fs.writeFileSync(a.report, lines.join('\n') + '\n');
  console.log(`\n${failed.length ? '✖ publish-gate 不合格' : '✔ publish-gate 合格'}（${failed.length} 件 NG）`);
  process.exit(failed.length ? 1 : 0);
}

try { main(); } catch (e) { console.error('✖ gate 実行エラー:', e.message); if (process.argv.includes('--report')) { const i = process.argv.indexOf('--report'); fs.writeFileSync(process.argv[i + 1], `## publish-gate: ❌ 実行エラー\n\n\`\`\`\n${e.message}\n\`\`\`\n`); } process.exit(2); }
