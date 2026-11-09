#!/usr/bin/env node
// content.json のスキーマ検証。問題があれば一覧を出して exit 1。
//   node scripts/validate.mjs issues/2026-11/content.json [--watchlist state/watchlist.json]
import fs from 'node:fs';
import { SECTION_ORDER } from './build.mjs';

const REQUIRED_SECTIONS = ['feature', 'frontend', 'backend', 'infra', 'recon3d', 'ai', 'devtools', 'security', 'releases', 'try', 'glossary'];
const MIN_ARTICLES = { feature: 1, frontend: 3, backend: 3, infra: 2, recon3d: 2, ai: 3, devtools: 2, security: 1 };
const MAX_BODY_CHARS = 2600; // 1 ページに収まる目安（超えたら警告）
const IMPACTS = new Set(['high', 'mid', 'low']);

const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);
const isUrl = (u) => /^https?:\/\/\S+$/.test(String(u || ''));
const isDate = (d) => /^\d{4}-\d{2}(-\d{2})?$/.test(String(d || ''));

function checkSources(where, sources, { required = true } = {}) {
  if (!Array.isArray(sources) || !sources.length) {
    if (required) err(`${where}: sources が空です（出典のない記事は掲載できません）`);
    return;
  }
  sources.forEach((s, i) => {
    const w = `${where} sources[${i}]`;
    if (!isUrl(s.url)) err(`${w}: url が http(s) URL ではありません: ${s.url}`);
    if (!s.title) warn(`${w}: title がありません`);
    if (!isDate(s.date)) err(`${w}: date は YYYY-MM-DD 形式にしてください: ${s.date}`);
  });
}

