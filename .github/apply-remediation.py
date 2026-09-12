from pathlib import Path

def edit(name, old, new, count=None):
    p = Path(name)
    s = p.read_text()
    n = s.count(old)
    if n == 0 or (count is not None and n != count):
        raise RuntimeError(f'Unexpected source context: {name}: {old[:80]} ({n})')
    p.write_text(s.replace(old, new))

def section(name, start, end, value):
    p=Path(name); s=p.read_text(); a=s.index(start); b=s.index(end,a)
    p.write_text(s[:a]+value+s[b:])

common='import { assertCompletedModelResponse, collectFinalModelText, parseModelValue, canRetryGeneration } from "./remediationOutput.js";\n'
seo='server/wordpressSeoAdapterV2Hook.js'
edit(seo,'import { SEO_TEXT_LIMITS, seoCharacterCount }','import { SEO_TEXT_LIMITS }')
edit(seo,'import { deterministicDuplicateTitle } from "./deterministicSeoTitle.js";', 'import { deterministicDuplicateTitle } from "./deterministicSeoTitle.js";\nimport { completeSourceDescription } from "./metaDescriptionFallback.js";\n'+common)
section(seo,'export function collectSeoOutputText(', 'async function requestValue(', '''// Responses output and choices[0].message.content use the same final-text reader.
export function collectSeoOutputText(data) { return collectFinalModelText(data); }
export function parseSeoStructuredValue(text) {
  if (!String(text || "").trim()) throw new Error("OpenAI non ha restituito il valore SEO richiesto.");
  try { return parseModelValue(text, { allowPlainText: true }); }
  catch (error) { throw Object.assign(new Error("OpenAI non ha restituito un valore SEO strutturato valido.", { cause: error }), { code: "AI_OUTPUT_FORMAT" }); }
}
export function deterministicMetaDescription(page) { return completeSourceDescription(page); }

''')
edit(seo,'async function requestValue(kind, issue, context, retry, qualityFeedback = "") {','async function requestValue(kind, issue, context, retry, qualityFeedback = "", signal) {\n  signal?.throwIfAborted();')
edit(seo,'signal: AbortSignal.timeout(90_000),','signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(35_000)]) : AbortSignal.timeout(35_000),')
edit(seo,'Restituisci esclusivamente il valore richiesto nello schema JSON.',r'Restituisci esclusivamente un oggetto JSON con una sola proprietà stringa: {\"value\":\"testo proposto\"}.')
edit(seo,'if (!response.ok) throw new Error(data?.error?.message || `OpenAI ha restituito HTTP ${response.status}`);','if (!response.ok) throw Object.assign(new Error(data?.error?.message || `OpenAI ha restituito HTTP ${response.status}`), { status: response.status });')
section(seo,'  if (data?.error || data?.incomplete_details','  return parseSeoStructuredValue','  // data?.incomplete_details and compatible finish_reason are enforced.\n  assertCompletedModelResponse(data);\n')
edit(seo,'async function generateValue(kind, issue, page) {','''async function generateValue(kind, issue, page, manualValue) {
  if (manualValue !== undefined) {
    if (typeof manualValue !== "string" || !manualValue.trim()) throw Object.assign(new Error("Inserisci una proposta testuale non vuota."), { code: "EDITORIAL_REVIEW_REQUIRED" });
    const value = manualValue.trim();
    const quality = assertPublishableSeoSuggestion(kind, value, page);
    return { value, quality: { ...quality, source: "user-reviewed" }, manual: true };
  }''')
edit(seo,'  let lastError;\n  let qualityFeedback = "";','  const generationSignal = AbortSignal.timeout(95_000);\n  let lastError;\n  let qualityFeedback = "";')
edit(seo,'requestValue(kind, issue, context, attempt > 0, qualityFeedback)','requestValue(kind, issue, context, attempt > 0, qualityFeedback, generationSignal)')
edit(seo,'        error.quality = quality;','        error.quality = quality;\n        error.candidate = value;')
edit(seo,'    } catch (error) {\n      lastError = error;','    } catch (error) {\n      lastError = error;\n      if (!canRetryGeneration(error)) throw error;')
edit(seo,'generateValue(kind, req.body?.issue || {}, req.body?.page || {})','generateValue(kind, req.body?.issue || {}, req.body?.page || {}, req.body?.manualValue)')
edit(seo,'deterministicFallback: Boolean(result.deterministicFallback),','deterministicFallback: Boolean(result.deterministicFallback),\n        manual: Boolean(result.manual),')
edit(seo,'quality: error?.quality || null,','quality: error?.quality || null,\n        candidate: typeof error?.candidate === "string" ? error.candidate : "",')

