#!/usr/bin/env node
// content.json → 単一 HTML の雑誌を生成し、index.html を更新する
//   node scripts/build.mjs 2026-11
//   node scripts/build.mjs --content path/to/content.json --out out.html [--watchlist w.json] [--prev-watchlist p.json] [--no-index]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { renderMarkdown, escapeHtml as esc } from './md.mjs';
import { diffWatchlist, TREND_LABEL } from './diff.mjs';
import { sniffFigure, FIGURE_TYPES } from './fetch-figure.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // テンプレートは常にこのリポジトリのものを使う
let ROOT = REPO;        // 原稿・出力の基準ディレクトリ（--root で差し替え可。gate が PR のツリーを指定する）
let ISSUES_DIR = path.join(ROOT, 'issues');

// href に入れてよい URL だけ通す（http/https 以外は空にする）
export const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u ?? '')) ? String(u) : '');

export const SECTION_ORDER = ['feature', 'frontend', 'backend', 'infra', 'recon3d', 'ai', 'devtools', 'security', 'releases', 'try', 'glossary'];
export const SECTION_TITLES = {
  dashboard: '定点観測ボード', feature: '巻頭特集', frontend: 'Frontend', backend: 'Backend', infra: 'Infra',
  recon3d: '三次元再構成', ai: 'AI', devtools: 'Dev Tooling & DX', security: 'セキュリティ & サプライチェーン',
  releases: 'リリースカレンダー', try: '今月試す3つ', glossary: '新語辞典', colophon: '奥付・出典',
};
const IMPACT_LABEL = { high: '影響大', mid: '影響中', low: '小ネタ' };

