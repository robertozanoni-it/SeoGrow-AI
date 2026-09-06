import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 750;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function isTransientDiagnosticsFailure(result = {}) {
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  return /UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|ETIMEDOUT|ConnectTimeoutError|TimeoutError/i.test(combined) ||
    /HTTP\s+(?:502|503|504)\b/i.test(combined);
}

function runDiagnostics() {
  return spawnSync(process.execPath, ["scripts/wordpress-taxonomy-diagnostics.mjs"], {
    env: process.env,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
}

function emit(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

async function main() {
  let last;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    last = runDiagnostics();
    if ((last.status ?? 1) === 0) {
      emit(last);
      return;
    }

    const transient = isTransientDiagnosticsFailure(last);
    if (!transient || attempt >= RETRY_ATTEMPTS) {
      emit(last);
      process.exitCode = last.status || 1;
      return;
    }

    emit(last);
    const delay = RETRY_BASE_MS * attempt;
    console.warn(`[network] taxonomy diagnostics: errore transitorio al tentativo ${attempt}/${RETRY_ATTEMPTS}; retry tra ${delay} ms.`);
    await sleep(delay);
  }

  emit(last || {});
  process.exitCode = last?.status || 1;
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (invoked) await main();