patch='server/wordpressPatchV2Hook.js'
edit(patch,'import { deterministicDuplicateTitle } from "./deterministicSeoTitle.js";', 'import { deterministicDuplicateTitle } from "./deterministicSeoTitle.js";\n'+common)
section(patch,'export function collectOutputText(', 'export function deterministicH1Patch(', 'export function collectOutputText(data) { return collectFinalModelText(data); }\nexport function parseStructuredValue(text) { return parseModelValue(text); }\n\n')
edit(patch,'async function aiValue(kind, issue, page) {','async function aiValue(kind, issue, page, signal) {\n  signal?.throwIfAborted();')
edit(patch,'signal: AbortSignal.timeout(75_000),','signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),')
edit(patch,'Restituisci soltanto il valore richiesto dallo schema JSON e non inventare fatti.',r'Restituisci soltanto {\"value\":\"contenuto HTML finale\"}, un oggetto JSON con una sola proprietà stringa. Non aggiungere spiegazioni e non inventare fatti.')
edit(patch,'if (!response.ok) throw new Error(data?.error?.message || `OpenAI ha restituito HTTP ${response.status}`);','if (!response.ok) throw Object.assign(new Error(data?.error?.message || `OpenAI ha restituito HTTP ${response.status}`), { status: response.status });')
edit(patch,'  if (data.status !== "completed" || data.error || data.incomplete_details) throw new Error("OpenAI non ha completato integralmente la generazione della patch.");','  assertCompletedModelResponse(data);')
section(patch,'async function aiValueWithQuality(', 'const canUseDuplicateTitleFallback', '''async function aiValueWithQuality(kind, issue, page, signal) {
  let feedback = String(issue?.remediationFeedback || "");
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const value = await aiValue(kind, { ...issue, remediationFeedback: feedback }, page, signal);
      const quality = validateSeoSuggestion(qualityKind(kind), value, page);
      if (!quality.publishable) throw Object.assign(new Error(`Proposta AI non pubblicabile automaticamente: ${quality.errors.join(" ")}`), { code: "EDITORIAL_REVIEW_REQUIRED", quality, candidate: value });
      return { value, quality };
    } catch (error) {
      lastError = error;
      if (!canRetryGeneration(error)) throw error;
      feedback = error?.quality?.errors?.join(" ") || 'Restituisci solo JSON completo: {"value":"contenuto finale"}. Non usare prosa fuori dal JSON.';
    }
  }
  throw lastError;
}

''')
edit(patch,'if (kind === "title" && !process.env.OPENAI_API_KEY)','if (kind === "title" && !process.env.OPENAI_API_KEY && !Object.hasOwn(body, "manualValue"))')
edit(patch,'  let generated;\n  try {\n    generated = await aiValueWithQuality(kind, issue, page);','''  const manual = Object.hasOwn(body, "manualValue");
  const generationSignal = manual ? undefined : AbortSignal.timeout(95_000);
  let generated;
  try {
    if (manual) {
      aiContext(page, kind);
      if (typeof body.manualValue !== "string" || !body.manualValue.trim()) throw Object.assign(new Error("Inserisci una proposta testuale non vuota."), { code: "EDITORIAL_REVIEW_REQUIRED" });
      const value = body.manualValue.trim();
      const quality = validateSeoSuggestion(qualityKind(kind), value, page);
      if (!quality.publishable) throw Object.assign(new Error(`Proposta da rivedere: ${quality.errors.join(" ")}`), { code: "EDITORIAL_REVIEW_REQUIRED", quality, candidate: value });
      generated = { value, quality: { ...quality, source: "user-reviewed" } };
    } else generated = await aiValueWithQuality(kind, issue, page, generationSignal);''')