// ---------- 引数 ----------
function parseArgs(argv) {
  const a = { noIndex: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--content') a.content = argv[++i];
    else if (v === '--out') a.out = argv[++i];
    else if (v === '--watchlist') a.watchlist = argv[++i];
    else if (v === '--prev-watchlist') a.prevWatchlist = argv[++i];
    else if (v === '--no-index') a.noIndex = true;
    else if (v === '--root') a.root = argv[++i];
    else if (/^\d{4}-\d{2}$/.test(v)) a.issue = v;
    else throw new Error(`不明な引数: ${v}`);
  }
  return a;
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function listIssues() {
  if (!fs.existsSync(ISSUES_DIR)) return [];
  return fs.readdirSync(ISSUES_DIR).filter((d) => /^\d{4}-\d{2}$/.test(d) && fs.existsSync(path.join(ISSUES_DIR, d, 'content.json'))).sort();
}

// ---------- ページ生成 ----------
export function buildHtml(content, { template, watchlist, prevWatchlist, issueDir }) {
  const pages = []; // { id, sec, secTitle, anchor, cls, render(ctx) }
  const sources = []; // 全出典（URL で重複排除）
  const srcIndex = new Map();
  const addSource = (s) => {
    const key = (s.url || '').trim();
    if (srcIndex.has(key)) return srcIndex.get(key);
    sources.push({ ...s, url: key });
    srcIndex.set(key, sources.length);
    return sources.length;
  };
  const page = (p) => { pages.push(p); return p; };
  const secMap = new Map((content.sections ?? []).map((s) => [s.id, s]));
  const title = content.title || 'magazine';
  const issueLabel = content.issue;
  const [yy, mm] = issueLabel.split('-');
  const volNo = content.volume ? `Vol.${content.volume}` : '';
  const dateJa = `${yy}年${Number(mm)}月号`;

  const srcList = (list, globals) =>
    `<div class="sources"><ol start="${globals[0]}">` +
    list.map((s, i) => `<li value="${globals[i]}">${safeUrl(s.url) ? `<a href="${esc(safeUrl(s.url))}">${esc(s.title || s.url)}</a>` : esc(s.title || '')}${s.date ? `<span class="d">${esc(s.date)}</span>` : ''}</li>`).join('') +
    '</ol></div>';

  const folio = (n) => `<div class="folio">${n}</div>`;
  const thumb = (sec, label) => `<div class="thumb" data-sec="${sec}"><span>${esc(label)}</span></div>`;

  // 図版: issues/<号>/figures/fig-NN.(png|jpg|gif|webp) を data URI で埋め込む（単一ファイルを保つ）
  const figureHtml = (f, globalsOf) => {
    if (!issueDir || !f || !/^fig-\d{2}\.(png|jpe?g|gif|webp)$/.test(String(f.file || ''))) return '';
    const file = path.join(issueDir, 'figures', f.file);
    if (!fs.existsSync(file)) return '';
    const buf = fs.readFileSync(file);
    const ext = sniffFigure(buf);
    if (!ext) return '';
    const srcNo = f.source && globalsOf ? globalsOf(Number(f.source)) : null;
    return `<figure class="fig"><img src="data:${FIGURE_TYPES[ext].mime};base64,${buf.toString('base64')}" alt="${esc(f.alt || f.caption || '')}">` +
      `<figcaption>${esc(f.caption || '')}${srcNo ? ` <a class="figsrc" href="#src-${srcNo}" data-goto="__colophon__">[${srcNo}]</a>` : ''}</figcaption></figure>`;
  };
  const summaryHtml = (list) => (Array.isArray(list) && list.length)
    ? `<div class="summary"><div class="summary-t">3 行でいうと</div><ul>${list.map((t) => `<li>${renderMarkdown(String(t)).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ul></div>`
    : '';

  // --- 表紙 ---
  page({
    sec: 'cover', secTitle: '', anchor: 'cover', cls: 'cover',
    render: () => `
      <div class="body">
        <div class="masthead"><h1 class="brand">${esc(title)}</h1><p class="sub">Personal Tech Monthly</p></div>
        <div class="issue-no"><b>${esc(dateJa)}</b><small>${esc(volNo)}${content.incomplete ? ' ・ 不完全号' : ''}</small></div>
        <div class="headlines">
          ${(content.headlines ?? []).map((h) => `<div class="h"><small>${esc(h.kicker || '')}</small>${esc(h.text)}</div>`).join('')}
        </div>
        <div class="foot"><span>右から左へお読みください</span><span>${esc(content.published_at || '')}</span></div>
      </div>`,
  });

  // --- 目次（中身は後で） ---
  const tocPage = page({ sec: 'toc', secTitle: '目次', anchor: 'toc', cls: 'tocpage', render: null });

  // --- 巻頭言 ---
  if (content.editorial) {
    page({
      sec: 'toc', secTitle: '巻頭言', anchor: 'editorial', cls: 'editorial',
      render: (ctx) => `<div class="body"><p class="kicker">Editorial</p><h2>巻頭言</h2>${renderMarkdown(content.editorial)}</div>${folio(ctx.n)}`,
    });
  }

  // --- 定点観測ボード ---
  if (watchlist) {
    const rows = diffWatchlist(prevWatchlist, watchlist).filter((r) => r.pick);
    const dashSec = secMap.get('dashboard') || {};
    const chunks = [];
    for (let i = 0; i < rows.length; i += 16) chunks.push(rows.slice(i, i + 16));
    if (!chunks.length) chunks.push([]);
    chunks.forEach((chunk, ci) => {
      page({
        sec: 'dashboard', secTitle: SECTION_TITLES.dashboard, anchor: ci === 0 ? 'sec-dashboard' : `sec-dashboard-${ci + 1}`, cls: 'dashboard',
        tocEntry: ci === 0 ? { kind: 'section', no: '00', title: SECTION_TITLES.dashboard } : null,
        render: (ctx) => `
          ${thumb('dashboard', SECTION_TITLES.dashboard)}
          <div class="body">
            <p class="kicker">Watchlist</p>
            <h2>${esc(SECTION_TITLES.dashboard)}${chunks.length > 1 ? ` <small style="font-size:.5em;color:var(--muted)">(${ci + 1}/${chunks.length})</small>` : ''}</h2>
            ${ci === 0 && dashSec.lead ? `<p class="lead">${esc(dashSec.lead)}</p>` : ''}
            ${ci === 0 ? `<p class="legend">${Object.entries(TREND_LABEL).map(([k, v]) => `<span class="trend-${k}">${v.mark} ${v.label}</span>`).join('')}<span>前号（${esc(prevWatchlist?.updated || '—')}）との比較</span></p>` : ''}
            <table class="dash"><thead><tr><th>層</th><th>いま採用するなら</th><th>対抗</th><th>理由</th><th>変化</th></tr></thead><tbody>
            ${chunk.map((r) => {
              const t = TREND_LABEL[r.trend];
              const srcs = (r.sources ?? []).filter((s) => safeUrl(s.url)).map((s) => `<a href="${esc(safeUrl(s.url))}" title="${esc(s.title || '')}">[↗]</a>`).join('');
              return `<tr>
                <td><div class="layer">${esc(r.layer)}</div>${esc(r.topic)}</td>
                <td><span class="pick">${esc(r.pick)}</span>${r.version ? `<span class="ver">${esc(r.version)}</span>` : ''}</td>
                <td class="alt">${(r.alternatives ?? []).map(esc).join(' / ')}</td>
                <td class="why">${esc(r.reason || '')} <span class="src">${srcs}</span></td>
                <td class="trend trend-${r.trend}">${t.mark} ${t.label}${r.from ? `<span class="from">${esc(r.from)}</span>` : ''}</td>
              </tr>`;
            }).join('')}
            </tbody></table>
            ${!rows.length ? '<p class="lead">watchlist が未記入です。</p>' : ''}
          </div>${folio(ctx.n)}`,
      });
    });
  }

  // --- 各セクション ---
  let secNo = 0;
  for (const id of SECTION_ORDER) {
    const sec = secMap.get(id);
    if (!sec) continue;
    secNo++;
    const no = String(secNo).padStart(2, '0');
    const secTitle = sec.title || SECTION_TITLES[id];
    const articlePages = [];
    const opener = page({
      sec: id, secTitle, anchor: `sec-${id}`, cls: 'opener',
      tocEntry: { kind: 'section', no, title: secTitle, articles: articlePages },
      render: (ctx) => `
        ${thumb(id, secTitle)}
        <div class="body">
          <div class="big">${no}</div>
          <p class="kicker">Section ${no}</p>
          <h2>${esc(secTitle)}</h2>
          ${sec.lead ? `<p class="lead">${esc(sec.lead)}</p>` : ''}
          <ul class="list">${articlePages.map((ap) => `<li data-goto="${ap.id}"><span>${esc(ap.tocLabel)}</span><span class="pg">${ap.n}</span></li>`).join('')}</ul>
        </div>${folio(ctx.n)}`,
    });

    if (id === 'releases') {
      const items = sec.items ?? [];
      const up = sec.upcoming ?? [];
      const ap = page({
        sec: id, secTitle, anchor: `a-${id}-1`, cls: 'releases', tocLabel: '今月の主要リリース',
        render: (ctx) => `
          ${thumb(id, secTitle)}
          <div class="body">
            <p class="kicker">${esc(secTitle)}</p>
            <h2>今月の主要リリース</h2>
            <div class="tbl"><table class="rel"><thead><tr><th>プロダクト</th><th>バージョン</th><th>日付</th><th>ひとこと</th></tr></thead><tbody>
            ${items.map((r) => `<tr><td>${safeUrl(r.url) ? `<a href="${esc(safeUrl(r.url))}">${esc(r.name)}</a>` : esc(r.name)}</td><td class="v">${esc(r.version)}</td><td class="d">${esc(r.date || '')}</td><td>${esc(r.note || '')}</td></tr>`).join('')}
            </tbody></table></div>
            ${up.length ? `<h3>来月以降の予定</h3><div class="tbl"><table class="rel"><thead><tr><th>プロダクト</th><th>予定</th><th>見どころ</th></tr></thead><tbody>
            ${up.map((r) => `<tr><td>${safeUrl(r.url) ? `<a href="${esc(safeUrl(r.url))}">${esc(r.name)}</a>` : esc(r.name)}</td><td class="d">${esc(r.expected || '')}</td><td>${esc(r.note || '')}</td></tr>`).join('')}
            </tbody></table></div>` : ''}
          </div>${folio(ctx.n)}`,
      });
      articlePages.push(ap);
      continue;
    }

    if (id === 'try') {
      (sec.items ?? []).forEach((it, k) => {
        const globals = (it.sources ?? []).map(addSource);
        const ap = page({
          sec: id, secTitle, anchor: `a-${id}-${k + 1}`, cls: 'try', tocLabel: it.title,
          render: (ctx) => `
            ${thumb(id, secTitle)}
            <div class="body">
              <p class="kicker">Try #${k + 1}</p>
              <h2>${esc(it.title)}</h2>
              ${it.time ? `<span class="time">所要 ${esc(it.time)}</span>` : ''}
              ${it.why ? `<p class="lead">${esc(it.why)}</p>` : ''}
              <ol class="steps">${(it.steps ?? []).map((s) => `<li>${renderMarkdown(s).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ol>
              ${it.done ? `<div class="next-step"><b>できたら：</b>${esc(it.done)}</div>` : ''}
              ${globals.length ? srcList(it.sources, globals) : ''}
            </div>${folio(ctx.n)}`,
        });
        articlePages.push(ap);
      });
      continue;
    }

    if (id === 'glossary') {
      const items = sec.items ?? [];
      const chunks = [];
      for (let i = 0; i < items.length; i += 14) chunks.push(items.slice(i, i + 14));
      chunks.forEach((chunk, ci) => {
        const ap = page({
          sec: id, secTitle, anchor: `a-${id}-${ci + 1}`, cls: 'glossary', tocLabel: `${chunk[0].term} 〜 ${chunk[chunk.length - 1].term}`,
          render: (ctx) => `
            ${thumb(id, secTitle)}
            <div class="body">
              <p class="kicker">Glossary</p>
              <h2>${esc(secTitle)}${chunks.length > 1 ? ` <small style="font-size:.5em;color:var(--muted)">(${ci + 1}/${chunks.length})</small>` : ''}</h2>
              <div class="gloss"><dl>${chunk.map((g) => `<dt>${esc(g.term)}</dt><dd>${renderMarkdown(g.desc).replace(/^<p>|<\/p>$/g, '')}</dd>`).join('')}</dl></div>
            </div>${folio(ctx.n)}`,
        });
        articlePages.push(ap);
      });
      continue;
    }

    // 通常の記事セクション
    (sec.articles ?? []).forEach((a, k) => {
      const globals = (a.sources ?? []).map(addSource);
      const cite = (n) => (n >= 1 && n <= globals.length) ? `<sup class="cite"><a href="#src-${globals[n - 1]}" data-goto="__colophon__" title="${esc(a.sources[n - 1].title || '')}">[${globals[n - 1]}]</a></sup>` : null;
      const globalsOf = (n) => (n >= 1 && n <= globals.length) ? globals[n - 1] : null;
      // 図版: 本文中の [fig:N] 段落の位置に置く。置かれなかった 1 枚目は本文の前、残りは本文の後ろ
      const figs = Array.isArray(a.figures) ? a.figures : [];
      const used = new Set();
      const bodyHtml = renderMarkdown(a.body, { cite }).replace(/<p>\[fig:(\d+)\]<\/p>/g, (m, n) => {
        const i = Number(n) - 1;
        if (!figs[i]) return '';
        used.add(i);
        return figureHtml(figs[i], globalsOf);
      });
      const unused = figs.map((f, i) => (used.has(i) ? null : f)).filter(Boolean);
      const figsBefore = unused.length ? figureHtml(unused[0], globalsOf) : '';
      const figsAfter = unused.slice(1).map((f) => figureHtml(f, globalsOf)).join('');
      const ap = page({
        sec: id, secTitle, anchor: `a-${id}-${k + 1}`, cls: 'article', tocLabel: a.headline,
        render: (ctx) => `
          ${thumb(id, secTitle)}
          <div class="body">
            <p class="kicker">${esc(secTitle)}${a.topic ? ` / ${esc(a.topic)}` : ''}</p>
            <h2>${esc(a.headline)}</h2>
            <div class="article-meta">
              ${a.impact ? `<span class="impact impact-${esc(a.impact)}">${IMPACT_LABEL[a.impact] || esc(a.impact)}</span>` : ''}
              ${(a.tags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}
            </div>
            ${a.lead ? `<p class="lead">${esc(a.lead)}</p>` : ''}
            ${summaryHtml(a.summary)}
            ${figsBefore}
            ${bodyHtml}
            ${figsAfter}
            ${a.next_step ? `<div class="next-step"><b>自分の次のプロジェクトでは：</b>${esc(a.next_step)}</div>` : ''}
            ${globals.length ? srcList(a.sources, globals) : ''}
          </div>${folio(ctx.n)}`,
      });
      articlePages.push(ap);
    });
  }

  // --- 奥付・出典 ---
  const colophonPages = [];
  const srcChunks = [];
  for (let i = 0; i < sources.length; i += 28) srcChunks.push(sources.slice(i, i + 28));
  if (!srcChunks.length) srcChunks.push([]);
  srcChunks.forEach((chunk, ci) => {
    const start = ci * 28 + 1;
    const p = page({
      sec: 'colophon', secTitle: SECTION_TITLES.colophon, anchor: ci === 0 ? 'colophon' : `colophon-${ci + 1}`, cls: 'colophon',
      tocEntry: ci === 0 ? { kind: 'section', no: '—', title: SECTION_TITLES.colophon } : null,
      render: (ctx) => `
        ${thumb('colophon', SECTION_TITLES.colophon)}
        <div class="body">
          ${ci === 0 ? `
          <p class="kicker">Colophon</p>
          <h2>奥付</h2>
          ${content.incomplete ? `<div class="incomplete">この号は不完全号です：${esc(content.incomplete_note || '一部セクションの調査・ビルドが完了しませんでした。')}</div>` : ''}
          <p class="meta">${esc(title)} ${esc(dateJa)} ${esc(volNo)}<br>
          発行日：${esc(content.published_at || '')}<br>
          編集・執筆：Claude（${esc(content.model || 'unknown model')}）— Web 調査にもとづく自動生成<br>
          出典数：${sources.length}　ページ数：${ctx.total}</p>
          <h3>出典一覧</h3>` : `<p class="kicker">Colophon</p><h2>出典一覧 <small style="font-size:.5em;color:var(--muted)">(${ci + 1}/${srcChunks.length})</small></h2>`}
          <ol start="${start}">${chunk.map((s, i) => `<li id="src-${start + i}">${safeUrl(s.url) ? `<a href="${esc(safeUrl(s.url))}">${esc(s.title || s.url)}</a>` : esc(s.title || '')}${s.date ? ` <span class="d">(${esc(s.date)})</span>` : ''}<br><small style="opacity:.7">${esc(safeUrl(s.url))}</small></li>`).join('')}</ol>
        </div>${folio(ctx.n)}`,
    });
    colophonPages.push(p);
  });

  // --- 番号付け ---
  pages.forEach((p, i) => { p.n = i + 1; p.id = `p${i + 1}`; });

  // --- 目次 ---
  const tocEntries = pages.filter((p) => p.tocEntry).map((p) => ({ ...p.tocEntry, page: p }));
  const tocHtml = `<ul class="toc-list">${tocEntries.map((e) => `
    <li><div class="sec" data-goto="${e.page.id}"><span class="no">${esc(e.no)}</span><span>${esc(e.title)}</span><span class="pg">${e.page.n}</span></div>
    ${e.articles?.length ? `<ul class="arts">${e.articles.map((ap) => `<li data-goto="${ap.id}"><span>${esc(ap.tocLabel)}</span><span class="pg">${ap.n}</span></li>`).join('')}</ul>` : ''}</li>`).join('')}</ul>`;
  tocPage.render = (ctx) => `<div class="body"><p class="kicker">Contents</p><h2>目次</h2>${tocHtml}</div>${folio(ctx.n)}`;

  // --- 出力 ---
  const total = pages.length;
  const colophonId = colophonPages[0].id;
  const pagesHtml = pages.map((p) => {
    const inner = p.render({ n: p.n, total }).replace(/data-goto="__colophon__"/g, `data-goto="${colophonId}"`);
    return `<section class="page ${p.cls}" id="${p.id}" data-sec="${p.sec}" data-sec-title="${esc(p.secTitle)}"${p.anchor ? ` data-anchor="${esc(p.anchor)}"` : ''}>${inner}</section>`;
  }).join('\n');

  const description = (content.headlines ?? []).map((h) => h.text).join(' / ');
  const html = template
    .replace('{{TITLE}}', esc(`${title} ${dateJa}`))
    .replace('{{DESCRIPTION}}', esc(description))
    .replace('{{PAGES}}', pagesHtml)
    .replace('{{TOC}}', tocHtml);
  return withCsp(html);
}

