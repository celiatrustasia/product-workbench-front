#!/bin/zsh

set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PREVIEW_URL="http://127.0.0.1:5174/"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$PROJECT_DIR" || exit 1

if curl --silent --fail --max-time 2 "$PREVIEW_URL" >/dev/null 2>&1; then
  open "$PREVIEW_URL"
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm，请先安装 Node.js。"
  read -r "?按回车键关闭..."
  exit 1
fi

npm run dev -- --host 127.0.0.1 --port 5174 &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1
}
trap cleanup EXIT INT TERM

for _ in {1..40}; do
  if curl --silent --fail --max-time 1 "$PREVIEW_URL" >/dev/null 2>&1; then
    open "$PREVIEW_URL"
    wait "$SERVER_PID"
    exit $?
  fi
  sleep 0.25
done

echo "预览服务启动失败，请检查上方错误信息。"
read -r "?按回车键关闭..."
exit 1
