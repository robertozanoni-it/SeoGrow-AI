import test from "node:test";
import assert from "node:assert/strict";
import {
  WIZARD_STEP_COUNTS,
  hasExplicitWizardStepAction,
  wizardActionCoverageComplete,
  wizardStepAction,
} from "./WizardStepNavigation.js";

test("tutte le card dei wizard correnti hanno una destinazione esplicita", () => {
  const entries = Object.entries(WIZARD_STEP_COUNTS);
  assert.equal(entries.length, 16);
  assert.equal(entries.reduce((total, [, count]) => total + count, 0), 73);
  assert.equal(wizardActionCoverageComplete(), true);

  for (const [page, count] of entries) {
    for (let index = 0; index < count; index += 1) {
      assert.equal(
        hasExplicitWizardStepAction(page, index),
        true,
        `${page}: lo step ${index + 1} deve avere un'azione reale`,
      );
      assert.equal(Boolean(wizardStepAction(page, index)?.fallback), false);
    }
  }
});

test("uno step futuro non mappato riceve un fallback operativo invece di restare morto", () => {
  assert.deepEqual(wizardStepAction("Pagina futura", 0), { fallback: true });
});