function checkArticle(where, a, bodyLocalCites = true) {
  for (const k of ['headline', 'lead', 'body']) if (!a[k] || !String(a[k]).trim()) err(`${where}: ${k} が空です`);
  if (a.impact && !IMPACTS.has(a.impact)) err(`${where}: impact は high|mid|low のいずれか: ${a.impact}`);
  if (!a.impact) warn(`${where}: impact がありません`);
  if (!Array.isArray(a.tags) || !a.tags.length) warn(`${where}: tags が空です`);
  if (a.body && a.body.length > MAX_BODY_CHARS) warn(`${where}: body が ${a.body.length} 文字（目安 ${MAX_BODY_CHARS}）。ページ内スクロールになります`);
  checkSources(where, a.sources);
  if (bodyLocalCites && Array.isArray(a.sources)) {
    const n = a.sources.length;
    for (const m of String(a.body || '').matchAll(/\[(\d{1,2})\](?!\()/g)) {
      const k = Number(m[1]);
      if (k < 1 || k > n) err(`${where}: 本文の出典参照 [${k}] に対応する sources がありません（sources は ${n} 件）`);
    }
  }
}

function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) { console.error('使い方: node scripts/validate.mjs <content.json> [--watchlist <watchlist.json>]'); process.exit(2); }
  const wlIdx = rest.indexOf('--watchlist');
  let content;
  try { content = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`✖ JSON として読めません: ${e.message}`); process.exit(1); }

  if (!/^\d{4}-\d{2}$/.test(content.issue || '')) err(`issue は YYYY-MM 形式: ${content.issue}`);
  if (!Number.isInteger(content.volume) || content.volume < 1) err(`volume は 1 以上の整数: ${content.volume}`);
  if (!isDate(content.published_at)) err(`published_at は YYYY-MM-DD 形式: ${content.published_at}`);
  if (!content.model) warn('model が空です');
  if (!Array.isArray(content.headlines) || content.headlines.length !== 3) err(`headlines は表紙用にちょうど 3 件必要です（現在 ${content.headlines?.length ?? 0}）`);
  (content.headlines ?? []).forEach((h, i) => { if (!h.text) err(`headlines[${i}].text が空です`); if (!h.kicker) warn(`headlines[${i}].kicker が空です`); });
  if (!content.editorial) warn('editorial（巻頭言）がありません');

  if (!Array.isArray(content.sections)) { err('sections が配列ではありません'); return finish(); }
  const ids = content.sections.map((s) => s.id);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) err(`sections.id が重複: ${[...new Set(dup)].join(', ')}`);
  for (const id of ids) if (!SECTION_ORDER.includes(id) && id !== 'dashboard') err(`不明な sections.id: ${id}（使えるのは ${['dashboard', ...SECTION_ORDER].join(', ')}）`);
  for (const id of REQUIRED_SECTIONS) if (!ids.includes(id)) err(`必須セクションがありません: ${id}`);

  for (const sec of content.sections) {
    const where = `sections[${sec.id}]`;
    if (sec.id === 'dashboard') continue;
    if (sec.id === 'releases') {
      if (!Array.isArray(sec.items) || sec.items.length < 5) err(`${where}: items は 5 件以上（現在 ${sec.items?.length ?? 0}）`);
      (sec.items ?? []).forEach((r, i) => {
        if (!r.name || !r.version) err(`${where}.items[${i}]: name / version は必須`);
        if (!isDate(r.date)) err(`${where}.items[${i}]: date は YYYY-MM-DD: ${r.date}`);
        if (r.url && !isUrl(r.url)) err(`${where}.items[${i}]: url が不正: ${r.url}`);
        if (!r.url) warn(`${where}.items[${i}] (${r.name}): url がありません`);
      });
      continue;
    }
    if (sec.id === 'try') {
      if (!Array.isArray(sec.items) || sec.items.length !== 3) err(`${where}: items はちょうど 3 件（現在 ${sec.items?.length ?? 0}）`);
      (sec.items ?? []).forEach((t, i) => {
        const w = `${where}.items[${i}]`;
        if (!t.title) err(`${w}: title が空`);
        if (!t.time) warn(`${w}: time（所要時間）がありません`);
        if (!t.why) warn(`${w}: why がありません`);
        if (!Array.isArray(t.steps) || t.steps.length < 3) err(`${w}: steps は 3 手順以上`);
        checkSources(w, t.sources, { required: false });
      });
      continue;
    }
    if (sec.id === 'glossary') {
      if (!Array.isArray(sec.items) || sec.items.length < 5) err(`${where}: items は 5 語以上（現在 ${sec.items?.length ?? 0}）`);
      (sec.items ?? []).forEach((g, i) => { if (!g.term || !g.desc) err(`${where}.items[${i}]: term / desc は必須`); });
      continue;
    }
    if (!sec.lead) warn(`${where}: lead（扉の導入文）がありません`);
    const n = sec.articles?.length ?? 0;
    const min = MIN_ARTICLES[sec.id] ?? 1;
    if (n < min) err(`${where}: articles は ${min} 本以上（現在 ${n}）`);
    if (n > 8) warn(`${where}: articles が ${n} 本。多すぎると読み切れません（目安 3〜6）`);
    (sec.articles ?? []).forEach((a, i) => checkArticle(`${where}.articles[${i}] "${(a.headline || '').slice(0, 20)}"`, a));
  }

  if (wlIdx >= 0) {
    const wl = JSON.parse(fs.readFileSync(rest[wlIdx + 1], 'utf8'));
    (wl.items ?? []).forEach((it) => {
      const w = `watchlist[${it.id}]`;
      if (!it.pick) { warn(`${w}: pick が未記入`); return; }
      if (!it.reason) err(`${w}: pick があるのに reason がありません`);
      if (!Array.isArray(it.sources) || !it.sources.length) err(`${w}: pick があるのに sources がありません`);
      if (!isDate(it.last_checked)) err(`${w}: last_checked は YYYY-MM-DD: ${it.last_checked}`);
      if (it.last_checked && content.published_at && it.last_checked < content.published_at.slice(0, 7)) warn(`${w}: last_checked (${it.last_checked}) が今号より古いままです`);
    });
    if (wl.updated !== content.published_at?.slice(0, 10) && wl.updated !== content.issue) warn(`watchlist.updated (${wl.updated}) を今号の日付に更新してください`);
  }
  finish();
}

function finish() {
  for (const w of warns) console.log(`  ⚠ ${w}`);
  for (const e of errors) console.log(`  ✖ ${e}`);
  if (errors.length) { console.log(`\n✖ validate 失敗: エラー ${errors.length} 件、警告 ${warns.length} 件`); process.exit(1); }
  console.log(`\n✔ validate OK（警告 ${warns.length} 件）`);
}

main();
