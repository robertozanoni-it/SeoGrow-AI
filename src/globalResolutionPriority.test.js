import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { problemResolutionPriority } from "./problemResolutionPriority.js";
import { resolutionPath, canOpenControlledContextPreview } from "./resolutionPath.js";

const url = "https://example.com/pagina/";
const base = {
  sourceUrl: url,
  problemState: "open",
  interventionState: "not_prepared",
  correctability: "automatic",
  reviewOnly: false,
  ownershipBlocked: false,
  stale: false,
};

test("prima priorità: un problema automatico usa Risolvi automaticamente", () => {
  const problem = { ...base, issueType: "title", title: "Title troppo lungo" };
  const priority = problemResolutionPriority(problem);
  assert.equal(priority.mode, "automatic");
  assert.equal(priority.label, "Risolvi automaticamente");
  assert.equal(priority.action, "prepare");
});

test("review metadata preparabile usa soluzione da approvare", () => {
  const problem = { ...base, issueType: "description-serp-width", title: "Meta description larga nello snippet", correctability: "not_supported", reviewOnly: true, problemState: "needs_verification" };
  const priority = problemResolutionPriority(problem);
  assert.equal(priority.mode, "approval");
  assert.equal(priority.label, "Prepara soluzione");
});

test("canonical e noindex richiedono intent esplicito prima della proposta", () => {
  for (const problem of [
    { ...base, issueType: "canonical-different", title: "Canonical differente", correctability: "assisted", reviewOnly: true, problemState: "needs_verification" },
    { ...base, issueType: "noindex", title: "Pagina noindex", correctability: "assisted", reviewOnly: true, problemState: "needs_verification" },
  ]) {
    const priority = problemResolutionPriority(problem);
    assert.equal(priority.mode, "confirm");
    assert.equal(priority.label, "Verifica e prepara soluzione");
    assert.equal(canOpenControlledContextPreview(problem), true);
  }
});

test("un finding obsoleto non può saltare l'audit con una conferma", () => {
  const problem = { ...base, issueType: "canonical-different", title: "Canonical differente", correctability: "assisted", reviewOnly: true, problemState: "needs_verification", stale: true };
  const path = resolutionPath(problem);
  const priority = problemResolutionPriority(problem);
  assert.equal(path.action, "audit");
  assert.equal(priority.mode, "guided");
  assert.equal(priority.action, "audit");
  assert.equal(priority.label, "Aggiorna audit");
  assert.equal(canOpenControlledContextPreview(problem), false);
});

test("link esterno assistito prepara una soluzione controllata", () => {
  const problem = { ...base, issueType: "broken-external-link", title: "Link esterno 404", correctability: "assisted", targetUrls: ["https://broken.example/"] };
  const priority = problemResolutionPriority(problem);
  assert.equal(priority.mode, "approval");
  assert.equal(priority.label, "Prepara soluzione");
});

test("problemi senza adapter restano soluzione guidata, non falsa automazione", () => {
  const problem = { ...base, issueType: "image-alt", title: "Immagine senza alt", correctability: "not_supported" };
  const priority = problemResolutionPriority(problem);
  assert.equal(priority.mode, "guided");
  assert.equal(priority.label, "Prepara soluzione guidata");
});

test("stato già risolto o applicato privilegia la verifica e non una nuova scrittura", () => {
  const resolved = problemResolutionPriority({ ...base, issueType: "title", title: "Title", problemState: "resolved" });
  const applied = problemResolutionPriority({ ...base, issueType: "title", title: "Title", interventionState: "applied", problemState: "needs_verification" });
  assert.equal(resolved.mode, "verify");
  assert.equal(applied.mode, "verify");
});

test("SEO Agent rende Salva come task secondario nei workflow problema", async () => {
  const source = await readFile(new URL("./AgentPage.jsx", import.meta.url), "utf8");
  assert.match(source, /problemResolutionPriority\(preparedProblem\)/);
  assert.match(source, />Salva come task<\/button>/);
  assert.match(source, /priority\.label/);
  assert.match(source, /controlledContextPreview: true/);
});

test("pagina risoluzione usa la stessa politica globale", async () => {
  const source = await readFile(new URL("./ProblemResolutionPage.jsx", import.meta.url), "utf8");
  assert.match(source, /problemResolutionPriority\(problem, latestCorrection\)/);
  assert.match(source, /priority\.mode === "automatic"/);
  assert.match(source, /priority\.mode === "approval"/);
  assert.match(source, /priority\.mode === "confirm"/);
});
