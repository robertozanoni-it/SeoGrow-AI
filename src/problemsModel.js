import { observedPageCount } from "./modules/audit/data.js";
import { isLegalPage } from "./modules/audit/data.js";
import {
  correctionEvent,
  deriveProblemState,
  issueConfidence,
  issueCorrectability,
  issueIdentity,
  latestAudit,
  normalizeClientId,
  normalizeHttpUrl,
  safeHttpHref,
  taskEvent,
} from "./reliabilityModel.js";
import { taskOrigin } from "./experience/tasks/taskLinkage.js";
import { auditCompatibilityIdentity, canonicalEquivalentIssueType } from "./problemIdentityCompatibility.js";

const timestamp = (value) => value ? (Date.parse(value) || 0) : 0;

export const isProblemActive = (row) => !["resolved", "intentional"].includes(row?.problemState);
const isPermanentClosure = (closure) => closure?.permanent === true || closure?.disposition === "do_not_modify" || closure?.reason === "user-do-not-modify";

const pageKindFromUrl = (value) => {
  if (isLegalPage(value)) return "gdpr";
  try {
    const segments = new URL(value).pathname.toLowerCase().split("/").filter(Boolean);
    const first = segments[0] || "";
    if (/^(?:category|categoria|tag|author|autore|date)$/.test(first) || (first === "page" && /^\d+$/.test(segments[1] || ""))) return "archive";
    if (/^(?:contatti?|contact|contacts)$/.test(first)) return "utility";
    return "content";
  } catch {
    return "unknown";
  }
};

const issueSourceUrl = (issue, auditUrl = "") => {
  const type = String(issue?.type || "").toLowerCase();
  const brokenLink = /broken-(?:external-)?link/.test(type);
  return issue?.sourceUrl || issue?.url || (!brokenLink ? issue?.targetUrl : "") || auditUrl || "";
};

const issueBrokenTarget = (issue) => {
  const type = String(issue?.type || "").toLowerCase();
  if (!/broken-(?:external-)?link/.test(type)) return "";
  return safeHttpHref(issue?.targetUrl || issue?.brokenUrl || issue?.destinationUrl || issue?.href || "");
};

const severity = (value) => {
  const text = String(value || "").toLowerCase();
  if (/critical|critico|alta|high|error/.test(text)) return "high";
  if (/medium|media|warning|importante/.test(text)) return "medium";
  if (/bassa|low|opportun/.test(text)) return "low";
  return "unknown";
};

const priority = (value) => {
  const text = String(value || "").toLowerCase();
  if (/alta|high|urgent/.test(text)) return "high";
  if (/media|medium/.test(text)) return "medium";
  if (/bassa|low/.test(text)) return "low";
  return "unknown";
};

const exactUrlIdentity = (record = {}) => issueIdentity({
  ...record,
  wordpressId: undefined,
  resourceId: undefined,
  entityId: undefined,
  idWordPress: undefined,
  finalUrl: undefined,
  resolvedUrl: undefined,
  canonical: undefined,
  canonicalUrl: undefined,
  canonicalConfirmed: false,
});

const legacyEquivalentRecord = (record = {}) => {
  const explicit = String(record?.issueType || record?.issue?.type || "").trim().toLowerCase();
  const issueType = canonicalEquivalentIssueType(record);
  if (!issueType || issueType === explicit) return null;
  return {
    ...record,
    issueType,
    issue: record?.issue ? { ...record.issue, type: issueType } : record?.issue,
  };
};

const identityCandidates = (record) => {
  const equivalent = legacyEquivalentRecord(record);
  return [...new Set([
    issueIdentity(record),
    exactUrlIdentity(record),
    equivalent ? issueIdentity(equivalent) : "",
    equivalent ? exactUrlIdentity(equivalent) : "",
    record?.issueKey ? `legacy:${record.issueKey}` : "",
  ].filter(Boolean))];
};

