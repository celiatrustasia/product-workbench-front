#!/bin/zsh
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"
if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 Node.js / npm。"
  read -r "?按回车关闭..."
  exit 1
fi
if [[ ! -d node_modules ]]; then npm ci; fi
if [[ ! -d server/node_modules ]]; then npm --prefix server ci; fi
if npm run start:local; then
  open "http://127.0.0.1:5174/"
else
  read -r "?启动失败，按回车关闭..."
  exit 1
fi
