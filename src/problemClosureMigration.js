import { normalizeHttpUrl } from './reliabilityModel.js';

const norm = value => normalizeHttpUrl(value || '', { stripSlash: true });
const key = item => [Number(item.clientId)||0, String(item.issueType||'').toLowerCase(), norm(item.sourceUrl), norm(item.targetUrl)].join('::');

const contextFromRun = run => {
  for (const observation of Array.isArray(run?.observations) ? run.observations : []) {
    const data = observation?.result?.data;
    if (data && typeof data === 'object' && (data.sourceUrl || data.url) && (data.issueType || data.title || data.issueLabel)) return data;
  }
  return null;
};

export function closuresFromAgentRuns(agentRuns = {}, existing = []) {
  const byKey = new Map((Array.isArray(existing) ? existing : []).map(item => [key(item), item]));
  for (const [clientId, runs] of Object.entries(agentRuns || {})) {
    for (const run of Array.isArray(runs) ? runs : []) {
      if (run?.resolutionOutcome?.kind !== 'obsolete') continue;
      const context = contextFromRun(run);
      if (!context) continue;
      const sourceUrl = context.sourceUrl || context.url || '';
      const issueType = context.issueType || '';
      if (!norm(sourceUrl) || !String(issueType).trim()) continue;
      const targetUrl = Array.isArray(context.targetUrls) && context.targetUrls.length === 1 ? context.targetUrls[0] : context.targetUrl || '';
      const item = { clientId:Number(clientId), issueKey:context.issueKey || '', issueType, sourceUrl, targetUrl,
        closedAt:run.completedAt || run.startedAt || new Date().toISOString(), reason:'migrated-agent-obsolete', migratedFromRunId:run.id || '' };
      const current = byKey.get(key(item));
      if (!current || Date.parse(item.closedAt || 0) > Date.parse(current.closedAt || 0)) byKey.set(key(item), item);
    }
  }
  return [...byKey.values()].toSorted((a,b)=>Date.parse(b.closedAt||0)-Date.parse(a.closedAt||0));
}
