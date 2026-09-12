import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const proposal = await readFile(new URL("./AutomaticProposalPage.jsx", import.meta.url), "utf8");

test("the saved correction receipt has a stable host that cannot remount remediation during apply", () => {
  assert.match(proposal, /<div className="automatic-proposal-saved-slot" aria-live="polite">/);
  assert.match(proposal, /automatic-proposal-saved-slot[\s\S]*latestCorrection[\s\S]*<SavedCorrectionDetails/);
  const receiptSlot = proposal.indexOf('className="automatic-proposal-saved-slot"');
  const runtime = proposal.indexOf('className="automatic-proposal-runtime"');
  assert.ok(receiptSlot >= 0 && runtime > receiptSlot, "receipt slot must remain a stable sibling before the remediation runtime");
});
