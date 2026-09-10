import test from "node:test";
import assert from "node:assert/strict";
import {
  WIZARD_DESTINATION_PAGES,
  WIZARD_STEP_COUNTS,
  hasExplicitWizardStepAction,
  wizardActionCoverageComplete,
  wizardStepAction,
} from "./WizardStepNavigation.js";

test("tutte le card dei wizard correnti hanno una pagina di destinazione esplicita", () => {
  const entries = Object.entries(WIZARD_STEP_COUNTS);
  assert.equal(entries.length, 16);
  assert.equal(entries.reduce((total, [, count]) => total + count, 0), 73);
  assert.equal(wizardActionCoverageComplete(), true);

  for (const [page, count] of entries) {
    for (let index = 0; index < count; index += 1) {
      assert.equal(
        hasExplicitWizardStepAction(page, index),
        true,
        `${page}: lo step ${index + 1} deve aprire una pagina reale`,
      );
      const action = wizardStepAction(page, index);
      assert.deepEqual(Object.keys(action), ["page"]);
      assert.equal(WIZARD_DESTINATION_PAGES.includes(action.page), true);
    }
  }
});

test("nessuna card wizard corrente usa sezioni, selector, detail o tools", () => {
  for (const [page, count] of Object.entries(WIZARD_STEP_COUNTS)) {
    for (let index = 0; index < count; index += 1) {
      const action = wizardStepAction(page, index);
      assert.equal("selector" in action, false);
      assert.equal("detail" in action, false);
      assert.equal("tools" in action, false);
      assert.equal("projectCard" in action, false);
      assert.equal("fallback" in action, false);
    }
  }
});

test("uno step futuro non mappato apre una pagina sicura invece di una sezione", () => {
  assert.deepEqual(wizardStepAction("Pagina futura", 0), { page: "Panoramica" });
});
