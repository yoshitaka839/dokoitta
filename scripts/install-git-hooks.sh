#!/usr/bin/env bash
cd "$(git rev-parse --show-toplevel)"
printf '#!/bin/sh\nexec scripts/check-secrets.sh staged\n' > .git/hooks/pre-commit
printf '#!/bin/sh\nexec scripts/check-secrets.sh push\n' > .git/hooks/pre-push
chmod +x .git/hooks/pre-commit .git/hooks/pre-push
echo "git フックを入れました"