const latestPagesByUrl = (pageHistory) => {
  const byUrl = new Map();
  for (const item of Array.isArray(pageHistory) ? pageHistory : []) {
    const key = normalizeHttpUrl(item?.url || "", { stripSlash: false }) || String(item?.url || "");
    const current = byUrl.get(key);
    if (!current || timestamp(item?.analyzedAt || item?.startedAt) > timestamp(current?.analyzedAt || current?.startedAt)) byUrl.set(key, item);
  }
  return [...byUrl.values()];
};

const latestSite = (history) => latestAudit(
  (Array.isArray(history) ? history : history ? [history] : []).map((item) => ({ type: "site", item })),
  { scope: "site" },
)?.item || null;

const createGroup = (record, issue, sourceUrl) => ({
  key: issueIdentity(record),
  aliases: new Set(identityCandidates(record)),
  title: issue?.label || issue?.type || record.issueLabel || record.issueType || "Problema SEO",
  issueType: issue?.type || record.issueType || "",
  sourceUrl,
  targetUrls: new Set(),
  anchorTexts: new Set(),
  detail: issue?.detail || "",
  severity: severity(issue?.severity || record.severity),
  priority: "unknown",
  pageKind: issue?.pageKind || pageKindFromUrl(sourceUrl),
  events: [],
  sources: [],
  evidence: [],
  fields: [],
  adapters: [],
  ownershipBlocked: false,
  technicalError: false,
  auditScopes: new Set(),
  quality: null,
  latestAuditAt: "",
  latestAuditTaskAt: "",
  auditDerivedTask: false,
  legacyAnalysisTask: false,
  latestCorrectionAt: "",
  auditClearedAt: "",
  auditClearedScope: "",
});

const attachAlias = (groups, aliasMap, group, aliases) => {
  for (const alias of aliases) {
    group.aliases.add(alias);
    aliasMap.set(alias, group.key);
  }
  groups.set(group.key, group);
};

const findOrCreate = (groups, aliasMap, record, issue, sourceUrl) => {
  const aliases = identityCandidates(record);
  const existingKey = aliases.map((alias) => aliasMap.get(alias)).find(Boolean);
  if (existingKey && groups.has(existingKey)) {
    const group = groups.get(existingKey);
    attachAlias(groups, aliasMap, group, aliases);
    return group;
  }
  const group = createGroup(record, issue, sourceUrl);
  attachAlias(groups, aliasMap, group, aliases);
  return group;
};

const addSource = (group, source) => {
  group.sources.push(source);
  if (source.detail) group.evidence.push({
    source: source.label,
    detail: source.detail,
    at: source.at || "",
    nature: source.nature || "observed",
  });
};

const isTechnicalRecoveryFixture = (record = {}) => {
  const id = String(record?.id || "").trim();
  const label = String(record?.issueLabel || record?.title || record?.issue?.label || "").trim();
  return /^g06-live-/i.test(id) || /\bg06\b.*lost[ -]?response.*recovery/i.test(label);
};

const locallyClearableAuditTypes = new Set([
  "h1",
  "title",
  "description",
  "meta-description",
  "meta_description",
  "description-serp-width",
  "canonical",
  "canonical-invalid",
  "canonical-external",
  "canonical-different",
  "image",
  "metadata-tags",
  "thin",
  "thin-content",
  "content",
  "indexability",
  "noindex",
  "orphan",
  "broken-link",
  "broken-external-link",
  "duplicate-title",
  "duplicate-description",
]);

const comparableUrl = (value) => normalizeHttpUrl(value || "", { stripSlash: true });

const auditObservedUrl = (scope, item, sourceUrl) => {
  const wanted = comparableUrl(sourceUrl);
  if (!wanted) return false;
  if (scope === "page") return comparableUrl(item?.url) === wanted;
  if (scope !== "site") return false;
  return (Array.isArray(item?.pages) ? item.pages : []).some((page) =>
    comparableUrl(page?.url) === wanted && page?.ok !== false,
  );
};

const auditStillContainsGroup = (group, item) =>
  [
    ...(Array.isArray(item?.issues) ? item.issues : []),
    ...(Array.isArray(item?.reviewItems) ? item.reviewItems : []),
  ].some((issue) => {
    const sourceUrl = issueSourceUrl(issue, item?.url || "");
    const record = { issueType: issue?.type, issueLabel: issue?.label, sourceUrl, issue };
    return identityCandidates(record).some((alias) => group.aliases.has(alias));
  });

