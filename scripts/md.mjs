// 最小限の Markdown → HTML 変換（外部依存なし）
// 対応: 見出し(###)、段落、箇条書き(- / 1.)、表(| a | b |)、コードブロック(```)、
//       インラインコード、**太字**、*斜体*、[text](url)、出典参照 [n]
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inline(text, cite) {
  // コードを先に退避
  const codes = [];
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  // 出典参照 [3] → 上付きリンク（cite が与えられた時だけ）
  if (cite) {
    s = s.replace(/\[(\d{1,2})\](?!\()/g, (m, n) => cite(Number(n)) ?? m);
  }
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
  return s;
}

export function renderMarkdown(src, { cite } = {}) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const flushPara = (buf) => {
    if (buf.length) out.push(`<p>${inline(buf.join(' '), cite)}</p>`);
    buf.length = 0;
  };
  const para = [];
  while (i < lines.length) {
    const line = lines[i];
    // コードブロック
    if (/^```/.test(line)) {
      flushPara(para);
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    // 見出し
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flushPara(para);
      const lv = Math.min(h[1].length + 2, 6); // 記事内は h3 以下に押し込む
      out.push(`<h${lv}>${inline(h[2], cite)}</h${lv}>`);
      i++;
      continue;
    }
    // 表
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flushPara(para);
      const split = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = split(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(split(lines[i++]));
      out.push('<div class="tbl"><table><thead><tr>' + head.map((c) => `<th>${inline(c, cite)}</th>`).join('') +
        '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(c, cite)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }
    // 箇条書き
    const li = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara(para);
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length) {
        const m = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i++;
        // 継続行（インデントされた行）
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].trim();
          i++;
        }
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>` + items.map((t) => `<li>${inline(t, cite)}</li>`).join('') + `</${tag}>`);
      continue;
    }
    // 引用
    if (/^>\s?/.test(line)) {
      flushPara(para);
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '), cite)}</blockquote>`);
      continue;
    }
    // 空行
    if (!line.trim()) {
      flushPara(para);
      i++;
      continue;
    }
    para.push(line.trim());
    i++;
  }
  flushPara(para);
  return out.join('\n');
}