edit(patch,'if (kind === "title" && canUseDuplicateTitleFallback(error))','if (!manual && kind === "title" && canUseDuplicateTitleFallback(error))')
edit(patch,'      if (generatedWords < targetWords) {','      if (generatedWords < targetWords && !manual) {',1)
edit(patch,'        }, page);\n        value = generated.value;','        }, page, generationSignal);\n        value = generated.value;')
edit(patch,'throw new Error(`La patch di contenuto è ancora troppo breve (${generatedWords} parole). Target minimo sicuro: ${targetWords}. Nessuna anteprima applicabile è stata creata.`);','throw Object.assign(new Error(`La patch di contenuto è ancora troppo breve (${generatedWords} parole). Target minimo sicuro: ${targetWords}. Nessuna anteprima applicabile è stata creata.`), { code: "EDITORIAL_REVIEW_REQUIRED", candidate: value });')
edit(patch,'throw new Error("La patch è più corta del contenuto originale. Nessuna anteprima applicabile è stata creata.");','throw Object.assign(new Error("La patch è più corta del contenuto originale. Nessuna anteprima applicabile è stata creata."), { code: "EDITORIAL_REVIEW_REQUIRED", candidate: value });')
edit(patch,'return { changes: { [key]: value }, deterministic: false, quality };','return { changes: { [key]: value }, deterministic: false, manual, quality };')
edit(patch,'quality: error?.quality || null,','quality: error?.quality || null,\n        candidate: typeof error?.candidate === "string" ? error.candidate : "",')

quality='src/editorialQuality.js'
edit(quality,'import { SEO_TEXT_LIMITS','import { contentSafetyErrors } from "./editorialContentSafety.js";\nimport { SEO_TEXT_LIMITS')
edit(quality,'  if (suspiciousRawExcerpt(value)) errors.push("Il testo contiene un estratto grezzo, markup o un segnale di troncamento.");',r'''  if (normalizedKind === "content") {
    errors.push(...contentSafetyErrors(value, page.content));
    if (/lorem ipsum|\[\.\.\.|continua a leggere|read more/i.test(String(value || ""))) errors.push("Il contenuto contiene segnaposto o un estratto troncato.");
  } else if (suspiciousRawExcerpt(value)) errors.push("Il testo contiene un estratto grezzo, markup o un segnale di troncamento.");''')
edit(quality,'  if (repeats.length) errors.push(`Il testo ripete sequenze già usate: ${repeats.slice(0, 2).join(" / ")}.`);','''  const previousRepeats = normalizedKind === "content" ? repeatedNgrams(page.content) : [];
  const newRepeats = repeats.filter(gram => !previousRepeats.includes(gram));
  if (newRepeats.length) errors.push(`Il testo ripete sequenze già usate: ${newRepeats.slice(0, 2).join(" / ")}.`);''')

link='server/linkEvidenceHook.js'
edit(link,'import { pinnedHttpsFetch }','import { matchBrokenLinkHref, singleAnchorHref } from "../src/brokenLinkHref.js";\nimport { pinnedHttpsFetch }')
edit(link,r'  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;',r'''  const markup = String(html || "").replace(/<!--[\s\S]*?-->|<(script|style|template|textarea|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const anchorPattern = /<a\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/a\s*>/gi;''')
edit(link,'anchorPattern.exec(String(html || ""))','anchorPattern.exec(markup)')
section(link,'    const hrefMatch =','    occurrenceCount +=','''    const rawHref = singleAnchorHref(attrs);
    const resolved = normalizedHttpUrl(rawHref, source);
    if (!resolved || (resolved !== target && !matchBrokenLinkHref(resolved, target))) continue;
''')
edit(link,'    truncated: occurrenceCount > matches.length || scanned >= MAX_ANCHORS,','    truncated: occurrenceCount > matches.length || scanned >= MAX_ANCHORS,\n    scanComplete: scanned < MAX_ANCHORS,')
edit(link,'        accept: "text/html,application/xhtml+xml",','        accept: "text/html,application/xhtml+xml",\n        "cache-control": "no-cache, no-store",\n        pragma: "no-cache",')
edit(link,'export async function readLinkEvidencePage',r'''export function assessLinkEvidenceHtml(html, source, finalUrl, evidence) {
  const comparable = value => { const url = new URL(value); url.pathname = url.pathname.replace(/\/+$/, "") || "/"; return url.href; };
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] || "";
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || "";
  const readable = cleanAnchorText(body);
  return evidence.scanComplete === true && comparable(finalUrl) === comparable(source) && /<\/html\s*>/i.test(html) && readable.length >= 80 &&
    !/captcha|verify you are human|access denied|just a moment|checking your browser|login|log in|sign in/i.test(`${title} ${readable}`);
}

export async function readLinkEvidencePage''')
edit(link,'  return {\n    ok: true,\n    readOnly: true,\n    sourceUrl: finalUrl,','''  const evidence = extractLinkEvidence(html, finalUrl, target);
  return {
    ok: true, readOnly: true,
    checkedAt: new Date().toISOString(), requestedSourceUrl: source,
    verificationSafe: assessLinkEvidenceHtml(html, source, finalUrl, evidence),
    sourceUrl: finalUrl,''')
