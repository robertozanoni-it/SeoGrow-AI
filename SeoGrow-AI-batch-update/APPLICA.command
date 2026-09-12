#!/bin/zsh
set -eu
HERE="${0:A:h}"
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  [[ ! -s "$NVM_DIR/nvm.sh" ]] || source "$NVM_DIR/nvm.sh"
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non trovato. Apri il Terminale usato normalmente per SeoGrow."
  read "?Premi Invio per chiudere."; exit 1
fi
if [[ $# -gt 0 ]]; then
  TARGET="$1"
else
  TARGET="$(osascript -e 'POSIX path of (choose folder with prompt "Seleziona la cartella principale del repository SeoGrow-AI")')" || exit 0
fi
node "$HERE/apply-batch.mjs" "$TARGET"
echo ""
read "?Premi Invio per chiudere."
