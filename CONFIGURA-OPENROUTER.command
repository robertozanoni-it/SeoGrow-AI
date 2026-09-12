#!/bin/zsh
set -euo pipefail

cd "${0:A:h}"
ENV_FILE=".env"

print ""
print "SeoGrow — configurazione OpenRouter"
print "La chiave non verrà mostrata e non finirà nella cronologia del Terminale."
print ""

# Disattiva esplicitamente l'echo del terminale durante l'inserimento della chiave.
# Il trap ripristina sempre lo stato del terminale anche in caso di Ctrl+C/errore.
TTY_STATE="$(stty -g 2>/dev/null || true)"
restore_tty() {
  if [[ -n "${TTY_STATE:-}" ]]; then
    stty "$TTY_STATE" 2>/dev/null || true
  fi
  unset OPENROUTER_KEY 2>/dev/null || true
}
trap restore_tty EXIT INT TERM

print -n "Incolla la chiave OpenRouter: "
if [[ -n "$TTY_STATE" ]]; then stty -echo; fi
IFS= read -r OPENROUTER_KEY
if [[ -n "$TTY_STATE" ]]; then stty "$TTY_STATE" 2>/dev/null || true; fi
print ""

# Elimina solo spazi bianchi accidentali all'inizio/fine senza mai stampare la chiave.
OPENROUTER_KEY="${OPENROUTER_KEY#${OPENROUTER_KEY%%[![:space:]]*}}"
OPENROUTER_KEY="${OPENROUTER_KEY%${OPENROUTER_KEY##*[![:space:]]}}"

if [[ -z "$OPENROUTER_KEY" ]]; then
  print "Chiave vuota: nessuna modifica eseguita."
  exit 1
fi
if [[ "$OPENROUTER_KEY" != sk-or-* ]]; then
  print "ERRORE: il valore inserito non ha il formato di una chiave OpenRouter (deve iniziare con sk-or-)."
  print "Nessuna modifica eseguita. Copia il valore segreto completo dalla pagina API Keys di OpenRouter e riprova."
  exit 1
fi

read "MODEL?Modello OpenAI su OpenRouter [gpt-5-mini]: "
MODEL="${MODEL:-gpt-5-mini}"

if [[ -f "$ENV_FILE" ]]; then
  BACKUP=".env.backup-$(date +%Y%m%d-%H%M%S)"
  cp "$ENV_FILE" "$BACKUP"
  chmod 600 "$BACKUP" 2>/dev/null || true
  print "Backup creato: $BACKUP"
else
  touch "$ENV_FILE"
fi
chmod 600 "$ENV_FILE" 2>/dev/null || true

OPENROUTER_KEY="$OPENROUTER_KEY" OPENROUTER_MODEL="$MODEL" node <<'NODE'
const fs = require('node:fs');
const file = '.env';
const key = process.env.OPENROUTER_KEY || '';
const model = process.env.OPENROUTER_MODEL || 'gpt-5-mini';
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const lines = text.split(/\r?\n/);
const values = new Map([
  ['OPENAI_API_KEY', key],
  ['OPENAI_BASE_URL', 'https://openrouter.ai/api/v1'],
  ['OPENAI_MODEL', model],
]);
if (['gpt-5-mini', 'openai/gpt-5-mini'].includes(model)) {
  values.set('OPENAI_INPUT_COST_PER_MILLION_USD', '0.25');
  values.set('OPENAI_OUTPUT_COST_PER_MILLION_USD', '2');
}
for (const [name, value] of values) {
  const prefix = `${name}=`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index >= 0) lines[index] = `${prefix}${value}`;
  else lines.push(`${prefix}${value}`);
}
fs.writeFileSync(file, `${lines.filter((line, index, all) => !(index === all.length - 1 && line === '')).join('\n')}\n`, { mode: 0o600 });
NODE

unset OPENROUTER_KEY
trap - EXIT INT TERM
restore_tty

print ""
print "Configurazione salvata in .env"
print "Provider: OpenRouter"
print "Endpoint: https://openrouter.ai/api/v1"
print "Modello: $MODEL"
if [[ "$MODEL" != "gpt-5-mini" && "$MODEL" != "openai/gpt-5-mini" ]]; then
  print "Nota: verifica nel .env le tariffe OPENAI_*_COST_PER_MILLION_USD per il modello scelto."
fi
print ""
print "Ora riavvia SeoGrow con ./AVVIA.command"
