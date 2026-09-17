import { readWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { getWordPressSession } from "./system/index.js";
import { buildUnifiedProblems } from "./problemsModel.js";
import { loadProjectWorkspaceState } from "./projectWorkspaceState.js";

const arrayForClient = (store, clientId) => {
  const value = store?.[clientId] ?? store?.[String(clientId)] ?? [];
  if (Array.isArray(value)) return value;
  return value && typeof value === "object" ? [value] : [];
};

const timestamp = (value) => {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const latestRanking = (store, clientId) =>
  arrayForClient(store, clientId).toSorted((a, b) => timestamp(b?.checkedAt) - timestamp(a?.checkedAt))[0] || null;

const providerReady = (status) => Boolean(status?.configured || status?.verified || status?.connected);

export function deriveProjectContinuity({
  projectState,
  dataset = null,
  rankings = {},
  wordpressProfile = null,
  wordpressSession = null,
  dataForSeoStatus = {},
  openAiStatus = {},
} = {}) {
  if (!projectState?.client) return null;
  const { clientId, client, audits, tasks = [], corrections = [], problemClosures = [] } = projectState;
  const siteAudit = audits?.site?.[0] || null;
  const pageAudit = audits?.page?.[0] || null;
  const latestAudit = [siteAudit, pageAudit]
    .filter(Boolean)
    .toSorted((a, b) => timestamp(b?.analyzedAt || b?.startedAt) - timestamp(a?.analyzedAt || a?.startedAt))[0] || null;
  const problemModel = buildUnifiedProblems({
    clientId,
    siteHistory: audits?.site || [],
    pageHistory: audits?.page || [],
    tasks,
    corrections,
    closures: problemClosures,
  });
  const ranking = latestRanking(rankings, clientId);
  const activeProblems = problemModel.rows.filter((row) => !["resolved", "intentional"].includes(row.problemState));
  const completedTasks = tasks.filter((task) => task.status === "Completato").length;
  const verifiedCorrections = corrections.filter((item) => String(item.status || "").toLowerCase() === "verificato").length;
  const gscProperty = client.gscProperty || dataset?.property?.url || dataset?.property?.siteUrl || "";

  return {
    clientId,
    client,
    site: client.url,
    integrations: {
      wordpress: {
        configured: Boolean(wordpressProfile?.url && wordpressProfile?.username),
        connected: Boolean(wordpressSession),
        label: wordpressSession
          ? "Connesso · sessione unica"
          : wordpressProfile?.url && wordpressProfile?.username
            ? "Configurato · verifica sessione"
            : "Da configurare",
        detail: wordpressProfile?.username || "",
      },
      searchConsole: {
        configured: Boolean(dataset),
        connected: Boolean(dataset),
        label: dataset ? "Dati collegati al progetto" : "Da collegare",
        detail: gscProperty,
      },
      dataForSeo: {
        configured: providerReady(dataForSeoStatus),
        connected: providerReady(dataForSeoStatus),
        label: providerReady(dataForSeoStatus) ? "Disponibile al progetto" : "Provider da configurare",
        detail: "Provider condiviso, contesto isolato per progetto",
      },
      openAI: {
        configured: providerReady(openAiStatus),
        connected: providerReady(openAiStatus),
        label: providerReady(openAiStatus) ? "Disponibile al progetto" : "Provider da configurare",
        detail: "Provider condiviso, contesto isolato per progetto",
      },
    },
    work: {
      audit: {
        available: Boolean(latestAudit),
        count: (audits?.site?.length || 0) + (audits?.page?.length || 0),
        score: Number.isFinite(Number(latestAudit?.score)) ? Number(latestAudit.score) : null,
        updatedAt: latestAudit?.analyzedAt || latestAudit?.startedAt || "",
      },
      problems: {
        active: activeProblems.length,
        high: activeProblems.filter((row) => row.severity === "high").length,
        resolved: problemModel.rows.filter((row) => row.problemState === "resolved").length,
        verify: problemModel.rows.filter((row) => row.problemState === "needs_verification").length,
      },
      corrections: {
        total: corrections.length,
        verified: verifiedCorrections,
      },
      tasks: {
        total: tasks.length,
        active: tasks.length - completedTasks,
        completed: completedTasks,
      },
      rankings: {
        available: Boolean(ranking),
        checks: arrayForClient(rankings, clientId).length,
        keywords: Array.isArray(ranking?.rankings) ? ranking.rankings.length : 0,
        updatedAt: ranking?.checkedAt || "",
      },
    },
  };
}

export async function loadProjectContinuity(clientId, providerStatus = {}) {
  const projectState = await loadProjectWorkspaceState(clientId);
  if (!projectState.client) return null;
  const gsc = readWorkspaceJson(WORKSPACE_KEYS.gsc, {});
  const rankings = readWorkspaceJson(WORKSPACE_KEYS.rankings, {});
  const profiles = readWorkspaceJson(WORKSPACE_KEYS.wordpressProfiles, {});
  const dataset = gsc?.[clientId] ?? gsc?.[String(clientId)] ?? null;
  const wordpressProfile = profiles?.[clientId] ?? profiles?.[String(clientId)] ?? null;
  const sessionUrl = wordpressProfile?.url || projectState.client.url;
  const wordpressSession = getWordPressSession(clientId, sessionUrl) || getWordPressSession(clientId, projectState.client.url);
  return deriveProjectContinuity({
    projectState,
    dataset,
    rankings,
    wordpressProfile,
    wordpressSession,
    dataForSeoStatus: providerStatus.dataForSeo,
    openAiStatus: providerStatus.openAI,
  });
}
