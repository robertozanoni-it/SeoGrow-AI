import { normalizeHttpUrl } from './reliabilityModel.js';

const norm = value => normalizeHttpUrl(value || '', { stripSlash: true });
const clean = value => String(value || '').trim().toLowerCase().replace(/\s+/g,' ');
const timestamp = value => { const parsed = typeof value === 'string' && value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : 0; };
const targetScoped = type => /broken-(?:external-)?link|link esterno|link interno/i.test(String(type || ''));
const key = item => [Number(item.clientId)||0, String(item.issueType||'').toLowerCase(), norm(item.sourceUrl), norm(item.targetUrl)].join('::');

const contextFromRun = run => {
  for (const observation of Array.isArray(run?.observations) ? run.observations : []) {
    const data = observation?.result?.data;
    if (data && typeof data === 'object' && (data.sourceUrl || data.url) && (data.issueType || data.title || data.issueLabel)) return data;
  }
  return null;
};

const contextFromGoal = (run, problems = []) => {
  const goal=String(run?.goal || '');
  const urlMatch=goal.match(/URL:\s*(https?:\/\/\S+)/i);
  const sourceUrl=(urlMatch?.[1] || '').replace(/[.,;:!?]+$/,'');
  const titleMatch=goal.match(/problema specifico:\s*(.+?)(?:\.\s+URL:|$)/i);
  const title=String(titleMatch?.[1] || '').trim();
  if (!norm(sourceUrl) || !title) return null;
  const candidates=(Array.isArray(problems)?problems:[]).filter(row => norm(row?.sourceUrl)===norm(sourceUrl));
  const exact=candidates.filter(row => clean(row?.title)===clean(title));
  const fuzzy=exact.length ? exact : candidates.filter(row => clean(row?.title).includes(clean(title)) || clean(title).includes(clean(row?.title)));
  if (fuzzy.length !== 1) return null;
  const match=fuzzy[0];
  const targets=Array.isArray(match?.targetUrls) ? match.targetUrls.filter(Boolean) : [];
  if (targetScoped(match?.issueType) && targets.length !== 1) return null;
  return { issueKey:match.key || '', issueType:match.issueType || '', sourceUrl:match.sourceUrl, targetUrls:targets, title:match.title };
};

export function closuresFromAgentRuns(agentRuns = {}, existing = [], problems = []) {
  const byKey = new Map((Array.isArray(existing) ? existing : []).map(item => [key(item), item]));
  for (const [clientId, runs] of Object.entries(agentRuns || {})) {
    for (const run of Array.isArray(runs) ? runs : []) {
      if (run?.resolutionOutcome?.kind !== 'obsolete') continue;
      const context = contextFromRun(run) || contextFromGoal(run, problems);
      if (!context) continue;
      const sourceUrl = context.sourceUrl || context.url || '';
      const issueType = context.issueType || '';
      if (!norm(sourceUrl) || !String(issueType).trim()) continue;
      const targetUrl = Array.isArray(context.targetUrls) && context.targetUrls.length === 1 ? context.targetUrls[0] : context.targetUrl || '';
      if (targetScoped(issueType) && !norm(targetUrl) && !context.issueKey) continue;
      const closedAt = run.completedAt || run.startedAt || '';
      if (!timestamp(closedAt)) continue;
      const item = { clientId:Number(clientId), issueKey:context.issueKey || '', issueType, sourceUrl, targetUrl,
        closedAt, reason:'migrated-agent-obsolete', migratedFromRunId:run.id || '' };
      const current = byKey.get(key(item));
      if (!current || timestamp(item.closedAt) > timestamp(current.closedAt)) byKey.set(key(item), item);
    }
  }
  return [...byKey.values()].toSorted((a,b)=>timestamp(b.closedAt)-timestamp(a.closedAt));
}