// テンプレート内の唯一のインライン <script> の SHA-256 を CSP に固定する。
// これ以外の script は（万一混入しても）ブラウザが実行しない。
export function withCsp(html) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) throw new Error(`テンプレートの <script> は 1 つのはずが ${scripts.length} 個あります`);
  const hash = createHash('sha256').update(scripts[0][1], 'utf8').digest('base64');
  const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'`;
  if (!html.includes('{{CSP}}')) throw new Error('テンプレートに {{CSP}} プレースホルダがありません');
  return html.replace('{{CSP}}', `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
}

// ---------- index.html ----------
export function buildIndex() {
  const issues = listIssues().reverse();
  const rows = issues.map((iss) => {
    const c = readJson(path.join(ISSUES_DIR, iss, 'content.json'));
    const [y, m] = iss.split('-');
    return `<li><a href="issues/${iss}.html"><b>${y}年${Number(m)}月号</b>${c.volume ? ` <span class="vol">Vol.${c.volume}</span>` : ''}${c.incomplete ? ' <span class="inc">不完全号</span>' : ''}</a>
      <ul>${(c.headlines ?? []).map((h) => `<li>${esc(h.text)}</li>`).join('')}</ul></li>`;
  }).join('\n');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>magazine — バックナンバー</title>
<style>
:root{--bg:#ece7dc;--paper:#fdfbf6;--ink:#1e1c18;--muted:#7a7468;--rule:#d8d1c2;--accent:#b4451f}
@media (prefers-color-scheme:dark){:root{--bg:#121110;--paper:#1d1b18;--ink:#ebe6da;--muted:#938c7e;--rule:#3a362e}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;line-height:1.8}
main{max-width:720px;margin:0 auto;padding:48px 20px}
h1{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-size:48px;margin:0 0 4px;letter-spacing:-.02em}
.sub{color:var(--muted);font-size:12px;letter-spacing:.3em;text-transform:uppercase;margin:0 0 40px}
ul.issues{list-style:none;padding:0;margin:0}
ul.issues>li{background:var(--paper);border-radius:8px;padding:18px 22px;margin:0 0 14px;box-shadow:0 10px 30px -20px rgba(0,0,0,.4)}
ul.issues>li>a{color:var(--ink);text-decoration:none;font-size:20px;font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif}
ul.issues>li>a:hover{color:var(--accent)}
.vol{font-size:12px;color:var(--muted);font-family:system-ui}
.inc{font-size:11px;color:#fff;background:#9b1c1c;border-radius:4px;padding:0 6px;font-family:system-ui}
ul.issues ul{margin:8px 0 0;padding-left:1.2em;color:var(--muted);font-size:13.5px}
footer{color:var(--muted);font-size:12px;margin-top:40px}
</style></head><body><main>
<h1>magazine</h1><p class="sub">Personal Tech Monthly — Back Issues</p>
<ul class="issues">${rows || '<li>まだ号がありません。</li>'}</ul>
<footer>毎月1日 06:00 JST に自動発刊。右から左へめくる単一 HTML。ブラウザの印刷から PDF 保存できます。</footer>
</main></body></html>`;
}

