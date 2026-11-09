# magazine

自分専用の月刊テック雑誌。毎月1日 06:00 JST に Claude のクラウド routine が Web を調査して発刊します。

- **読む**: https://cassinach.github.io/magazine/ （バックナンバー一覧）。各号は単一 HTML で、**右から左へ**めくります（`←` 次ページ、`t` 目次、`p` 印刷 → PDF 保存）。
- 編集方針・スキーマ: [`CLAUDE.md`](CLAUDE.md)
- 発刊手順書（routine が従う）: [`prompts/routine.md`](prompts/routine.md)

## 発刊フロー

```
routine（信頼しない側）                      GitHub（信頼する側）
調査 → content.json / figures 執筆    push   issue/YYYY-MM ブランチ → PR
validate / build                     ───▶   publish-gate（main 側のコードで検証）
                                             ① 変更パスが原稿データだけか
                                             ② validate が通るか
                                             ③ HTML が main のテンプレから byte 一致で再現できるか
                                             ④ HTML に script / iframe / 外部リソースが無いか
                                             合格 → deploy key で main に merge → Pages 配信
                                             不合格 → PR にコメント + `gate-failed` Issue
```

Web を読む routine がプロンプトインジェクションを受けても、main に入るのは「許可パス内の原稿データと、そこから再現できる HTML」だけです。
スクリプト・テンプレート・手順書・ワークフローは routine 経由では変えられません。生成 HTML には CSP（インライン script の sha256 固定）も入っています。

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

## gate が落ちたとき

PR のコメントと `gate-failed` ラベルの Issue に理由が出ます。原稿側の問題（出典不足・スキーマ違反）なら PR ブランチを手で直して push すれば再検証されます。
`scripts/` や `template/` に変更が混ざっている場合はインジェクションを疑い、PR を閉じてください。

routine 自体（スケジュール・モデル・有効/無効・ネットワーク）は https://claude.ai/code/routines から。
