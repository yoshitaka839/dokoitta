#!/usr/bin/env bash
# Claude Code の PreToolUse フック: git commit / git push の前に check-secrets.sh を実行する
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
case "$cmd" in
  *"git push"*) mode=push ;;
  *"git commit"*) mode=staged ;;
  *) exit 0 ;;
esac
out=$("$CLAUDE_PROJECT_DIR/scripts/check-secrets.sh" "$mode" 2>&1) || { echo "$out" >&2; exit 2; }
exit 0