// ---------- main ----------
function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.root) { ROOT = path.resolve(args.root); ISSUES_DIR = path.join(ROOT, 'issues'); }
  const template = fs.readFileSync(path.join(REPO, 'template', 'magazine.html'), 'utf8');
  let contentPath, outPath, watchlistPath, prevWatchlistPath;
  if (args.content) {
    contentPath = args.content;
    outPath = args.out || contentPath.replace(/\.json$/, '.html');
    watchlistPath = args.watchlist;
    prevWatchlistPath = args.prevWatchlist;
  } else {
    if (!args.issue) throw new Error('使い方: node scripts/build.mjs YYYY-MM  または --content <json> --out <html>');
    const dir = path.join(ISSUES_DIR, args.issue);
    contentPath = path.join(dir, 'content.json');
    outPath = path.join(ISSUES_DIR, `${args.issue}.html`);
    // watchlist のスナップショットをこの号に保存し、前号のスナップショットと比較する
    const live = path.join(ROOT, 'state', 'watchlist.json');
    const snap = path.join(dir, 'watchlist.json');
    if (fs.existsSync(live)) fs.copyFileSync(live, snap);
    watchlistPath = fs.existsSync(snap) ? snap : null;
    const prev = listIssues().filter((i) => i < args.issue).pop();
    prevWatchlistPath = prev && fs.existsSync(path.join(ISSUES_DIR, prev, 'watchlist.json')) ? path.join(ISSUES_DIR, prev, 'watchlist.json') : null;
  }
  const content = readJson(contentPath);
  const watchlist = watchlistPath ? readJson(watchlistPath) : null;
  const prevWatchlist = prevWatchlistPath ? readJson(prevWatchlistPath) : null;
  const html = buildHtml(content, { template, watchlist, prevWatchlist, issueDir: path.dirname(path.resolve(contentPath)) });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html);
  const pagesN = (html.match(/<section class="page /g) || []).length;
  console.log(`✔ ${path.relative(ROOT, outPath)}  (${pagesN} ページ, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
  if (!args.noIndex && !args.content) {
    fs.writeFileSync(path.join(ROOT, 'index.html'), buildIndex());
    console.log('✔ index.html');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error('✖ build 失敗:', e.message); process.exit(1); }
}
