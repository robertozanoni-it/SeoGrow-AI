import assert from "node:assert/strict";
import test from "node:test";
import { problemResolutionPriority } from "./problemResolutionPriority.js";
import { problemEntryLabel, resolutionPath } from "./resolutionPath.js";

const performanceProblem = {
  issueType: "performance",
  title: "Risposta lenta: 2604 ms",
  detail: "Risposta lenta: 2604 ms",
  sourceUrl: "https://example.com/",
  problemState: "open",
  interventionState: "not_prepared",
  correctability: "manual",
};

test("performance usa un'azione causale esplicita invece del generico prepara soluzione guidata", () => {
  const path = resolutionPath(performanceProblem);
  const priority = problemResolutionPriority(performanceProblem);
  assert.equal(path.action, "manual");
  assert.equal(path.label, "Analizza causa e prepara correzione");
  assert.equal(problemEntryLabel(performanceProblem), "Analizza causa e prepara correzione");
  assert.equal(priority.mode, "guided");
  assert.equal(priority.label, "Analizza causa e prepara correzione");
  assert.match(priority.instructions, /diagnosi causale/i);
  assert.match(priority.instructions, /Prima\/Dopo/i);
});

test("altri finding manuali mantengono la soluzione guidata generica", () => {
  const image = { ...performanceProblem, issueType: "image-alt", title: "Immagine senza alt", detail: "Alt mancante" };
  assert.equal(problemResolutionPriority(image).label, "Prepara soluzione guidata");
});