const siteOnlyClearanceTypes = new Set(["duplicate-title", "duplicate-description", "orphan", "broken-link", "broken-external-link"]);

const legacyAuditTaskKinds = new Set([
  "h1",
  "title",
  "description",
  "meta-description",
  "meta_description",
  "description-serp-width",
  "duplicate-title",
  "duplicate-description",
  "canonical",
  "canonical-invalid",
  "canonical-external",
  "canonical-different",
  "thin",
  "thin-content",
  "content",
  "indexability",
  "noindex",
  "orphan",
  "broken-link",
  "broken-external-link",
  "image",
  "metadata-tags",
]);

const reconcileAuditClearance = (groups, audits) => {
  for (const group of groups.values()) {
    const issueType = String(group.issueType || "").trim().toLowerCase();
    const baselineAt = [
      group.latestAuditAt,
      group.auditDerivedTask ? group.latestAuditTaskAt : "",
      group.latestCorrectionAt,
    ].filter(Boolean).toSorted((a, b) => timestamp(b) - timestamp(a))[0] || "";
    const hasHistoricalEvidence = Boolean(group.latestAuditAt || group.auditDerivedTask || group.latestCorrectionAt);
    if (!hasHistoricalEvidence || !locallyClearableAuditTypes.has(issueType)) continue;
    const baselineTime = baselineAt ? timestamp(baselineAt) : -1;
    const clearingAudit = audits
      .filter(({ scope, item }) => {
        const at = item?.analyzedAt || item?.startedAt || "";
        return timestamp(at) > baselineTime &&
          (!siteOnlyClearanceTypes.has(issueType) || scope === "site") &&
          auditObservedUrl(scope, item, group.sourceUrl) &&
          !auditStillContainsGroup(group, item);
      })
      .toSorted((a, b) =>
        timestamp(b.item?.analyzedAt || b.item?.startedAt) -
        timestamp(a.item?.analyzedAt || a.item?.startedAt),
      )[0];
    if (!clearingAudit) continue;
    const at = clearingAudit.item?.analyzedAt || clearingAudit.item?.startedAt || "";
    group.auditClearedAt = at;
    group.auditClearedScope = clearingAudit.scope;
    group.auditScopes.add(clearingAudit.scope);
    addSource(group, {
      label: clearingAudit.scope === "site" ? "Audit sito" : "Audit pagina",
      kind: "audit-clearance",
      at,
      detail: "La stessa URL è stata ricontrollata da un audit più recente e questo problema non è più stato rilevato.",
      nature: "verified",
    });
  }
};

