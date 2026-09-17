import { apiFetch } from "./api.js";
import { applyJournaledCorrection } from "./correctionJournal.js";
import { previewIdentity } from "./remediationPlanSafety.js";
import { createWordPressCorrection, flattenState } from "./modules/publish/index.js";
import { brokenExternalTarget } from "./brokenLinkRemediation.js";

const fail = (message, code) => Object.assign(new Error(message), { code });
const request = async (path, body) => {
  const response = await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data?.ok !== true) throw fail(data?.error || `Richiesta shared Elementor non riuscita (${response.status}).`, data?.code || `HTTP_${response.status}`);
  return data;
};

export const sharedElementorOwnershipCandidate = (entry, error) =>
  entry?.kind === "external_link" &&
  /OWNERSHIP_UNDETERMINED|ownership|template condiviso|theme builder/i.test(`${error?.code || ""} ${error?.message || error || ""}`);

export async function prepareSharedElementorBatchPreview({ resolved, inspected, frontendContext, targetUrl, wp, contextSnapshot }) {
  const brokenTarget = brokenExternalTarget(resolved.issue);
  if (!brokenTarget) throw fail("Link esterno 404 non disponibile per il writer shared Elementor.", "SHARED_LINK_TARGET_REQUIRED");
  const data = await request("/api/wordpress/elementor-shared-link-preview", {
    siteUrl: wp.url,
    sourceUrl: targetUrl,
    targetUrl: brokenTarget,
    username: wp.username,
    applicationPassword: wp.applicationPassword,
    mode: "unlink-preserve-text",
  });
  if (data.requiresExplicitApproval !== true || data.affectedPagesEnumerated !== true || data.completeSiteEnumeration !== true || !Array.isArray(data.affectedUrls) || !data.affectedUrls.length) {
    throw fail("Coverage completa del template shared Elementor non attestata: AutoFix batch resta bloccato.", "SHARED_LINK_COVERAGE_INCOMPLETE");
  }
  if (!data.approvalToken || data.resource !== "elementor_library" || !(Number(data.id) > 0) || !Array.isArray(data.changed) || !data.changed.includes("meta._elementor_data")) {
    throw fail("Anteprima shared Elementor incompleta: approval o snapshot atomico non disponibili.", "SHARED_LINK_PREVIEW_INCOMPLETE");
  }
  const baseIdentity = previewIdentity({ issue: resolved.issue, inspected, targetUrl, frontend: frontendContext });
  const plan = {
    adapter: data.adapter || "Elementor shared template link cleanup",
    changes: { meta: { _elementor_data: data.previewAfter?.meta?._elementor_data ?? "" } },
    linkCleanup: data.linkCleanup,
  };
  return {
    ...baseIdentity,
    status: "preview",
    sharedElementor: true,
    targetUrl,
    issue: resolved.issue,
    inspected,
    frontendContext,
    plan,
    data,
    sharedTemplate: data.sharedTemplate || data.linkCleanup?.template || null,
    affectedUrls: data.affectedUrls,
    expiresAt: Date.now() + Number(data.expiresInSeconds || 0) * 1000,
    contextSnapshot,
    resourceIdentity: `wp:elementor_library:${Number(data.id)}`,
  };
}

export async function applySharedElementorBatchPreview({ entry, run, wp, assertContext }) {
  const preview = entry.preview;
  if (!preview?.sharedElementor) throw new Error("Anteprima shared Elementor non disponibile.");
  const record = createWordPressCorrection(preview, wp, run.id, entry.correctionId);
  const templateId = Number(preview.data.id);
  record.resource = "elementor_library";
  record.entityId = templateId;
  record.wordpressResource = "elementor_library";
  record.wordpressId = templateId;
  record.resourceIdentity = `wp:elementor_library:${templateId}`;
  record.batchProblemKeys = [...entry.problemKeys];
  record.batchIssues = run.entries.filter(item => entry.problemKeys.includes(item.problem.key)).map(item => ({ issue: item.preview?.issue || preview.issue, sourceUrl: item.problem.sourceUrl }));
  record.sharedTemplate = preview.sharedTemplate;
  record.affectedUrls = preview.affectedUrls;
  record.affectedPagesEnumerated = true;
  record.brokenTargetUrl = brokenExternalTarget(preview.issue);

  return applyJournaledCorrection(record, async () => {
    await assertContext();
    const data = await request("/api/wordpress/elementor-shared-link-apply", {
      approvalToken: preview.data.approvalToken,
      username: wp.username,
      applicationPassword: wp.applicationPassword,
    });
    if (data.frontendVerified !== true || data.atomicGuaranteed !== true || data.staleChecked !== true) {
      throw fail("Il writer shared Elementor non ha confermato atomictà, stale-check e verifica frontend. Lo stato resta da riconciliare.", "SHARED_LINK_APPLY_UNCONFIRMED");
    }
    return {
      before: flattenState(data.before, record.fields),
      after: flattenState(data.after, record.fields),
      rollbackChanges: data.before,
      serverFrontendVerified: true,
      sharedFrontendVerification: {
        checkedAt: new Date().toISOString(),
        verified: true,
        affectedUrls: data.affectedUrls || preview.affectedUrls,
      },
      sharedTemplate: data.sharedTemplate || preview.sharedTemplate,
      affectedUrls: data.affectedUrls || preview.affectedUrls,
      affectedPagesEnumerated: true,
    };
  });
}