edit(link,'    ...extractLinkEvidence(html, finalUrl, target),','    ...evidence,')

ui='src/WordPressLiveRemediationControlV2.jsx'
p=Path(ui);p.write_text('import ManualRemediationProposal from "./ManualRemediationProposal.jsx";\n'+p.read_text())
edit(ui,'async function generateCorePatch(kind, issue, entity, targetUrl, contentOverride, remediationMeasurement) {','async function generateCorePatch(kind, issue, entity, targetUrl, contentOverride, remediationMeasurement, manualValue) {')
edit(ui,'      topic: `Remediation WordPress ${kind}`,','      ...(manualValue !== undefined ? { manualValue } : {}),\n      topic: `Remediation WordPress ${kind}`,')
edit(ui,'    error.code = data.code || "GENERATION_FAILED";','    error.code = data.code || "GENERATION_FAILED";\n    error.quality = data.quality || null;\n    error.candidate = data.candidate || "";')
edit(ui,'async function generateSeoValue(kind, issue, entity, targetUrl) {','async function generateSeoValue(kind, issue, entity, targetUrl, manualValue) {')
edit(ui,'JSON.stringify({ kind, issue, page: pageContext(entity, targetUrl) })','JSON.stringify({ kind, issue, page: pageContext(entity, targetUrl), ...(manualValue !== undefined ? { manualValue } : {}) })')
edit(ui,'    error.quality = data.quality || null;\n    throw error;','    error.quality = data.quality || null;\n    error.candidate = data.candidate || "";\n    throw error;')
edit(ui,'    const generated = await generateCorePatch("content", issue, entity, targetUrl, previous, measurement);','''    let generated;
    try { generated = await generateCorePatch("content", issue, entity, targetUrl, previous, measurement, options.manualValue); }
    catch (error) { error.manualOriginal = previous; error.contentWidgetId = selected.id; throw error; }''')
edit(ui,'targetUrl, undefined, kind === "content" ? contentMeasurement(ownership.frontend, coreContent) : undefined);','targetUrl, undefined, kind === "content" ? contentMeasurement(ownership.frontend, coreContent) : undefined, options.manualValue);')
edit(ui,'generateCorePatch(kind, issue, entity, targetUrl);','generateCorePatch(kind, issue, entity, targetUrl, undefined, undefined, options.manualValue);')
edit(ui,'generateCorePatch("excerpt", issue, entity, targetUrl);','generateCorePatch("excerpt", issue, entity, targetUrl, undefined, undefined, options.manualValue);')
for kind in ['seo_title','meta_description']:
    edit(ui,f'generateSeoValue("{kind}", issue, entity, targetUrl);',f'generateSeoValue("{kind}", issue, entity, targetUrl, options.manualValue);')
