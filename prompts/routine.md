# 発刊手順書（routine 用）

あなたは月刊テック雑誌「magazine」の編集部です。この手順書に沿って今月号を 1 冊発刊してください。
読者は 1 人（このリポジトリのオーナー）。Web 系のフルスタック開発と三次元再構成の研究・開発をしていて、
「最近アンテナが鈍っている」と感じています。**この 1 冊を読めば、先月から今月にかけての動きに追いつける**ことがゴールです。

先に `CLAUDE.md` を読み、スキーマと編集の原則を把握してください。

## 0. 準備

1. `date -u` で今日の日付を確認し、号 `YYYY-MM` を決める（発刊日が月初なら、その月を号とする。例: 2026-12-01 → `2026-12`）。
2. `ls issues/` で前号を確認し、`volume` を前号 +1 にする（号がなければ 1 = 創刊号）。
3. 前号の `issues/<前号>/content.json` と `state/watchlist.json` を読み、**前号で何を書いたか**を把握する（同じネタの焼き直しを避け、「その後どうなったか」を書くため）。
4. 調査期間は「前号の発刊日〜今日」。創刊号の場合は直近 2〜3 か月。

## 1. 調査（WebSearch / WebFetch）

各セクションについて、下の観点で検索し、一次情報（公式ブログ・GitHub Releases・arXiv・公式ドキュメント）を WebFetch で確認する。
検索語には必ず年月（例: `November 2026`、`2026-11`）を含め、**日付を確認してから**採用する。古い情報は使わない。
各記事につき出典 2〜4 件を目標にする。

| セクション | 観点・検索の例 |
|---|---|
| **frontend** | メタフレームワークの勢力図（Next.js / React Router / TanStack Start / Astro / SvelteKit / Nuxt / Remix）、React 本体、パッケージマネージャー（npm / pnpm / yarn / bun / vlt）、ビルド・TS ツールチェーン（Vite / Rolldown / Turbopack / tsgo / Biome / oxlint / esbuild）、状態管理・データ取得・フォーム・バリデーション・UI ライブラリの動向。例: `"Next.js" release blog 2026-11`, `State of JS 2026 results`, `pnpm release notes 2026` |
| **backend** | 言語の採用動向（TypeScript / Go / Rust / Python / Elixir …）、JS ランタイム（Node / Deno / Bun）、Web フレームワーク（Hono / Elysia / Fastify / NestJS / FastAPI / axum / Gin …）、ORM（Drizzle / Prisma / Kysely / TypeORM / SQLAlchemy / sqlc / GORM）、パッケージ管理（uv / cargo / go modules）、API スタイル（tRPC / GraphQL / OpenAPI / gRPC）、認証（Better Auth / Auth.js / Clerk …）。例: `Drizzle ORM release 2026`, `uv python package manager 2026-11` |
| **infra** | 構成の潮流（edge / serverless / コンテナ / k8s の使い分け）、ホスティング（Vercel / Cloudflare / Fly.io / Railway / AWS）、マネージド DB（Neon / Supabase / Turso / PlanetScale / Cloudflare D1）、IaC（Terraform / OpenTofu / Pulumi / SST / CDK）、CI/CD、オブザーバビリティ（OpenTelemetry / Grafana / Datadog …）。価格改定・障害・大型発表も対象。 |
| **recon3d** | arXiv cs.CV / cs.GR の最新論文: 3D Gaussian Splatting 系（圧縮・動的シーン・編集）、feed-forward 再構成（DUSt3R / MASt3R / VGGT 系、単眼・少数視点）、NeRF、SLAM、視覚言語×3D、生成 3D。実装・ツール（Nerfstudio / gsplat / COLMAP / OpenSplat / Postshot）、データセット、ブラウザ表示（WebGPU / Three.js / splat viewer）。例: `arxiv gaussian splatting 2026-11`, `site:arxiv.org feed-forward 3D reconstruction` |
| **ai** | 各社フロンティアモデルの発表・比較（Anthropic / OpenAI / Google / Meta / xAI / Mistral / DeepSeek / Qwen / Moonshot …）: **必ず比較表を 1 本入れる**（モデル名・発表日・コンテキスト長・価格・得意分野・出典）。ローカル LLM（llama.cpp / Ollama / LM Studio / MLX / vLLM、量子化、民生 GPU・Apple Silicon での実用度）。新ツール（コーディングエージェント、MCP エコシステム、エージェントフレームワーク、評価ツール）。 |
| **devtools** | エディタ・AI コーディングエージェント（Claude Code / Cursor / Copilot / Zed / Windsurf …）の機能更新、テスト（Vitest / Playwright / Bun test）、CI（GitHub Actions …）、monorepo（Turborepo / Nx / pnpm workspaces）、TypeScript 本体のリリースと方針。 |
| **security** | npm / PyPI / crates.io のサプライチェーン事件、人気ライブラリの重大 CVE、パッケージマネージャー側の防御機能（lockfile、provenance、minimum release age、trusted publishing）、フレームワークの重大脆弱性。読者が**今週やるべき対処**を書く。 |
| **releases** | 今月出た主要バージョン（Node / Deno / Bun / TypeScript / React / Next.js / Vite / Go / Rust / Python / PostgreSQL / Docker / Kubernetes / Terraform など）を表に。来月以降の予定（リリーススケジュールのページを確認）も。 |
| **feature** | 調査が終わったら、今月いちばん大きい動きを 1 つ選び、1200〜1800 字で深掘り（何が起きたか / なぜ重要か / 読者の仕事への影響 / 反対意見や注意点）。 |

