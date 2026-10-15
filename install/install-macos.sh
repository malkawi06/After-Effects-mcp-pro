#!/bin/sh
# Installs the Claude Bridge CEP panel for the current macOS user.
# Usage (from the repo root):  sh install/install-macos.sh
set -e
SRC="$(cd "$(dirname "$0")/../panel" && pwd)"
DST="$HOME/Library/Application Support/Adobe/CEP/extensions/ClaudeBridge"
mkdir -p "$DST"
cp -R "$SRC/." "$DST/"
echo "Panel installed to $DST"

# Unsigned CEP panels only load with PlayerDebugMode.
for v in 10 11 12; do defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1; done
echo "PlayerDebugMode enabled for CSXS 10-12"

echo
echo "Next steps:"
echo "  1. After Effects > Settings > Scripting & Expressions > tick 'Allow Scripts to Write Files and Access Network'"
echo "  2. Restart After Effects. Window > Extensions > Claude Bridge should show a green dot."
echo "  3. Claude Desktop > Settings > Extensions > Install Extension... > choose after-effects-mcp-pro.mcpb (from Releases)"
