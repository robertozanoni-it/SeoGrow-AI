import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

function extractJsonString(linePattern, text) {
  const match = String(text || "").match(linePattern);
  if (!match?.[1]) return "";
  try { return JSON.parse(match[1]); }
  catch { return ""; }
}

function extractOriginal(e2eOutput) {
  return extractJsonString(/Piano E2E\s*·\s*originale=("(?:\\.|[^"])*")\s*·\s*marker=/i, e2eOutput);
}

function extractDiagnosticCurrent(diagnosticOutput) {
  return extractJsonString(/get_term_meta\s*=\s*("(?:\\.|[^"])*")/i, diagnosticOutput);
}

function diagnosticIsCleanAndCoherent(diagnosticOutput) {
  const diagnostic = String(diagnosticOutput || "");
  return /DIAGNOSTICA COERENTE:/i.test(diagnostic) &&
    /Marker SeoGrow\s*·\s*\{"api":false,"inspection":false,"database":false,"cache":false,"frontend":false\}/i.test(diagnostic) &&
    /api=inspection:true\s*·\s*api=db:true\s*·\s*api=frontend:true/i.test(diagnostic);
}

export function classifyTaxonomyFailure(e2eOutput = "", diagnosticOutput = "", diagnosticOutput2 = "") {
  const e2e = String(e2eOutput || "");
  const diagnostic = String(diagnosticOutput || "");
  const diagnostic2 = String(diagnosticOutput2 || "");
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

  const original = compact(extractOriginal(e2e));
  const current1 = compact(extractDiagnosticCurrent(diagnostic));
  const current2 = compact(extractDiagnosticCurrent(diagnostic2));
  const crossRequestReverted = backendChanged &&
    original !== "" &&
    current1 === original &&
    current2 === original &&
    diagnosticIsCleanAndCoherent(diagnostic) &&
    diagnosticIsCleanAndCoherent(diagnostic2);

  if (crossRequestReverted) {
    return {
      code: "RANK_MATH_CROSS_REQUEST_REVERT",
      message: "La scrittura Rank Math è stata confermata nella request di apply, ma due richieste read-only successive vedono nuovamente il baseline originale in DB, API, object cache e frontend.",
    };
  }

  return { code: "UNCLASSIFIED_TAXONOMY_FAILURE", message: "Il fallimento non corrisponde a un profilo cross-request già classificato." };
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
  const e2e = runNode("scripts/wordpress-taxonomy-e2e-postwrite-observer.mjs");
  emit(e2e);
  if ((e2e.status ?? 1) === 0) return;

  const combined = `${e2e.stdout || ""}\n${e2e.stderr || ""}`;
  if (!/Valore backend mutato durante la riverifica/i.test(combined)) {
    process.exitCode = e2e.status || 1;
    return;
  }

  console.error("\n[SeoGrow] E2E fallito dopo write: eseguo prima diagnostica READ-ONLY cross-request.");
  const diagnostics = runNode("scripts/wordpress-taxonomy-diagnostics-retry.mjs");
  emit(diagnostics);
  const diagnosticCombined = `${diagnostics.stdout || ""}\n${diagnostics.stderr || ""}`;

  console.error("\n[SeoGrow] Attendo 750 ms e ripeto la diagnostica READ-ONLY in una seconda request/processo indipendente.");
  await sleep(750);
  const diagnostics2 = runNode("scripts/wordpress-taxonomy-diagnostics-retry.mjs");
  emit(diagnostics2);
  const diagnosticCombined2 = `${diagnostics2.stdout || ""}\n${diagnostics2.stderr || ""}`;

  const classification = classifyTaxonomyFailure(combined, diagnosticCombined, diagnosticCombined2);

  if (classification.code === "PUBLIC_CACHE_STALE") {
    console.error(`\nPUBLIC_CACHE_STALE: ${classification.message}`);
    console.error("Nessun nuovo rollback viene avviato dal classificatore. Esegui purge della cache pubblica/CDN e poi taxonomy-read-only-diagnostics.");
  } else if (classification.code === "RANK_MATH_CROSS_REQUEST_REVERT") {
    console.error(`\nRANK_MATH_CROSS_REQUEST_REVERT: ${classification.message}`);
    console.error("La persistence proof nella stessa request non è sufficiente per dichiarare persistenza reale. Nessun nuovo rollback viene avviato dal classificatore.");
  } else {
    console.error(`\n${classification.code}: ${classification.message}`);
  }
  process.exitCode = e2e.status || 1;
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;
if (invoked) await main();