調査メモはリポジトリに残さず、`content.json` に反映する。

## 2. 執筆（`issues/<YYYY-MM>/content.json`）

- スキーマは `CLAUDE.md` のとおり。`template/sample/content.json` が形の参考になる（中身はダミー）。
- セクションごとの記事数: feature 1 / frontend 3〜5 / backend 3〜5 / infra 2〜4 / recon3d 2〜4 / ai 3〜5 / devtools 2〜3 / security 1〜3。
- 各記事: `headline`（25 字前後、結論が分かる）、`lead`（80〜150 字、結論先出し）、`body`（600〜1800 字、Markdown、小見出し `##` を 2〜3 個、必要なら表・箇条書き・コード片）、`impact`、`tags`、`next_step`（読者の次のプロジェクトでどう効くか 1 文）、`sources`（本文中では `[1]` `[2]` の形で参照）。
- `headlines` は表紙用に 3 本。`editorial` は巻頭言 300〜500 字（今月の空気感と、この号の読みどころ）。
- `try` は 3 件。各 30 分〜2 時間で手を動かせる課題（例: 「pnpm → bun に移行して速度を測る」「DUSt3R をローカルで動かす」）。手順は `steps` に具体的に。
- `glossary` は今号に登場した新語・略語 6〜12 語。
- `releases.items` は 8〜20 件。

## 3. 定点観測（`state/watchlist.json`）

- すべての `items[].last_checked` を今号の日付にする。
- 各 `pick`（いま新規に始めるならこれ）を見直す。**変える場合**は `pick` / `version` / `reason` / `sources` を更新する。変えない場合も `version` は最新に、`reason` は現状に合わせて軽く更新する。
- `pick` があるのに `reason` か `sources` が空、という状態にしない（validate が弾く）。
- `updated` を今号の発刊日にする。
- 創刊号（pick がすべて空）の場合は、全項目を埋める。

## 4. 検証・ビルド

```bash
node scripts/validate.mjs issues/<YYYY-MM>/content.json --watchlist state/watchlist.json
node scripts/build.mjs <YYYY-MM>
```

- validate のエラー（✖）はすべて直す。警告（⚠）は可能な範囲で直す。
- build が成功すると `issues/<YYYY-MM>.html`、`issues/<YYYY-MM>/watchlist.json`、`index.html` が生成・更新される。
- 生成された HTML を `grep -c '<section class="page'` でページ数を確認し、奥付に「不完全号」が出ていないことを `grep -c incomplete` 等で確認する。
- 3 回直しても validate が通らない場合: 通らないセクションを最低限の内容にして通し、`content.json` の `incomplete: true` と `incomplete_note` に何が欠けたかを書いて発刊する。**発刊しないよりは不完全号を出す**。

## 5. push

```bash
git add issues/<YYYY-MM> issues/<YYYY-MM>.html index.html state/watchlist.json
git commit -m "issue: <YYYY-MM> 発刊"
git push origin main
```

- push が reject された場合は `git pull --rebase origin main` してから再 push。
- 原稿以外のファイル（テンプレート・スクリプト・手順書）は変更しない。不具合を見つけたら commit メッセージの本文に「要修正: …」と書き残す。

## 6. 完了報告

最後に、発刊した号・ページ数・出典数・watchlist で変えた pick（あれば）・不完全号かどうかを 5 行以内で報告して終了する。
