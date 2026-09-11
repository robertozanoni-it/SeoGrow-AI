#!/bin/zsh
set -euo pipefail

cd "${0:A:h}"
ENV_FILE=".env"

print ""
print "SeoGrow — configurazione OpenRouter"
print "La chiave non verrà mostrata e non finirà nella cronologia del Terminale."
print ""

read -rs "OPENROUTER_KEY?Incolla la chiave OpenRouter: "
print ""
if [[ -z "$OPENROUTER_KEY" ]]; then
  print "Chiave vuota: nessuna modifica eseguita."
  exit 1
fi
if [[ "$OPENROUTER_KEY" != sk-or-* ]]; then
  print "Avviso: la chiave non inizia con sk-or-. Verifica che sia davvero una chiave OpenRouter."
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
