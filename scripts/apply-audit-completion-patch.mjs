import { readFile, writeFile } from 'node:fs/promises';

const replaceOnce = (source, before, after, label) => {
  if (!source.includes(before)) throw new Error(`Patch target missing: ${label}`);
  return source.replace(before, after);
};

const replaceBetween = (source, start, end, replacement, label) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Patch range missing: ${label}`);
  return `${source.slice(0, from)}${replacement}${source.slice(to)}`;
};

let server = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');

server = replaceOnce(
  server,
  `  const h1 = visibleH1Count(stripAlwaysHiddenMarkup(html));\n  const images = count(html, /<img\\b[^>]*>/gi);`,
  `  const visibleMarkup = stripAlwaysHiddenMarkup(html);\n  const h1 = visibleH1Count(visibleMarkup);\n  const h2 = count(visibleMarkup, /<h2\\b[^>]*>/gi);\n  const images = count(html, /<img\\b[^>]*>/gi);`,
  'pageSignals h2',
);
server = replaceOnce(server, `    h1,\n    images,`, `    h1,\n    h2,\n    images,`, 'pageSignals return h2');
server = replaceOnce(
  server,
  `    if (page.h1 !== 1) push("h1", "alta", \`\${page.h1} H1 rilevati\`, page);\n    if (page.canonicalError)`,
  `    if (page.h1 !== 1) push("h1", "alta", \`\${page.h1} H1 rilevati\`, page);\n    if (page.pageKind === "content" && page.words >= 180 && page.h2 === 0)\n      push("h2", "bassa", "Nessun H2 rilevato", page, \`\${page.words} parole visibili senza sottotitoli H2.\`);\n    if (page.canonicalError)`,
  'H2 issue',
);

server = replaceOnce(
  server,
  `  return issues.filter(Boolean);\n}\n\nasync function sitemapBody`,
  `  return finalizeAuditIssues(issues.filter(Boolean), pages);\n}\n\nconst severityOrder = Object.freeze({ bassa: 1, media: 2, alta: 3 });\nconst normalizeAuditSeverity = (value) => {\n  const normalized = String(value || "").trim().toLowerCase();\n  if (["critical", "critica", "high", "alta"].includes(normalized)) return "alta";\n  if (["low", "bassa"].includes(normalized)) return "bassa";\n  return "media";\n};\nconst auditIdentityUrl = (value) => {\n  if (!value) return "";\n  try { return canonicalCrawlUrl(value); } catch { return String(value).trim(); }\n};\nconst auditDataSource = (issue = {}) => {\n  const type = String(issue.type || "").toLowerCase();\n  if (/broken|http-status|crawl/.test(type)) return "Controllo HTTP riproducibile";\n  if (/x-robots/.test(type)) return "Header HTTP X-Robots-Tag";\n  if (/orphan/.test(type)) return "Sitemap + grafo link interni";\n  if (/performance/.test(type)) return "Tempo risposta HTTP";\n  return "HTML osservato dal crawler";\n};\nfunction finalizeAuditIssues(input, pages = []) {\n  const pageMap = new Map((Array.isArray(pages) ? pages : []).map((page) => [auditIdentityUrl(page.url), page]));\n  const byIdentity = new Map();\n  for (const raw of Array.isArray(input) ? input : []) {\n    if (!raw || typeof raw !== "object") continue;\n    const sourceUrl = raw.sourceUrl || raw.url || "";\n    const targetUrl = raw.targetUrl || "";\n    const page = sourceUrl ? pageMap.get(auditIdentityUrl(sourceUrl)) : null;\n    const severity = normalizeAuditSeverity(raw.severity);\n    const source = raw.dataSource || auditDataSource(raw);\n    const issue = {\n      ...raw,\n      severity,\n      sourceUrl,\n      dataSource: source,\n      evidence: raw.evidence || {\n        source,\n        sourceUrl,\n        targetUrl,\n        observed: raw.detail || raw.label || "Segnale rilevato dall’audit.",\n        status: raw.status ?? null,\n        pageStatus: page?.status ?? null,\n      },\n    };\n    const key = [String(issue.type || issue.label || "").toLowerCase(), auditIdentityUrl(sourceUrl), auditIdentityUrl(targetUrl)].join("::");\n    const previous = byIdentity.get(key);\n    if (!previous || severityOrder[severity] > severityOrder[previous.severity] || String(issue.detail || "").length > String(previous.detail || "").length)\n      byIdentity.set(key, issue);\n  }\n  return [...byIdentity.values()];\n}\n\nasync function sitemapBody`,
  'finalize audit issues',
);