edit(ui,'async function verifyFrontend(','''async function inspectLinkEvidence(sourceUrl, targetUrl) {
  const response = await apiFetch("/api/frontend/link-evidence", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ sourceUrl, targetUrl }), cache: "no-store",
  });
  const evidence = await response.json();
  if (!response.ok || evidence.ok !== true) throw Object.assign(new Error(evidence.error || "Verifica attuale del link non disponibile."), { code: "LINK_EVIDENCE_UNAVAILABLE" });
  return evidence;
}

async function verifyFrontend(''')
edit(ui,'    const elementor = prepareElementorBrokenExternalLink(elementorRaw, brokenUrl);','''    const elementor = prepareElementorBrokenExternalLink(elementorRaw, brokenUrl);
    const evidence = options.linkEvidence;
    if (evidence && (evidence.targetUrl !== brokenUrl || evidence.requestedSourceUrl !== new URL(targetUrl).href)) throw ownershipUndetermined("external_link", "L’evidenza appartiene a una pagina o destinazione diversa: ricontrolla questo singolo problema.");
    const localAbsent = elementor.state === "valid" ? elementor.count === 0 : elementor.state === "absent" && typeof entity?.content?.raw === "string" && removeExactAnchor(entity.content.raw, brokenUrl, "unlink-preserve-text").count === 0;
    if (localAbsent && evidence?.verificationSafe === true && evidence?.scanComplete === true && evidence?.occurrenceCount === 0) return { alreadyResolved: true, linkResolution: "absent-confirmed", reason: "Link non più presente nel documento WordPress e nell’HTML pubblico ricontrollato. Nessuna modifica necessaria. Aggiorna l’audit per riallineare l’elenco dei problemi." };
    if (evidence && (evidence.verificationSafe !== true || evidence.occurrenceCount !== 1)) throw ownershipUndetermined("external_link", "La verifica attuale non conferma una singola occorrenza pubblica modificabile. Rileggi la pagina prima di scrivere.");''')
for owner in ['elementor','core']:
    edit(ui,f'action: "unlink-preserve-text",\n          anchorText: {owner}.',f'action: {owner}.action,\n          anchorText: {owner}.')
edit(ui,'          contentWidgetId: String(explicitItem?.contentWidgetId || ""),','''          contentWidgetId: String(explicitItem?.contentWidgetId || ""),
          manualValue: explicitItem?.manualValue,
          linkEvidence: kind === "external_link" ? await inspectLinkEvidence(targetUrl, brokenExternalTarget(currentIssue)) : undefined,''')
edit(ui,'reason: plan.reason, contextSnapshot','reason: plan.reason, linkResolution: plan.linkResolution, contextSnapshot')
edit(ui,'quality: error?.quality || null });','quality: error?.quality || null, candidate: error?.candidate || "", manualOriginal: error?.manualOriginal || "", manualValue: explicitItem?.manualValue, contentWidgetId: error?.contentWidgetId || explicitItem?.contentWidgetId || "" });')
edit(ui,'className={`wp-live-preview-row ${item.status}`}','className={`wp-live-preview-row ${item.status}`} data-broken-target={brokenExternalTarget(item.issue)} data-link-resolution={item.linkResolution || ""}')
edit(ui,'          {item.status === "selection_required" &&','''          {["generation_error", "quality_error", "timeout_error"].includes(item.status) && ["title", "meta_description", "content", "excerpt"].includes(classifyIssue(item.issue)) && <ManualRemediationProposal item={item} kind={classifyIssue(item.issue)} disabled={running || Boolean(applyingId)} onPrepare={(manualValue) => prepare(false, { ...item, manualValue })} />}
          {item.status === "resolved" && <div className="wp-live-guidance-actions"><button type="button" className="secondary" disabled={running || Boolean(applyingId)} onClick={() => prepare(false, item)}>Ricontrolla questo problema</button><button type="button" className="secondary" onClick={() => navigatePage("Audit SEO")}>Aggiorna audit</button><button type="button" className="secondary" onClick={() => navigatePage("Correzioni")}>Verifica nello storico</button></div>}
          {item.status === "selection_required" &&''')
edit(ui,'  if (/EDITORIAL_REVIEW_REQUIRED|SEO_TEXT_LIMIT_EXCEEDED/.test(code))','  if (/AI_OUTPUT_|AI_INVALID_RESPONSE|AI_PROVIDER_ERROR|AI_REFUSAL/.test(code)) return { status: "generation_error", category: "generation", reason: message };\n  if (/EDITORIAL_REVIEW_REQUIRED|SEO_TEXT_LIMIT_EXCEEDED/.test(code))')
p=Path('src/WordPressLiveRemediationControlV2.css');p.write_text(p.read_text()+'''
.manual-remediation-proposal { display:grid;gap:12px;margin-top:16px;padding:18px;border:1px solid #ccdbee;border-radius:14px;background:#f7fbff; }
.manual-remediation-proposal h4,.manual-remediation-proposal p { margin:0; }
.manual-remediation-proposal label { display:grid;gap:8px; }
.manual-remediation-proposal textarea { box-sizing:border-box;width:100%;min-width:0;min-height:140px;resize:vertical;font:inherit;line-height:1.6;padding:12px; }
.manual-remediation-proposal button { justify-self:start; }
''')

