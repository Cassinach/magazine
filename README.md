# magazine

自分専用の月刊テック雑誌。毎月1日 06:00 JST に Claude のクラウド routine が Web を調査して発刊し、`main` に push します。

- 読む: GitHub Pages のトップ（`index.html`）からバックナンバーへ。各号は単一 HTML で、**右から左へ**めくります（`←` で次ページ、`t` で目次、`p` で印刷 → PDF 保存）。
- 編集方針・スキーマ: [`CLAUDE.md`](CLAUDE.md)
- 発刊手順書（routine が従う）: [`prompts/routine.md`](prompts/routine.md)

## ローカルでビルド

```bash
node scripts/validate.mjs issues/2026-11/content.json --watchlist state/watchlist.json
node scripts/build.mjs 2026-11
open issues/2026-11.html
```

## 誌面方針を変えたいとき

routine 側の prompt は「`CLAUDE.md` と `prompts/routine.md` を読んで従え」としか書いていないので、
セクション構成・分量・調査方針を変えるときはこのリポジトリのそれらを編集して push するだけで次号から反映されます。
セクションの追加・削除は `scripts/build.mjs` の `SECTION_ORDER` / `SECTION_TITLES` と `scripts/validate.mjs` も合わせて変更してください。

routine 自体（スケジュール・モデル・有効/無効）は https://claude.ai/code/routines から。
