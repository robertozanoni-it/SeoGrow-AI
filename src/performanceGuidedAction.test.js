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

test("performance mantiene la diagnosi causale ma dichiara intervento manuale", () => {
  const path = resolutionPath(performanceProblem);
  const priority = problemResolutionPriority(performanceProblem);
  assert.equal(path.action, "manual");
  assert.equal(path.label, "Richiede intervento manuale");
  assert.equal(problemEntryLabel(performanceProblem), "Richiede intervento manuale");
  assert.equal(priority.mode, "guided");
  assert.equal(priority.label, "Richiede intervento manuale");
  assert.match(priority.instructions, /diagnosi causale/i);
});

test("altri finding manuali dichiarano intervento manuale senza falsa preparazione", () => {
  const image = { ...performanceProblem, issueType: "image-alt", title: "Immagine senza alt", detail: "Alt mancante" };
  assert.equal(problemResolutionPriority(image).label, "Richiede intervento manuale");
  assert.equal(problemEntryLabel(image), "Richiede intervento manuale");
});
