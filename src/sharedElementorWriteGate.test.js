import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applySharedElementorLinkApproval, rollbackSharedElementorLink } from "../server/elementorSharedLinkHook.js";

test("shared Elementor writes sono fail-closed finché il gate live non è certificato", async () => {
  const source = await readFile(new URL("../server/elementorSharedLinkHook.js", import.meta.url), "utf8");
  assert.match(source, /SEOGROW_ELEMENTOR_SHARED_WRITES_ENABLED === "1"/);
  assert.match(source, /SHARED_ELEMENTOR_WRITES_DISABLED/);
  assert.match(source, /elementor-shared-link-preview/);

  await assert.rejects(
    applySharedElementorLinkApproval({ approvalToken: "test" }),
    (error) => error?.code === "SHARED_ELEMENTOR_WRITES_DISABLED",
  );
  await assert.rejects(
    rollbackSharedElementorLink({}),
    (error) => error?.code === "SHARED_ELEMENTOR_WRITES_DISABLED",
  );
});
