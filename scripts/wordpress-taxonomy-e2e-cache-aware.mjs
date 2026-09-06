import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function classifyTaxonomyFailure(e2eOutput = "", diagnosticOutput = "") {
  const e2e = String(e2eOutput || "");
  const diagnostic = String(diagnosticOutput || "");
  const backendChanged = /Valore backend mutato durante la riverifica/i.test(e2e);
  const frontendOnlyMarker = /Marker SeoGrow\s*·\s*\{"api":false,"inspection":false,"database":false,"cache":false,"frontend":true\}/i.test(diagnostic);
  const backendFrontendDiverge = /backend e frontend divergono/i.test(diagnostic);
  const dbApiCoherent = /api=inspection:true\s*·\s*api=db:true/i.test(diagnostic);

  if (backendChanged && frontendOnlyMarker && backendFrontendDiverge && dbApiCoherent) {
    return {
      code: "PUBLIC_CACHE_STALE",
      message: "DB, API e object cache sono coerenti sul valore backend, ma il frontend pubblico serve ancora HTML cacheato con il marker SeoGrow.",
    };
  }
  return { code: "UNCLASSIFIED_TAXONOMY_FAILURE", message: "Il fallimento non corrisponde al profilo noto di cache pubblica stale." };
}

function runNode(script) {
  return spawnSync(process.execPath, [script], {
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
  const e2e = runNode("scripts/wordpress-taxonomy-e2e.mjs");
  emit(e2e);
  if ((e2e.status ?? 1) === 0) return;

  const combined = `${e2e.stdout || ""}\n${e2e.stderr || ""}`;
  if (!/Valore backend mutato durante la riverifica/i.test(combined)) {
    process.exitCode = e2e.status || 1;
    return;
  }

  console.error("\n[SeoGrow] E2E fallito dopo write: eseguo diagnostica READ-ONLY automatica per classificare backend vs frontend cache.");
  const diagnostics = runNode("scripts/wordpress-taxonomy-diagnostics.mjs");
  emit(diagnostics);
  const diagnosticCombined = `${diagnostics.stdout || ""}\n${diagnostics.stderr || ""}`;
  const classification = classifyTaxonomyFailure(combined, diagnosticCombined);

  if (classification.code === "PUBLIC_CACHE_STALE") {
    console.error(`\nPUBLIC_CACHE_STALE: ${classification.message}`);
    console.error("Nessun nuovo rollback viene avviato dal classificatore. Esegui purge della cache pubblica/CDN e poi taxonomy-read-only-diagnostics.");
  } else {
    console.error(`\n${classification.code}: ${classification.message}`);
  }
  process.exitCode = e2e.status || 1;
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (invoked) await main();