ux='src/ExternalLinkDestinationUx.js'
edit(ux,'const linkEvidenceCache = new Map();','const linkEvidenceCache = new Map();\nlet evidenceRequest = 0;')
edit(ux,'  if (linkEvidenceCache.has(key)) return linkEvidenceCache.get(key);','  const cached = linkEvidenceCache.get(key);\n  if (cached && Date.now() - cached.at < 15000) return cached.promise;')
edit(ux,'  linkEvidenceCache.set(key, promise);','  linkEvidenceCache.set(key, { promise, at: Date.now() });')
edit(ux,'  block.dataset.loaded = "loading";','  block.dataset.loaded = "loading";\n  const requestId = String(++evidenceRequest);\n  block.dataset.requestId = requestId;')
edit(ux,'block.dataset.identity !== identity) return;','block.dataset.identity !== identity || block.dataset.requestId !== requestId) return;')
edit(ux,'  const verifiedAnchor = String(evidence?.anchorText || issue.anchorText || "").trim();','  const verifiedAnchor = String(evidence?.error ? issue.anchorText || "" : evidence?.anchorText || "").trim();')
edit(ux,'    : occurrences === 1','    : evidence?.verificationSafe === false || evidence?.truncated === true ? "Verifica incompleta: non è possibile confermare l’assenza o correggere il link con questa lettura."\n    : occurrences === 1')
edit(ux,'        : "Il link non è più presente nel frontend corrente: riprepara il problema per aggiornare lo stato.";','        : card.dataset.linkResolution === "absent-confirmed" ? "Link non più presente nelle sorgenti ricontrollate. Nessuna correzione necessaria: aggiorna l’audit." : "Nessuna occorrenza in questa lettura. Premi Prepara solo questo problema per verificare anche WordPress e aggiornare lo stato.";')
edit(ux,'  if (/template condiviso|ownership frontend non determinabile/i.test(text)) {','  if (card.dataset.linkResolution !== "absent-confirmed" && /template condiviso|ownership frontend non determinabile/i.test(text)) {')
edit(ux,'  block.dataset.loaded = "1";','  retry.hidden = card.dataset.linkResolution === "absent-confirmed";\n  block.dataset.loaded = "1";')
edit(ux,'    const issue = matches[Math.min(offset, matches.length - 1)];','    const explicitTarget = safeHttpUrl(card.dataset.brokenTarget || "");\n    const issue = explicitTarget ? matches.find(item => safeHttpUrl(item.targetUrl) === explicitTarget) : matches[Math.min(offset, matches.length - 1)];\n    if (!issue) continue;')
resolved='src/ResolvedExternalLinkStateUx.js'
edit(resolved,'  externalLinkEvidenceState,\n','')
edit(resolved,'  status.textContent = STALE_MESSAGE;','  if (status.textContent !== STALE_MESSAGE) status.textContent = STALE_MESSAGE;')
edit(resolved,'  staleBadge(card).textContent = "✓ Link già assente dal frontend: nessuna modifica verrà proposta o applicata.";','  const badge = staleBadge(card), message = "✓ Link già assente dalle sorgenti verificate: nessuna modifica verrà proposta o applicata.";\n  if (badge.textContent !== message) badge.textContent = message;')
edit(resolved,'    const state = externalLinkEvidenceState(status.textContent, block.dataset.loaded);','    const state = card.dataset.linkResolution === "absent-confirmed" ? "resolved-stale" : "active";')
p=Path('src/ResolvedExternalLinkStateUx.css');p.write_text(p.read_text()+'\n.wp-live-link-evidence-actions button[hidden] { display:none !important; }\n')