export function buildUnifiedProblems({
  clientId,
  siteHistory = [],
  pageHistory = [],
  tasks = [],
  corrections = [],
  closures = [],
  now = Date.now(),
} = {}) {
  const normalizedClientId = normalizeClientId(clientId);
  if (!normalizedClientId) return { rows: [], activeRows: [], warnings: ["Cliente non selezionato o ID non valido."], coverage: null };

  const groups = new Map();
  const aliasMap = new Map();
  const auditCompatibilityMap = new Map();
  const warnings = [];

  const registerAuditCompatibility = (record, group) => {
    const key = auditCompatibilityIdentity(record);
    if (!key) return;
    const existing = auditCompatibilityMap.get(key);
    if (existing === undefined) auditCompatibilityMap.set(key, group.key);
    else if (existing !== group.key) auditCompatibilityMap.set(key, "");
  };

  const compatibleAuditGroup = (record) => {
    const key = auditCompatibilityIdentity(record);
    const groupKey = key ? auditCompatibilityMap.get(key) : "";
    return groupKey && groups.has(groupKey) ? groups.get(groupKey) : null;
  };
  const site = latestSite(siteHistory);
  const pageAudits = latestPagesByUrl(pageHistory);
  const audits = [
    ...(site ? [{ scope: "site", item: site }] : []),
    ...pageAudits.map((item) => ({ scope: "page", item })),
  ];

  for (const { scope, item } of audits) {
    const at = item?.analyzedAt || item?.startedAt || "";
    for (const issue of Array.isArray(item?.issues) ? item.issues : []) {
      const sourceUrl = issueSourceUrl(issue, item?.url || "");
      if (isLegalPage(sourceUrl)) continue;
      const record = { issueType: issue?.type, issueLabel: issue?.label, sourceUrl, issue };
      const group = findOrCreate(groups, aliasMap, record, issue, sourceUrl);
      registerAuditCompatibility(record, group);
      for (const text of [issue?.anchorText, issue?.anchor, issue?.linkText, ...(Array.isArray(issue?.occurrences) ? issue.occurrences : []).map(o => o.anchorText)].filter(v => typeof v === "string" && v.trim())) group.anchorTexts.add(text.trim());
      const brokenTarget = issueBrokenTarget(issue);
      if (brokenTarget) group.targetUrls.add(brokenTarget);
      const intentional = issue?.intentional === true;
      group.events.push({ kind: intentional ? "audit_intentional" : "audit_detected", at, source: "audit", scope });
      group.auditScopes.add(scope);
      const newestAudit = !group.latestAuditAt || timestamp(at) >= timestamp(group.latestAuditAt);
      if (newestAudit) {
        group.title = issue?.label || issue?.type || group.title;
        group.detail = issue?.detail || group.detail;
        const currentSeverity = severity(issue?.severity);
        if (currentSeverity !== "unknown") group.severity = currentSeverity;
        group.latestAuditAt = at || group.latestAuditAt;
      }
      const targetDetail = brokenTarget ? ` · Destinazione: ${brokenTarget}` : "";
      addSource(group, {
        label: scope === "site" ? "Audit sito" : "Audit pagina",
        kind: "audit",
        at,
        detail: `${issue?.detail || issue?.label || "Rilevazione audit"}${targetDetail}`,
        nature: "observed",
      });
    }

    for (const reviewItem of Array.isArray(item?.reviewItems) ? item.reviewItems : []) {
      const sourceUrl = issueSourceUrl(reviewItem, item?.url || "");
      if (isLegalPage(sourceUrl)) continue;
      const record = { issueType: reviewItem?.type, issueLabel: reviewItem?.label, sourceUrl, issue: reviewItem };
      const group = findOrCreate(groups, aliasMap, record, reviewItem, sourceUrl);
      registerAuditCompatibility(record, group);
      group.events.push({ kind: "audit_review", at, source: "audit", scope });
      group.auditScopes.add(scope);
      const newestReview = !group.latestAuditAt || timestamp(at) >= timestamp(group.latestAuditAt);
      if (newestReview) {
        group.title = reviewItem?.label || reviewItem?.type || group.title;
        group.detail = reviewItem?.detail || group.detail || "Segnale da confermare.";
        const currentSeverity = severity(reviewItem?.severity);
        if (currentSeverity !== "unknown") group.severity = currentSeverity;
        group.latestAuditAt = at || group.latestAuditAt;
      }
      addSource(group, {
        label: scope === "site" ? "Audit sito · Da confermare" : "Audit pagina · Da confermare",
        kind: "audit-review",
        at,
        detail: reviewItem?.detail || reviewItem?.label || "Segnale da confermare prima di correggere.",
        nature: reviewItem?.evidenceNature || "derived",
      });
    }
  }

  for (const task of Array.isArray(tasks) ? tasks : []) {
    const normalizedTaskKind = String(task?.kind || "").trim().toLowerCase();
    const origin = taskOrigin(task);
    const legacyOpportunityTask = ["search", "cannibalization"].includes(normalizedTaskKind) &&
      !task?.taskLinks?.problemKey &&
      !task?.taskLinks?.correctionId;
    if (normalizedTaskKind === "seo-agent" || origin === "opportunity" || legacyOpportunityTask) continue;
    if (task.stale) continue;
    if (normalizeClientId(task?.sourceClientId) !== normalizedClientId) {
      if (!task?.sourceClientId && task?.client) warnings.push(`Task legacy non associata tramite ID: ${task.title || "senza titolo"}.`);
      continue;
    }
    const sourceUrl = task?.sourceUrl || task?.targetUrl || "";
    if (isLegalPage(sourceUrl)) continue;
    const taskKind = normalizedTaskKind;
    const legacyAnalysisTask = /^analysis-/i.test(String(task?.id || ""));
    const explicitManualTask = taskKind === "manual" || (task?.origin === "manual" && !legacyAnalysisTask);
    const hasCanonicalLink = Boolean(task?.taskLinks?.problemKey || task?.taskLinks?.correctionId);
    if (explicitManualTask && task?.status === "Completato" && !hasCanonicalLink) continue;
    const record = { issueType: task?.kind, issueLabel: task?.title, sourceUrl, targetUrl: task?.targetUrl || "" };
    const linkedProblemKey = String(task?.taskLinks?.problemKey || "").trim();
    const linkedProblemAlias = linkedProblemKey ? aliasMap.get(linkedProblemKey) : "";
    const linkedProblemGroup = linkedProblemKey
      ? groups.get(linkedProblemKey) || (linkedProblemAlias ? groups.get(linkedProblemAlias) : null)
      : null;
    const group = linkedProblemGroup || compatibleAuditGroup(record) || findOrCreate(groups, aliasMap, record, null, sourceUrl);
    const event = taskEvent(task);
    group.events.push(event);
    const legacyAuditTask = !task?.origin && legacyAuditTaskKinds.has(taskKind);
    const auditDerivedTask = !explicitManualTask && (taskOrigin(task) === "audit" || task?.automatic === true || legacyAuditTask || legacyAnalysisTask);
    if (auditDerivedTask) {
      const taskObservedAt = task?.lastObservedAt || task?.createdAt || "";
      group.auditDerivedTask = true;
      if (legacyAnalysisTask) group.legacyAnalysisTask = true;
      if (!group.latestAuditTaskAt || timestamp(taskObservedAt) > timestamp(group.latestAuditTaskAt)) group.latestAuditTaskAt = taskObservedAt;
    }
    if (priority(task?.priority) !== "unknown") group.priority = priority(task.priority);
    if (!group.detail) group.detail = task?.detail || task?.notes || "";
    if (/broken-(?:external-)?link/.test(String(task?.kind || "").toLowerCase())) {
      const target = safeHttpHref(task?.targetUrl || "");
      if (target && target !== normalizeHttpUrl(sourceUrl, { stripSlash: false })) group.targetUrls.add(target);
    }
    addSource(group, {
      label: "Task SeoGrow",
      kind: "task",
      at: event.at,
      detail: task?.detail || task?.notes || task?.title || "Task tecnica",
      nature: "operational",
    });
  }

  for (const correction of (Array.isArray(corrections) ? corrections : []).flatMap(record => [record, ...(Array.isArray(record.batchIssues) ? record.batchIssues : []).map(item => ({ ...record, batchIssues: undefined, issue: item.issue, issueType: item.issue?.type, issueLabel: item.issue?.label, sourceUrl: item.sourceUrl, issueKey: undefined, legacyIssueKey: undefined }))])) {
    if (normalizeClientId(correction?.clientId) !== normalizedClientId) continue;
    if (isTechnicalRecoveryFixture(correction)) continue;
    const sourceUrl = correction?.sourceUrl || "";
    if (isLegalPage(sourceUrl)) continue;
    const record = {
      ...correction,
      issueType: correction?.issueType,
      issueLabel: correction?.issueLabel,
      sourceUrl,
    };
    const group = compatibleAuditGroup(record) || findOrCreate(groups, aliasMap, record, null, sourceUrl);
    const event = correctionEvent(correction);
    group.events.push(event);
    if (event.at && (!group.latestCorrectionAt || timestamp(event.at) > timestamp(group.latestCorrectionAt))) group.latestCorrectionAt = event.at;
    group.fields = [...new Set([...group.fields, ...(Array.isArray(correction?.fields) ? correction.fields : [])])];
    if (correction?.adapter) group.adapters = [...new Set([...group.adapters, correction.adapter])];
    const reason = `${correction?.reason || ""} ${correction?.verificationNote || ""} ${correction?.error || ""}`;
    if (/ownership/i.test(reason)) group.ownershipBlocked = true;
    if (/error|errore|failed|fallit/i.test(String(correction?.status || "")) || correction?.error) group.technicalError = true;
    if (correction?.quality) group.quality = correction.quality;
    addSource(group, {
      label: "Correzione WordPress",
      kind: "correction",
      at: event.at,
      detail: correction?.verificationNote || correction?.reason || `Stato correzione: ${correction?.status || "sconosciuto"}`,
      nature: correction?.status === "Verificato" ? "verified" : "operational",
    });
  }

  reconcileAuditClearance(groups, audits);

  const closureFor = (group) => (Array.isArray(closures) ? closures : []).filter((item) => {
    if (normalizeClientId(item.clientId) !== normalizedClientId) return false;
    if (normalizeHttpUrl(item.sourceUrl || "", { stripSlash:true }) !== normalizeHttpUrl(group.sourceUrl || "", { stripSlash:true })) return false;
    if (String(item.issueType || "").toLowerCase() !== String(group.issueType || "").toLowerCase()) return false;
    if (item.issueKey && item.issueKey === group.key) return true;
    const targetScoped = /broken-(?:external-)?link|link esterno|link interno/i.test(String(group.issueType || ""));
    const wantedTarget = normalizeHttpUrl(item.targetUrl || "", { stripSlash:true });
    if (targetScoped && !wantedTarget) return false;
    if (!wantedTarget) return true;
    return [...group.targetUrls].some((target) => normalizeHttpUrl(target || "", { stripSlash:true }) === wantedTarget);
  }).toSorted((a,b)=>timestamp(b.closedAt)-timestamp(a.closedAt))[0] || null;

  const rows = [...groups.values()].map((group) => {
    const state = deriveProblemState(group.events);
    const clearanceAt = group.auditClearedAt || "";
    const clearanceTime = timestamp(clearanceAt);
    const invalidatedAfterClearance = clearanceTime > 0 && group.events.some((event) =>
      timestamp(event?.at) > clearanceTime && ["audit_detected", "correction_applied", "rollback"].includes(event?.kind),
    );
    const clearedByNewerAudit = clearanceTime > timestamp(group.latestAuditAt) && !invalidatedAfterClearance;
    const isolatedQaCompleted = String(group.issueType || "").trim().toLowerCase() === "qa-isolated" && state.interventionState === "rolled_back";
    const reviewOnly = group.sources.some((source) => source.kind === "audit-review") && !group.sources.some((source) => source.kind === "audit");
    const reviewObservedAfterVerification = reviewOnly && (!state.verifiedAt || timestamp(group.latestAuditAt) > timestamp(state.verifiedAt));
    const closure = closureFor(group);
    const taskOnlyMisMigratedAnalysis = group.legacyAnalysisTask === true &&
      group.sources.length > 0 &&
      group.sources.every((source) => source.kind === "task") &&
      !closure;
    if (taskOnlyMisMigratedAnalysis) return null;
    const closureTime = timestamp(closure?.closedAt);
    const permanentlyExcluded = closureTime > 0 && isPermanentClosure(closure);
    const reobservedAfterClosure = !permanentlyExcluded && closureTime > 0 && group.events.some((event) => timestamp(event?.at) > closureTime && event?.kind === "audit_detected");
    const closedPersistently = closureTime > 0 && !reobservedAfterClosure;
    const problemState = permanentlyExcluded ? "intentional" : isolatedQaCompleted ? "intentional" : reobservedAfterClosure ? "reappeared" : closedPersistently ? "resolved" : clearedByNewerAudit ? "resolved" : reviewObservedAfterVerification ? "needs_verification" : state.problemState;
    const verifiedAt = closedPersistently ? closure?.closedAt : clearedByNewerAudit ? clearanceAt : state.verifiedAt;
    const latestAuditSource = group.sources
      .filter((source) => ["audit", "audit-review", "audit-clearance"].includes(source.kind))
      .sort((a, b) => timestamp(b.at) - timestamp(a.at))[0] || null;
    const observedAt = clearedByNewerAudit
      ? clearanceAt
      : state.lastAuditAt || latestAuditSource?.at || (problemState === "resolved" ? verifiedAt : "");
    const ageMs = observedAt ? Math.max(0, now - timestamp(observedAt)) : Number.POSITIVE_INFINITY;
    const stale = !Number.isFinite(ageMs) || ageMs > 7 * 24 * 60 * 60_000;
    const freshnessReason = !observedAt
      ? "Nessuna evidenza audit recente associata a questa identità."
      : stale
        ? "L'ultima evidenza audit associata supera la soglia di 7 giorni."
        : "L'evidenza audit associata è recente.";
    const confidence = reviewOnly ? "needs_confirmation" : issueConfidence(
      { type: group.issueType, label: group.title, detail: group.detail },
      {
        pageKind: group.pageKind,
        canonicalEvidence: group.evidence.some((item) => /canonical.*(?:http|frontend|destin)/i.test(item.detail || "")),
        browserRendered: group.evidence.some((item) => /browser|render|frontend verificato/i.test(item.detail || "")),
      },
    );
    return {
      key: group.key,
      title: group.title,
      issueType: group.issueType,
      sourceUrl: group.sourceUrl,
      targetUrls: [...group.targetUrls],
      anchorTexts: [...group.anchorTexts],
      detail: group.detail || "Dettaglio non disponibile.",
      severity: group.severity,
      priority: group.priority,
      problemState,
      interventionState: state.interventionState,
      correctability: reviewOnly ? "not_supported" : issueCorrectability(
        { type: group.issueType, label: group.title, detail: group.detail },
        { pageKind: group.pageKind, ownershipBlocked: group.ownershipBlocked },
      ),
      confidence,
      observedAt,
      verifiedAt,
      stale,
      freshnessTrace: {
        reason: freshnessReason,
        observedAt,
        latestAuditAt: group.latestAuditAt || "",
        latestAuditTaskAt: group.latestAuditTaskAt || "",
        latestCorrectionAt: group.latestCorrectionAt || "",
        auditClearedAt: group.auditClearedAt || "",
        auditClearedScope: group.auditClearedScope || "",
        auditDerivedTask: group.auditDerivedTask === true,
        sourceKinds: [...new Set(group.sources.map((source) => source.kind).filter(Boolean))],
      },
      regression: problemState === "reappeared",
      ownershipBlocked: group.ownershipBlocked,
      technicalError: group.technicalError,
      fields: group.fields,
      adapters: group.adapters,
      sources: group.sources.toSorted((a, b) => timestamp(b.at) - timestamp(a.at)),
      evidence: group.evidence.toSorted((a, b) => timestamp(b.at) - timestamp(a.at)),
      auditScopes: [...group.auditScopes],
      quality: group.quality,
      pageKind: group.pageKind,
      resolvedByAudit: clearedByNewerAudit,
      reviewOnly,
      disposition: permanentlyExcluded ? "do_not_modify" : "",
    };
  }).filter(Boolean).toSorted((a, b) => {
    const stateWeight = { reappeared: 0, open: 1, needs_verification: 2, intentional: 3, resolved: 4 };
    const severityWeight = { high: 0, medium: 1, low: 2, unknown: 3 };
    return (stateWeight[a.problemState] ?? 9) - (stateWeight[b.problemState] ?? 9) ||
      (severityWeight[a.severity] ?? 9) - (severityWeight[b.severity] ?? 9) ||
      timestamp(b.observedAt) - timestamp(a.observedAt);
  });

  return {
    rows,
    activeRows: rows.filter(isProblemActive),
    warnings: [...new Set(warnings)],
    coverage: {
      siteAuditAt: site?.analyzedAt || site?.startedAt || "",
      sitePages: site ? observedPageCount(site) : null,
      pageAudits: pageAudits.length,
    },
  };
}