const pageRoute = `app.post("/api/audit", crawlLimit, async (req, res) => {\n  const reportProgress = trackAudit(req, res);\n  const requestController = new AbortController();\n  req.once("aborted", () => requestController.abort());\n  res.once("close", () => { if (!res.writableEnded) requestController.abort(); });\n  try {\n    const requested = await safePublicUrl(req.body.url);\n    reportProgress({ phase: "Pagina · richiesta HTTP", done: 0, total: 4 });\n    const startedAtMs = Date.now();\n    const response = await fetchPublic(requested, { timeout: 15000, signal: requestController.signal });\n    const finalUrl = response.url;\n    const status = response.status;\n    if (isLegalPage(finalUrl)) {\n      await response.body?.cancel();\n      reportProgress({ phase: "Pagina GDPR esclusa", done: 4, total: 4 });\n      return res.json({ url: finalUrl, analyzedAt: new Date().toISOString(), legalOnly: true, legalPages: [{ url: finalUrl }], issues: [], score: null });\n    }\n    if (!response.ok) {\n      await response.body?.cancel();\n      const issues = finalizeAuditIssues([{\n        type: "http-status",\n        severity: status >= 500 || [404, 410].includes(status) ? "alta" : "media",\n        label: \`HTTP \${status} sulla pagina analizzata\`,\n        url: finalUrl,\n        sourceUrl: finalUrl,\n        status,\n        detail: \`La richiesta HTTP reale ha restituito \${status}.\`,\n        dataSource: "Controllo HTTP riproducibile",\n      }]);\n      reportProgress({ phase: "Pagina · stato HTTP verificato", done: 4, total: 4 });\n      return res.json({ url: finalUrl, analyzedAt: new Date().toISOString(), status, pagesChecked: 1, linksChecked: 0, issues, score: 0 });\n    }\n    const contentType = response.headers.get("content-type") || "";\n    if (!/(?:text\\/html|application\\/xhtml\\+xml)/i.test(contentType)) {\n      await response.body?.cancel();\n      throw new Error("La risorsa non è una pagina HTML: nessun punteggio SEO è stato calcolato.");\n    }\n    const html = await limitedBody(response, 8 * 1024 * 1024, "Pagina HTML");\n    reportProgress({ phase: "Pagina · HTML e metadati", done: 1, total: 4 });\n    const page = pageSignals(html, finalUrl, status, Date.now() - startedAtMs, 0, response.headers);\n    const siteHost = normalizedHost(new URL(finalUrl).hostname);\n    const allLinks = pageLinks(html, finalUrl);\n    const discovered = allLinks.slice(0, 100).map((target) => ({\n      target,\n      kind: normalizedHost(new URL(target).hostname) === siteHost ? "internal" : "external",\n    }));\n    const linkSources = new Map(discovered.filter((item) => item.kind === "internal").map((item) => [item.target, new Set([finalUrl])]));\n    const externalLinkSources = new Map(discovered.filter((item) => item.kind === "external").map((item) => [item.target, new Set([finalUrl])]));\n    const internalResults = new Map();\n    const externalResults = new Map();\n    let cursor = 0;\n    let completed = 0;\n    reportProgress({ phase: "Pagina · verifica link", done: 0, total: Math.max(1, discovered.length), discovering: false });\n    await Promise.all(Array.from({ length: Math.min(4, discovered.length) }, async () => {\n      while (cursor < discovered.length) {\n        const item = discovered[cursor++];\n        const check = await fetchStatusWithRetry(item.target, 2, requestController.signal);\n        (item.kind === "internal" ? internalResults : externalResults).set(item.target, check);\n        reportProgress({ phase: "Pagina · verifica link", done: ++completed, total: Math.max(1, discovered.length), discovering: false });\n      }\n    }));\n    const broken = (items, results, sources) => items.flatMap((item) => {\n      const check = results.get(item.target);\n      const isBroken = !check?.status || [404, 410].includes(check.status) || check.status === 429 || check.status >= 500;\n      return isBroken ? [{ url: item.target, status: check?.status || null, error: check?.error || "", temporary: Boolean(check?.temporary), sources: [...(sources.get(item.target) || [])] }] : [];\n    });\n    const brokenLinks = broken(discovered.filter((item) => item.kind === "internal"), internalResults, linkSources);\n    const brokenExternalLinks = broken(discovered.filter((item) => item.kind === "external"), externalResults, externalLinkSources);\n    reportProgress({ phase: "Pagina · classificazione issue", done: 3, total: 4 });\n    const issues = technicalIssues([page], linkSources, brokenLinks, [], brokenExternalLinks);\n    const penalty = issues.reduce((sum, issue) => sum + (issue.severity === "alta" ? 5 : issue.severity === "media" ? 2 : 1), 0);\n    reportProgress({ phase: "Pagina · completata", done: 4, total: 4 });\n    res.json({\n      ...page,\n      analyzedAt: new Date().toISOString(),\n      pagesChecked: 1,\n      linksChecked: discovered.length,\n      brokenLinks,\n      brokenExternalLinks,\n      issues,\n      score: Math.max(0, 100 - penalty),\n      limits: { links: 100, truncatedLinks: allLinks.length > 100 },\n    });\n  } catch (error) {\n    res.status(400).json({ error: error.message || "Analisi non riuscita" });\n  }\n});\n\n`;
server = replaceBetween(
  server,
  'app.post("/api/audit", crawlLimit, async (req, res) => {',
  'app.post("/api/site-analysis", crawlLimit, async (req, res) => {',
  pageRoute,
  'page audit route',
);

