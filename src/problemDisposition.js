import { readWorkspaceJson, writeWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { canonicalProblemClosures } from "./core/workspace/projectState.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { normalizeClientId, normalizeHttpUrl } from "./reliabilityModel.js";

export const DO_NOT_MODIFY_DISPOSITION = "do_not_modify";

const targetScoped = (type) => /broken-(?:external-)?link|link esterno|link interno/i.test(String(type || ""));

export const isPermanentProblemClosure = (closure) =>
  closure?.permanent === true ||
  closure?.disposition === DO_NOT_MODIFY_DISPOSITION ||
  closure?.reason === "user-do-not-modify";

export function problemClosureIdentity(problem = {}, clientId) {
  const normalizedClientId = normalizeClientId(clientId);
  const issueType = String(problem.issueType || "").trim();
  const sourceUrl = normalizeHttpUrl(problem.sourceUrl || "", { stripSlash: true });
  const targets = Array.isArray(problem.targetUrls) ? problem.targetUrls.filter(Boolean) : [];
  const targetUrl = targets.length === 1 ? normalizeHttpUrl(targets[0], { stripSlash: true }) : "";
  if (!normalizedClientId || !issueType || !sourceUrl) return null;
  if (targetScoped(issueType) && !targetUrl && !problem.key) return null;
  return { clientId: normalizedClientId, issueKey: problem.key || "", issueType, sourceUrl, targetUrl };
}

export function excludeProblemPermanently(problem, clientId, { now = () => new Date().toISOString() } = {}) {
  const identity = problemClosureIdentity(problem, clientId);
  if (!identity) throw new Error("Il problema non ha un'identità sufficientemente precisa per essere escluso.");
  const closure = {
    ...identity,
    closedAt: now(),
    reason: "user-do-not-modify",
    disposition: DO_NOT_MODIFY_DISPOSITION,
    permanent: true,
  };
  const current = readWorkspaceJson(WORKSPACE_KEYS.problemClosures, []);
  const next = canonicalProblemClosures([closure, ...(Array.isArray(current) ? current : [])]);
  writeWorkspaceJson(WORKSPACE_KEYS.problemClosures, next);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("seogrow-problem-closures-changed", { detail: closure }));
  return closure;
}


export function recordResolvedProblemClosure(problem = {}, clientId, {
  sourceUrl = "",
  targetUrl = "",
  reason = "live-readonly-resolved",
  now = () => new Date().toISOString(),
} = {}) {
  const normalizedClientId = normalizeClientId(clientId);
  const issueType = String(problem.issueType || problem.type || "").trim();
  const normalizedSourceUrl = normalizeHttpUrl(sourceUrl || problem.sourceUrl || problem.url || "", { stripSlash: true });
  const candidateTargets = [
    targetUrl,
    problem.targetUrl,
    problem.brokenUrl,
    problem.destinationUrl,
    ...(Array.isArray(problem.targetUrls) ? problem.targetUrls : []),
  ].filter(Boolean).map((value) => normalizeHttpUrl(value, { stripSlash: true })).filter(Boolean);
  const uniqueTargets = [...new Set(candidateTargets)];
  const normalizedTargetUrl = uniqueTargets.length === 1 ? uniqueTargets[0] : "";
  const issueKey = String(problem.key || problem.issueKey || "").trim();

  if (!normalizedClientId || !issueType || !normalizedSourceUrl) {
    throw new Error("Il problema non ha un'identità sufficiente per registrare la risoluzione.");
  }
  if (targetScoped(issueType) && !normalizedTargetUrl && !issueKey) {
    throw new Error("Il problema link non ha un target sufficientemente preciso per registrare la risoluzione.");
  }

  const closure = {
    clientId: normalizedClientId,
    issueKey,
    issueType,
    sourceUrl: normalizedSourceUrl,
    targetUrl: normalizedTargetUrl,
    closedAt: now(),
    reason,
    permanent: false,
  };
  const current = readWorkspaceJson(WORKSPACE_KEYS.problemClosures, []);
  const next = canonicalProblemClosures([closure, ...(Array.isArray(current) ? current : [])]);
  writeWorkspaceJson(WORKSPACE_KEYS.problemClosures, next);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("seogrow-problem-closures-changed", { detail: closure }));
    window.dispatchEvent(new CustomEvent("seogrow-problem-resolved", { detail: closure }));
  }
  return closure;
}
