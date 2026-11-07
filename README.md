# どこいった？

老眼鏡をよく置き忘れる高齢の家族が、探すのに疲れて度の合わない古い老眼鏡で我慢してしまわないように、声で一か所ずつ探し続けられるようにする iPad 向け Web アプリです（Built with Claude: Japan 2026 ハッカソン作品）。

公開中: https://dokoitta-one.vercel.app/talk
（iPad の Safari をおすすめします。ログインは不要です。家族の設定がないときは、サンプルの家の設定で動きます。）

リポジトリ内のデータ（家の場所、一日の流れなど）はすべてサンプルです。実際の家の設定は、その iPad の中にだけ保存します。

## どんなアプリか
- 困りごとは2つ。「置いた場所を覚えていない」と「目の前にあっても気づかない」。
- 押すのは大きなボタンひとつ。見る場所を声で一か所ずつ伝え、本人は声（「あった」「なかった」）かボタンで答えます。字は大きく、言葉は短くしています。
- 案内の順番は、机の気づきにくい場所（本の上、書類の下を「さわってみてください」）→ 頭の上・首元・ポケット → 家族が設定した一日の流れから見込みの高い場所。
- 探す時刻と、置いた時刻は違います。朝早くは、前の日の夕方以降に置いたままになりやすい場所を先に案内します。
- 設定に書いた場所は、どの時刻に探しても「ひととおり見ました」の前に必ず全部案内します。
- 見つかったら「いつものメガネですか？」と確かめ、古い方なら探し続けます。
- 「必ず見つかる」とは言いません。見つからないときは探した場所を残し、休むこともできます。家族は探した記録をあとから見られます。

## Claude の使い方
- **アプリの中（Claude API / Claude Haiku）**: 探している途中で本人が手がかりを話し、それが場所の名前や家族の設定（していたこと → 場所）にない言い方のとき、`/api/rerank` で Claude が言葉を読み取り、まだ案内していない場所の中から次の場所を選びます。
  - 返事は候補の ID の中からしか選べない形（structured outputs の enum）に縛り、受け取ったあとも候補にないものは捨てます。
  - 2秒で返らなければ、プログラムの順番のまま続けます。
  - API キーはサーバー側（Vercel の環境変数）だけに置き、iPad には届きません。
- **開発（Claude Code）**: コードを書く、テスト、ビルド、GitHub への push を Claude Code が行いました。
  - 途中で一度立ち止まり、Claude が家族に父のことを聞き取って、仕様書（[docs/SPEC.md](docs/SPEC.md)）から作り直しました。
  - commit と push の前に、API キーと公開しない言葉をフックで検査しています（下の「送信前チェック」）。

## ページ
| ページ | 役目 |
|---|---|
| [/talk](https://dokoitta-one.vercel.app/talk) | 本体。大きなボタンを押すと探し始めます（`?practice=1` で練習） |
| [/settings](https://dokoitta-one.vercel.app/settings) | 家族用の設定（家の場所、一日の流れ、していたこと → 場所）。「はじめての準備」の案内つき |
| [/family](https://dokoitta-one.vercel.app/family) | 探した記録 |
| [/voice-test](https://dokoitta-one.vercel.app/voice-test) | 声の聞き取りと読み上げの確認 |

## 資料
- [docs/SPEC.md](docs/SPEC.md): 仕様書
- [docs/試行錯誤の記録.md](docs/試行錯誤の記録.md): 誰がどこで困り、なぜ、どう直したか
- [docs/note用の記録.md](docs/note用の記録.md): 開発の記録

## テスト
```
npm test
```
0時から23時まで1時間ごとに、設定した場所が一つも抜けずに案内されることなどを確かめます（`tests/plan.test.ts`）。

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

## これから
- iPhone でも、画面を見ずに声だけで最後まで使える形にする。
- そばにいる家族の「あった」に反応しないようにする。
- 始まったばかりの日課を「済んだ日課」と数えないようにする。
- しばらく使っていないあとの最初の Claude の返事が2秒を超える件を直す。
