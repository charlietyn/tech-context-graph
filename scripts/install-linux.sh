#!/usr/bin/env bash
set -euo pipefail
PROFILE="${1:-recommended}"

if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

case "$PROFILE" in
  minimal) PACKAGE='graphifyy[mcp]' ;;
  recommended) PACKAGE='graphifyy[pdf,office,mcp,svg,sql,postgres,ollama]' ;;
  all) PACKAGE='graphifyy[all]' ;;
  *) echo "Usage: $0 [minimal|recommended|all]" >&2; exit 2 ;;
esac

uv tool install --force "$PACKAGE"
uv tool update-shell || true
export PATH="$HOME/.local/bin:$PATH"
graphify install --platform agents

echo "Installation complete. Open a new shell and run: graphify --version"
