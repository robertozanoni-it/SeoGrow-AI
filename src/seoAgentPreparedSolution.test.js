import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { remediationIssueKind } from "./remediationIssueKind.js";
import { canOpenControlledReviewPreview, controlledPreviewAllowed, resolutionPath } from "./resolutionPath.js";
import { selectFocusedRemediation } from "./remediationSelection.js";

const pageUrl = "https://yogabuenaonda.it/yoga-alimentazione-cinisello-balsamo/";
const finding = {
  type: "description-serp-width",
  label: "Meta description larga nello snippet: circa 960px / 920px",
  sourceUrl: pageUrl,
  detail: "160 caratteri: il limite è rispettato, ma la larghezza SERP stimata supera 920px.",
};
const problem = {
  issueType: finding.type,
  title: finding.label,
  sourceUrl: pageUrl,
  problemState: "needs_verification",
  correctability: "not_supported",
  reviewOnly: true,
};

test("il finding SERP width usa l'adapter meta description ma resta in preview controllata", () => {
  assert.equal(remediationIssueKind(finding), "meta_description");
  assert.equal(resolutionPath(problem).action, "prepare");
  assert.equal(resolutionPath(problem).label, "Prepara soluzione");
  assert.equal(canOpenControlledReviewPreview(problem), true);
  assert.equal(controlledPreviewAllowed(problem, { controlledReviewPreview: true }), true);
});

test("la selezione dedicata risolve il review item più recente senza promuoverlo negli issues salvati", () => {
  const audit = {
    type: "page",
    item: {
      url: pageUrl,
      analyzedAt: "2026-09-14T11:03:06.000Z",
      issues: [],
      reviewItems: [finding],
    },
  };
  const focus = {
    clientId: 1,
    sourceUrl: pageUrl,
    issueType: finding.type,
    title: finding.label,
    controlledReviewPreview: true,
    openedFrom: "problem-card",
    createdAt: 1,
  };
  const selection = selectFocusedRemediation([audit], focus, 1, { id: 1, url: "https://yogabuenaonda.it/" });
  assert.equal(selection?.collection, "reviewItems");
  assert.equal(selection?.issueIndex, 0);
  assert.equal(selection?.audit?.item?.issues?.[0]?.type, "description-serp-width");
  assert.equal(audit.item.issues.length, 0);
});

test("SEO Agent offre la soluzione e il generatore impone anche la larghezza SERP", async () => {
  const agent = await readFile(new URL("./AgentPage.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server/wordpressSeoAdapterV2Hook.js", import.meta.url), "utf8");
  assert.match(agent, /Prepara soluzione/);
  assert.match(agent, /openProblemResolution/);
  assert.match(server, /metaDescriptionSerpWidthWarning/);
  assert.match(server, /stima massima di 920px/);
  assert.match(server, /description-serp-width/);
});