page='src/ProblemResolutionPage.jsx'
p=Path(page);p.write_text('import { resolutionPath, correctionMatchesProblem } from "./resolutionPath.js";\n'+p.read_text())
section(page,'const sameProblemCorrection =','const matchesFocus','const sameProblemCorrection = correctionMatchesProblem;\n\n')
edit(page,'  normalizeHttpUrl,\n','')
edit(page,'  RefreshCw,\n','')
edit(page,'  const openCorrectionHistory = () => {','  const path = resolutionPath(problem, latestCorrection);\n\n  const openCorrectionHistory = () => {')
edit(page,'if (!latestCorrection?.id) {\n      openIntervention();','if (!latestCorrection?.id) {\n      navigatePage("Audit SEO");')
edit(page,'              {problem.fields.length > 0','              <div className="problem-resolution-guidance"><h3>{path.title}</h3><p>{path.instructions}</p></div>\n              {problem.fields.length > 0')
section(page,'          {problem.problemState === "resolved" ? (','          <button className="secondary" type="button" onClick={askAgent}', '''          <button className="primary" type="button" disabled={working} onClick={() => {
            if (path.action === "history") openCorrectionHistory();
            else if (path.action === "verify") verifyNow();
            else if (path.action === "agent") askAgent();
            else if (path.action === "manual" && href) window.open(href, "_blank", "noopener,noreferrer");
            else if (path.action === "audit") navigatePage("Audit SEO");
            else openIntervention();
          }}>{working ? "Verifica…" : path.label}</button>

''')
nav='src/AutomaticProposalNavigation.js';p=Path(nav);p.write_text('import { shouldOpenAutomaticProposal } from "./resolutionPath.js";\n'+p.read_text())
edit(nav,'const automatic = focus.correctability === "automatic";','const automatic = shouldOpenAutomaticProposal(problem);')
for name,old in [('ProblemsWorkspace.jsx','problem.correctability === "automatic" ? "Apri proposta" : "Apri risoluzione"'),('CardWorkspaceLayer.jsx','item.problem?.correctability === "automatic" ? "Apri proposta" : "Apri risoluzione"')]:
    p=Path('src')/name;p.write_text('import { problemEntryLabel } from "./resolutionPath.js";\n'+p.read_text());edit(str(p),old,'problemEntryLabel(item.problem)' if name.startswith('Card') else 'problemEntryLabel(problem)')
edit('src/correctionPresentation.js','Riprova “Prepara solo questo problema”. Per i title duplicati SeoGrow usa anche un fallback deterministico sicuro quando disponibile.','Usa “Rivedi o scrivi la proposta”: correggi il testo, poi premi “Valida e prepara anteprima”. I controlli qualità restano obbligatori.')
edit('src/correctionPresentation.js','Controlla la causa indicata e riprova la preparazione.','Controlla la causa oppure usa il campo di revisione per scrivere una proposta e validarla, senza pubblicazione automatica.')

edit('src/ProblemResolutionPage.test.js','  assert.match(page, /Prepara correzione/);',r'  assert.match(page, /resolutionPath\(problem, latestCorrection\)/);'+'\n  assert.match(page, /path\\.label/);')
edit('src/wordpressRemediationV2.test.js','  assert.match(patchServer, /data\\.status !== "completed"/);\n  assert.match(patchServer, /data\\.incomplete_details/);\n  assert.match(patchServer, /typeof parsed\\.value !== "string"/);','  assert.match(patchServer, /assertCompletedModelResponse\\(data\\)/);\n  assert.match(patchServer, /parseModelValue\\(text\\)/);')
section('src/remediationFlowRegressions.test.js',"test('adding final punctuation", "\ntest('server rejects", '''test('deterministic metadata uses complete sentences without clipping or fabricated punctuation', () => {
  assert.equal(deterministicMetaDescription({content:sentence}), sentence);
  assert.ok(seoCharacterCount(sentence) <= 160);
  for (const size of [159,160,161,170,240]) assert.equal(deterministicMetaDescription({content:'Parole '.repeat(50).slice(0,size)}), '');
  assert.equal(validateSeoSuggestion('meta_description','<b>'+sentence+'</b>').publishable,false);
});
''')
edit("src/remediationUnresolvedCoverage.test.js", r"requestValue\(kind, issue, context, attempt > 0, qualityFeedback\)", r"requestValue\(kind, issue, context, attempt > 0, qualityFeedback, generationSignal\)")
print('Scoped remediation source edits completed.')
