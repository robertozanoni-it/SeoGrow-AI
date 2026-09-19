import { auditCompatibilityIdentity } from "../problemIdentityCompatibility.js";
import { normalizeHttpUrl } from "../reliabilityModel.js";

export const RUNTIME_CONSISTENCY_SOURCE = "runtime-consistency";

const SITE_SCOPE_TYPES = new Set([
  "duplicate-title",
  "duplicate-description",
  "orphan",
  "broken-link",
  "broken-external-link",
]);

const OPPORTUNITY_TYPES = new Set(["search", "cannibalization"]);

const time = (value) => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const comparableUrl = (value) => normalizeHttpUrl(value || "", { stripSlash: true });

const auditAt = (audit) => audit?.analyzedAt || audit?.startedAt || "";

const auditObservedUrl = (scope, audit, sourceUrl) => {
  const wanted = comparableUrl(sourceUrl);
  if (!wanted) return false;
  if (scope === "page") return comparableUrl(audit?.url) === wanted;
  if (scope !== "site") return false;
  return (Array.isArray(audit?.pages) ? audit.pages : []).some(
    (page) => comparableUrl(page?.url) === wanted && page?.ok !== false,
  );
};

const auditContainsProblem = (audit, row) => {
  const wanted = auditCompatibilityIdentity({
    issueType: row?.issueType,
    issueLabel: row?.title,
    sourceUrl: row?.sourceUrl,
    targetUrl: row?.targetUrls?.[0] || "",
  });
  if (!wanted) return false;
  return [
    ...(Array.isArray(audit?.issues) ? audit.issues : []),
    ...(Array.isArray(audit?.reviewItems) ? audit.reviewItems : []),
  ].some((issue) => auditCompatibilityIdentity({
    ...issue,
    issueType: issue?.type || issue?.issueType,
    issueLabel: issue?.label || issue?.issueLabel,
    sourceUrl: issue?.sourceUrl || issue?.url || audit?.url || "",
  }) === wanted);
};

const technicalFixture = (record = {}) => {
  const id = String(record?.id || "");
  const label = String(record?.issueLabel || record?.title || record?.issue?.label || "");
  return /^g06-live-/i.test(id) || /\bg06\b.*lost[ -]?response.*recovery/i.test(label);
};

const visualIsRed = (value) => {
  const text = String(value || "").replace(/\s+/g, "").toLowerCase();
  return text === "#d92d20" || text === "rgb(217,45,32)" || text === "rgba(217,45,32,1)";
};

const visualIsWhite = (value) => {
  const text = String(value || "").replace(/\s+/g, "").toLowerCase();
  return text === "#fff" || text === "#ffffff" || text === "rgb(255,255,255)" || text === "rgba(255,255,255,1)";
};

const finding = (code, severity, message, detail, clientId = null) => ({
  code,
  severity,
  source: RUNTIME_CONSISTENCY_SOURCE,
  message,
  detail,
  clientId,
});

