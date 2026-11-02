# どこいった？

高齢の家族が、いつもの眼鏡を探すのを声で手伝う iPad 向け Web アプリ（Built with Claude: Japan 2026 ハッカソン作品）。

- 記憶に頼る質問を重ねず、いつもの置き場所と時間帯から「ここかも」と一か所ずつ一緒に確かめます。
- 「必ず見つかる」とは言いません。見つからないときは探した場所を残し、続けるか休むかを選べます。
- リポジトリ内のデータはすべてサンプルです。

## セットアップ
```
cp .env.example .env   # 値を入れる（.env は公開しない）
mkdir -p .private && cp scripts/blocklist.example.txt .private/blocklist.txt  # 公開NGの言葉を書く
scripts/install-git-hooks.sh
npm install && npm run dev
```

## 送信前チェック
`scripts/check-secrets.sh` が APIキーらしい文字列、`.env`、`.private/blocklist.txt` に書いた言葉を探し、見つかったら commit / push を止めます。
Claude Code からは `.claude/settings.json` の PreToolUse フック、手作業では git の pre-commit / pre-push フックから動きます。