server = replaceOnce(
  server,
  `    const issues = technicalIssues(\n      pages,\n      linkSources,\n      brokenLinks,\n      queueCursor < queue.length ? [] : sitemap,\n      brokenExternalLinks,\n    ).filter(issue => !isLegalPage(issue.url || issue.targetUrl));`,
  `    const seedFailureIssues = failures\n      .filter((failure) => auditIdentityUrl(failure.url || "") === auditIdentityUrl(seed.href) && Number(failure.status) >= 400)\n      .map((failure) => ({\n        type: "http-status",\n        severity: Number(failure.status) >= 500 || [404, 410].includes(Number(failure.status)) ? "alta" : "media",\n        label: \`HTTP \${failure.status} sulla pagina iniziale\`,\n        url: failure.url,\n        sourceUrl: failure.url,\n        status: failure.status,\n        detail: failure.reason || \`HTTP \${failure.status}\`,\n        dataSource: "Controllo HTTP riproducibile",\n      }));\n    const issues = finalizeAuditIssues([\n      ...technicalIssues(\n        pages,\n        linkSources,\n        brokenLinks,\n        queueCursor < queue.length ? [] : sitemap,\n        brokenExternalLinks,\n      ),\n      ...seedFailureIssues,\n    ], pages).filter(issue => !isLegalPage(issue.url || issue.targetUrl));`,
  'site seed HTTP issue',
);

await writeFile(new URL('../server/index.js', import.meta.url), server);

let audit = await readFile(new URL('../src/AuditWorkspace.jsx', import.meta.url), 'utf8');
audit = replaceOnce(
  audit,
  `import { normalizeSiteAnalysis } from "./seoResponseIntegrity";`,
  `import { normalizeSiteAnalysis } from "./seoResponseIntegrity";\nimport { auditIssuesForDisplay } from "./auditEvidenceModel.js";`,
  'audit evidence import',
);
audit = replaceOnce(
  audit,
  `  const issues = Array.isArray(result?.issues) ? result.issues : [];\n  const reviewItems = Array.isArray(result?.reviewItems) ? result.reviewItems : [];`,
  `  const issues = auditIssuesForDisplay(result?.issues, result?.url || client.url);\n  const reviewItems = auditIssuesForDisplay(result?.reviewItems, result?.url || client.url);`,
  'audit display normalization',
);
audit = replaceOnce(
  audit,
  `              {["automatic", "assisted"].includes(correctability) ? <button type="button" className="primary mini audit-agent-action" onClick={() => openRemediation(index)}><Sparkles />{correctability === "automatic" ? "Prepara correzione" : "Esamina e prepara"}</button> : <button type="button" className="secondary mini" onClick={() => askAgent(issue, result)}><Sparkles />Apri guida</button>}\n              {href && <a className="task-link" href={href} target="_blank" rel="noreferrer"><ExternalLink />Apri pagina</a>}\n              <button type="button" className="secondary mini" onClick={() => createTask(issue, selectedResult.type, result)}>Crea task</button>\n              <small className="audit-correctability-note">Correggibilità: {correctability === "automatic" ? "automatica con approvazione" : correctability === "assisted" ? "assistita" : correctability === "manual" ? "manuale" : "non supportata"}</small>`,
  `              <button type="button" className={["automatic", "assisted"].includes(correctability) ? "primary mini audit-agent-action" : "secondary mini audit-agent-action"} onClick={() => openRemediation(issue.auditIndex ?? index)}><Sparkles />Vai alla risoluzione</button>\n              {href && <a className="task-link" href={href} target="_blank" rel="noreferrer"><ExternalLink />Apri pagina</a>}\n              <button type="button" className="secondary mini" onClick={() => createTask(issue, selectedResult.type, result)}>Crea task</button>\n              <small className="audit-evidence-source">Fonte dati: <strong>{issue.dataSource}</strong> · {issue.evidence?.observed || issue.detail || issue.label}</small>\n              {issue.targetUrl && <small className="audit-evidence-target">Destinazione verificata: {issue.targetUrl}</small>}\n              <small className="audit-correctability-note">Correggibilità: {correctability === "automatic" ? "automatica con approvazione" : correctability === "assisted" ? "assistita" : correctability === "manual" ? "manuale" : "non supportata"}</small>`,
  'audit resolution CTA',
);
await writeFile(new URL('../src/AuditWorkspace.jsx', import.meta.url), audit);

console.log('Audit completion patch applied');
