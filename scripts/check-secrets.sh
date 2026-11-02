#!/usr/bin/env bash
# GitHub に送る前に、APIキーや家族の実際の情報が入っていないか確かめる。
# 使い方: scripts/check-secrets.sh [staged|push]
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
mode="${1:-staged}"
if [ "$mode" = "push" ]; then
  files=$(git ls-files)
else
  files=$(git diff --cached --name-only --diff-filter=ACM)
fi
[ -z "$files" ] && exit 0
ng=0
# 1) .env や .private が含まれていないか
for f in $files; do
  case "$f" in
    .env|.env.*) [ "$f" != ".env.example" ] && { echo "NG: $f は公開できません"; ng=1; } ;;
    .private/*) echo "NG: $f は公開できません"; ng=1 ;;
  esac
done
# 2) APIキーらしい文字列
pat='sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY'
for f in $files; do
  [ -f "$f" ] || continue
  if grep -EnI "$pat" "$f" >/dev/null 2>&1; then echo "NG: $f にAPIキーらしい文字列があります"; ng=1; fi
done
# 3) 公開してはいけない言葉（.private/blocklist.txt）
bl=".private/blocklist.txt"
if [ -f "$bl" ]; then
  while IFS= read -r w; do
    case "$w" in ''|'#'*) continue ;; esac
    for f in $files; do
      [ -f "$f" ] || continue
      if grep -FqI -- "$w" "$f"; then echo "NG: $f に公開できない言葉が入っています（内容は表示しません）"; ng=1; fi
    done
  done < "$bl"
fi
if [ $ng -ne 0 ]; then echo "→ 送信を止めました。上のファイルを直してください。" >&2; exit 2; fi
exit 0