export function analyzeProjectRuntimeConsistency({
  clientId,
  rows = [],
  activeRows = [],
  tasks = [],
  corrections = [],
  siteHistory = [],
  pageHistory = [],
  now = Date.now(),
} = {}) {
  const findings = [];
  const activeKeys = new Set(activeRows.map((row) => row?.key).filter(Boolean));
  const seen = new Set();

  for (const row of rows) {
    if (!row) continue;
    if (row.key && seen.has(row.key)) {
      findings.push(finding(
        "DUPLICATE_PROBLEM_IDENTITY",
        "error",
        "La stessa identità problema compare più di una volta.",
        `Problema: ${row.title || row.issueType || row.key} · key=${row.key}`,
        clientId,
      ));
    }
    if (row.key) seen.add(row.key);

    if (["resolved", "intentional"].includes(row.problemState) && activeKeys.has(row.key)) {
      findings.push(finding(
        "RESOLVED_PROBLEM_STILL_ACTIVE",
        "error",
        "Un problema chiuso è ancora presente tra gli attivi.",
        `Problema: ${row.title || row.issueType || row.key}`,
        clientId,
      ));
    }

    if (!Array.isArray(row.sources) || row.sources.length === 0) {
      findings.push(finding(
        "PROBLEM_WITHOUT_SOURCE",
        "error",
        "Un problema attivo non ha una fonte canonica.",
        `Problema: ${row.title || row.issueType || row.key} · URL: ${row.sourceUrl || "non disponibile"}`,
        clientId,
      ));
    }

    const rowType = String(row.issueType || "").trim().toLowerCase();
    if (OPPORTUNITY_TYPES.has(rowType) || /^(?:associa e )?ottimizza[\s“"]/i.test(String(row.title || ""))) {
      findings.push(finding(
        "PROBLEM_DOMAIN_LEAK",
        "error",
        "Una Task di Opportunità/Search è entrata nel dominio Problemi.",
        `Tipo: ${rowType || "n/d"} · ${row.title || "senza titolo"} · ${row.sourceUrl || "URL non disponibile"}`,
        clientId,
      ));
    }

    const fixtureCorrection = corrections.find((record) =>
      technicalFixture(record) &&
      comparableUrl(record?.sourceUrl) &&
      comparableUrl(record?.sourceUrl) === comparableUrl(row.sourceUrl),
    );
    if (fixtureCorrection && row.sources?.some((source) => source?.kind === "correction")) {
      findings.push(finding(
        "TECHNICAL_FIXTURE_EXPOSED",
        "error",
        "Una fixture tecnica di recovery è visibile come problema SEO.",
        `Fixture: ${fixtureCorrection.id || fixtureCorrection.issueLabel || "G06"} · URL: ${row.sourceUrl || "n/d"}`,
        clientId,
      ));
    }

    if (row.stale && row.sourceUrl) {
      const requiresSite = SITE_SCOPE_TYPES.has(rowType);
      const audits = [
        ...(Array.isArray(siteHistory) ? siteHistory : []).map((item) => ({ scope: "site", item })),
        ...(Array.isArray(pageHistory) ? pageHistory : []).map((item) => ({ scope: "page", item })),
      ];
      const freshClean = audits
        .filter(({ scope, item }) =>
          (!requiresSite || scope === "site") &&
          time(auditAt(item)) > 0 &&
          now - time(auditAt(item)) <= 7 * 24 * 60 * 60_000 &&
          auditObservedUrl(scope, item, row.sourceUrl) &&
          !auditContainsProblem(item, row),
        )
        .sort((a, b) => time(auditAt(b.item)) - time(auditAt(a.item)))[0];
      if (freshClean) {
        findings.push(finding(
          "STALE_AFTER_FRESH_CLEAN_AUDIT",
          "warning",
          "Un problema resta da riconvalidare nonostante un audit recente e pulito sulla stessa URL.",
          `Problema: ${row.title || rowType} · Audit ${freshClean.scope}: ${auditAt(freshClean.item)} · URL: ${row.sourceUrl}`,
          clientId,
        ));
      }
    }
  }

  const opportunityTasks = tasks.filter((task) => {
    const kind = String(task?.kind || "").trim().toLowerCase();
    const origin = String(task?.origin || "").trim().toLowerCase();
    return origin === "opportunity" || OPPORTUNITY_TYPES.has(kind);
  });
  const leakedOpportunityTitles = new Set(
    rows.filter((row) => OPPORTUNITY_TYPES.has(String(row?.issueType || "").toLowerCase())).map((row) => row.title),
  );
  for (const task of opportunityTasks) {
    if (!leakedOpportunityTitles.has(task?.title)) continue;
    findings.push(finding(
      "OPPORTUNITY_TASK_VISIBLE_AS_PROBLEM",
      "error",
      "Una Task di opportunità è stata materializzata come Problema.",
      `Task: ${task.title || task.id || "senza titolo"}`,
      clientId,
    ));
  }

  return findings;
}

export function analyzeProblemsRouteVisualConsistency({
  currentPage = "",
  buttonExists = false,
  ariaCurrent = "",
  backgroundColor = "",
  color = "",
} = {}) {
  if (currentPage !== "Problemi") return [];
  const findings = [];
  if (!buttonExists || ariaCurrent !== "page") {
    findings.push(finding(
      "PROBLEMS_ROUTE_ACTIVE_STATE_MISMATCH",
      "warning",
      "La route Problemi non coincide con lo stato attivo della sidebar.",
      `buttonExists=${buttonExists} · aria-current=${ariaCurrent || "assente"}`,
    ));
    return findings;
  }
  if (!visualIsRed(backgroundColor) || !visualIsWhite(color)) {
    findings.push(finding(
      "PROBLEMS_ACTIVE_CONTRAST_MISMATCH",
      "warning",
      "La voce Problemi selezionata non usa il contrasto visivo previsto.",
      `background=${backgroundColor || "n/d"} · color=${color || "n/d"}`,
    ));
  }
  return findings;
}
