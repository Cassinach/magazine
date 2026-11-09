# magazine — 編集方針（routine / 人間 共通）

このリポジトリは、個人向け月刊テック雑誌「magazine」を Claude が自動発刊するためのものです。
毎月1日 06:00 JST にクラウド routine が起動し、Web 調査 → `content.json` 執筆 → ビルド → `main` に push します。

発刊の具体的な手順は **`prompts/routine.md`** にあります。発刊作業をするときは必ず先にそれを読んでください。

## 構成

| パス | 役割 |
|---|---|
| `prompts/routine.md` | 発刊手順書（調査 → 執筆 → 検証 → ビルド → push） |
| `template/magazine.html` | 誌面テンプレート（右→左めくり、単一 HTML、印刷 CSS 内蔵） |
| `template/sample/` | テンプレート検証用のサンプル号データ |
| `scripts/validate.mjs` | `content.json` のスキーマ検証 |
| `scripts/build.mjs` | `content.json` → `issues/YYYY-MM.html`、`index.html` 再生成 |
| `scripts/diff.mjs` | watchlist の前号比較 |
| `scripts/md.mjs` | 記事本文用の最小 Markdown レンダラ |
| `state/watchlist.json` | 定点観測ボードの元データ（毎号更新） |
| `issues/YYYY-MM/content.json` | 号ごとの原稿（構造化データ） |
| `issues/YYYY-MM/watchlist.json` | その号時点の watchlist スナップショット（build が自動生成） |
| `issues/YYYY-MM.html` | 発刊物 |
| `index.html` | バックナンバー一覧（GitHub Pages のトップ） |

依存パッケージはありません。Node.js 20 以上があれば `node scripts/*.mjs` がそのまま動きます。

## コマンド

```bash
node scripts/validate.mjs issues/2026-11/content.json --watchlist state/watchlist.json
node scripts/build.mjs 2026-11          # issues/2026-11.html と index.html を生成
# テンプレートだけ確認したいとき
node scripts/build.mjs --content template/sample/content.json --out /tmp/sample.html \
  --watchlist template/sample/watchlist.json --prev-watchlist template/sample/prev-watchlist.json
```

## 編集の原則

1. **出典のない記述は書かない。** 記事・watchlist の pick には必ず URL と日付つきの出典を付ける。validate が弾きます。
2. **一次情報を優先する。** 公式ブログ、GitHub Releases、arXiv、公式ドキュメント。まとめ記事や SNS は補助。
3. **結論を先に。** 見出しと lead で「何が起きて、自分にどう関係するか」が分かるようにする。
4. **分量はページに収める。** 1 記事 = 1 ページ。本文は 600〜1800 字（最大 2600 字）。長くなるなら記事を分ける。
5. **文体はです・ます調。** 技術用語・固有名詞は原語のまま。無駄な煽りは書かない。
6. **変化を書く。** 「先月と比べて何が変わったか」を意識する。watchlist の pick を変えたときは理由を明記する。
7. **誌面の見た目はテンプレートに任せる。** `content.json` に HTML を書かない。本文は Markdown の小サブセットのみ。

## content.json スキーマ（要約）

```jsonc
{
  "title": "magazine",
  "issue": "2026-12",             // YYYY-MM
  "volume": 2,                    // 創刊号を 1 とする通し番号
  "published_at": "2026-12-01",   // YYYY-MM-DD
  "model": "claude-fable-5-1",
  "incomplete": false,            // 調査・ビルドが一部完了しなかったら true
  "incomplete_note": "",
  "headlines": [ { "kicker": "AI", "text": "表紙の見出し（3 本ちょうど）" }, ... ],
  "editorial": "巻頭言（Markdown、300〜500 字）",
  "sections": [
    { "id": "dashboard", "lead": "定点観測ボードの導入文（任意）" },
    { "id": "feature",  "title": "巻頭特集", "lead": "扉の導入文", "articles": [ ARTICLE ] },
    { "id": "frontend", "lead": "...", "articles": [ ARTICLE, ... ] },   // backend / infra / recon3d / ai / devtools / security も同じ形
    { "id": "releases", "items": [ { "name": "Node.js", "version": "25.2.0", "date": "2026-11-12", "note": "一言", "url": "https://..." } ],
                        "upcoming": [ { "name": "Rust", "expected": "2026-12-11", "note": "...", "url": "" } ] },
    { "id": "try", "items": [ { "title": "...", "time": "60分", "why": "...", "steps": ["手順（Markdown 可）", ...], "done": "できたら…", "sources": [ SOURCE ] } ] },  // 3 件ちょうど
    { "id": "glossary", "items": [ { "term": "用語", "desc": "説明（Markdown 可）" } ] }
  ]
}
// ARTICLE
{ "headline": "見出し", "topic": "構成 | パッケージマネージャー | ... （任意）", "impact": "high|mid|low",
  "tags": ["Next.js"], "lead": "結論を先に書くリード文（80〜150 字）",
  "body": "Markdown 本文。出典参照は [1] [2] のように sources の 1 始まり番号で書く",
  "next_step": "自分の次のプロジェクトでどう効くか（1 文、任意）",
  "sources": [ SOURCE, ... ] }
// SOURCE
{ "title": "ページタイトル", "url": "https://...", "date": "2026-11-05" }
```

セクション `id` と並び順は `scripts/build.mjs` の `SECTION_ORDER` で固定されています。
必須セクションと最低記事数は `scripts/validate.mjs` の `REQUIRED_SECTIONS` / `MIN_ARTICLES` を参照。
