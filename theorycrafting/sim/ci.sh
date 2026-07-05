#!/usr/bin/env bash
# install + typecheck + build, with nvm's node on PATH (non-interactive shells
# skip .bashrc, so we add it explicitly)
set -e
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
cd "$(dirname "$0")"
case "${1:-check}" in
  install) npm install ;;
  check)   npm run typecheck && npm run build ;;
  test)    shift; npm test -- "$@" ;;
  dev)     npm run dev ;;
  *) echo "usage: ci.sh install|check|test|dev"; exit 1 ;;
esac
