import { runFormMatrix } from "./qa-form-matrix.mjs";
import { runBrowserMatrix } from "./qa-browser-matrix.mjs";
import { access, rm, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const appUrl = process.argv[2] || "http://127.0.0.1:5176/";
const debuggingPort = 10_000 + (process.pid % 40_000);
const profile = `/tmp/seogrow-browser-smoke-${process.pid}`;

const output = process.env.QA_OUTPUT || ".qa-runtime/automation/browser";
await mkdir(output, { recursive: true });
const browserReport = { runId: process.env.QA_RUN_ID, commit: process.env.QA_COMMIT, mode: process.env.QA_MODE || "release", ok: false, scenarios: [], startedAt: new Date().toISOString() };
async function record(id, action) {
  const start = Date.now();
  try { await action(); console.log(id + ": PASS"); browserReport.scenarios.push({ id, status: "PASS", durationMs: Date.now() - start }); }
  catch (error) { browserReport.scenarios.push({ id, status: "FAIL", durationMs: Date.now() - start, error: error.message }); throw error; }
}
async function screenshot(name) {
  const result = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(output + "/" + name + ".png", Buffer.from(result.data, "base64"));
}
async function reload() {
  await evaluate("window.__qaOldDocument = true");
  await command("Page.reload", {});
  await waitFor("!window.__qaOldDocument && document.readyState === 'complete' && document.querySelector('.guided-nav') && document.querySelector('.task-filters')", "new document hydrated after reload");
}

const candidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

let chromeBin = "";
for (const candidate of candidates) {
  try {
    await access(candidate);
    chromeBin = candidate;
    break;
  } catch {
    // Prova il prossimo binario noto del runner.
  }
}
if (!chromeBin) throw new Error("Chrome/Chromium non disponibile sul runner.");

const chrome = spawn(chromeBin, [
  "--headless",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-address=127.0.0.1",
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });

let chromeLog = "";
chrome.stderr.on("data", (chunk) => { chromeLog += String(chunk); });
chrome.stdout.on("data", (chunk) => { chromeLog += String(chunk); });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, timeoutMs = 30_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome è terminato prima di esporre DevTools (exit ${chrome.exitCode}). ${chromeLog.slice(-1200)}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Chrome DevTools non disponibile dopo ${timeoutMs} ms: ${lastError?.message || "timeout"}. ${chromeLog.slice(-1200)}`);
}

let socket = null;
let version = null;
let messageId = 0;
const pending = new Map();
const browserEvents = [];

const command = (method, params = {}) => new Promise((resolve, reject) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    reject(new Error("Connessione CDP non disponibile."));
    return;
  }
  const id = ++messageId;
  const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 15000);
  pending.set(id, {
    resolve: value => { clearTimeout(timer); resolve(value); },
    reject: error => { clearTimeout(timer); reject(error); },
  });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Errore JavaScript browser.");
  return result.result?.value;
};

async function waitFor(expression, label, timeoutMs = 12_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(`(async () => Boolean(await (${expression})))()`)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(120);
  }
  const body = await evaluate("document.body?.innerText || ''").catch(() => "");
  throw new Error(`UI non pronta: ${label}. ${lastError?.message || ""} Testo corrente: ${String(body).slice(0, 1200)}`);
}

const clickSidebar = async (label) => {
  // On mobile, use the menu entry point before selecting a destination. A DOM
  // click on an off-screen item otherwise hides navigation accessibility bugs.
  if (await evaluate("innerWidth <= 760 && !document.querySelector('.sidebar')?.classList.contains('open')")) {
    await evaluate("document.querySelector('[aria-label=\"Apri menu\"]').click()");
    await waitFor("document.querySelector('.sidebar.open')?.getBoundingClientRect().left >= -1", "mobile menu fully open");
  }
  const clicked = await evaluate(`(() => {
    const matches = (root) => [...(root?.querySelectorAll('button') || [])]
      .find((node) => String(node.textContent || '').trim().includes(${JSON.stringify(label)}));
    const guided = document.querySelector('.guided-nav');
    const button = (guided && matches(guided)) || matches(document.querySelector('.sidebar'));
    if (!button) return false;
    const style = getComputedStyle(button);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Voce sidebar visibile non trovata: ${label}`);
  if (await evaluate("innerWidth <= 760")) {
    await waitFor("document.querySelector('.sidebar')?.getBoundingClientRect().right <= 0", "mobile navigation closes after selection");
  }
};

const responsiveFixture = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  #desktop-only, #tablet-only, #mobile-only { display: none; }
  @media (min-width: 1025px) { #desktop-only { display: block; } }
  @media (min-width: 768px) and (max-width: 1024px) { #tablet-only { display: block; } }
  @media (max-width: 767px) { #mobile-only { display: block; } }
  .stylesheet-hidden { display: none; }
</style>
<main>
  <div id="desktop-only">desktop</div>
  <div id="tablet-only">tablet</div>
  <div id="mobile-only">mobile</div>
  <div id="stylesheet-hidden" class="stylesheet-hidden">hidden by stylesheet</div>
  <div id="runtime-target"></div>
</main>
<script>
  requestAnimationFrame(() => {
    const node = document.createElement('span');
    node.id = 'runtime-visible';
    node.textContent = 'runtime visible';
    document.querySelector('#runtime-target').append(node);
    document.body.dataset.visibilityFixtureReady = 'true';
  });
</script>`;

const assertViewportVisibility = async (width, expectedId, label) => {
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await command("Page.navigate", { url: `data:text/html;charset=utf-8,${encodeURIComponent(responsiveFixture)}` });
  await waitFor("document.body?.dataset.visibilityFixtureReady === 'true'", `fixture responsive ${label}`);
  const state = await evaluate(`(() => {
    const visible = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0 && rect.width > 0 && rect.height > 0;
    };
    return {
      desktop: visible('#desktop-only'),
      tablet: visible('#tablet-only'),
      mobile: visible('#mobile-only'),
      stylesheetHidden: visible('#stylesheet-hidden'),
      runtimeVisible: visible('#runtime-visible'),
    };
  })()`);
  const expected = { desktop: false, tablet: false, mobile: false };
  expected[expectedId] = true;
  if (
    state.desktop !== expected.desktop ||
    state.tablet !== expected.tablet ||
    state.mobile !== expected.mobile ||
    state.stylesheetHidden !== false ||
    state.runtimeVisible !== true
  ) {
    throw new Error(`Visibilità browser ${label} non coerente: ${JSON.stringify(state)}`);
  }
};

try {
  version = await waitForJson(`http://127.0.0.1:${debuggingPort}/json/version`);
  if (!version.Browser) throw new Error("Chrome DevTools non ha restituito la versione browser.");

  const targetResponse = await fetch(
    `http://127.0.0.1:${debuggingPort}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" },
  );
  if (!targetResponse.ok) throw new Error(`Impossibile creare la pagina CDP: HTTP ${targetResponse.status}`);
  const target = await targetResponse.json();
  if (!target.webSocketDebuggerUrl) throw new Error("WebSocket CDP mancante.");

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout connessione CDP.")), 15_000);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Connessione CDP fallita.")); }, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (["Runtime.exceptionThrown", "Runtime.consoleAPICalled", "Network.loadingFailed"].includes(message.method)) {
      browserEvents.push(message);
      if (browserEvents.length > 500) browserEvents.shift();
    }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || "Errore CDP"));
    else resolve(message.result || {});
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");

  // Il target parte da about:blank: così lo script di inizializzazione viene eseguito
  // prima del primo mount React dell'app, senza che lo stato di esempio possa sovrascriverlo.
  await command("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      if (location.origin !== ${JSON.stringify(new URL(appUrl).origin)}) return;
      const client = { id: 9001, name: 'Browser QA', url: 'https://example.com/' };
      const audit = {
        url: 'https://example.com/pagina-test/',
        analyzedAt: '2026-09-05T18:50:00.000Z',
        score: 88,
        issues: [{
          type: 'h1',
          label: '0 H1',
          detail: 'Pagina di test senza H1 rilevato.',
          severity: 'alta',
          targetUrl: 'https://example.com/pagina-test/'
        }]
      };
      const realFetch = window.fetch.bind(window);
      window.fetch = (input, options) => {
        const requestUrl = new URL(typeof input === 'string' ? input : input.url, location.href);
        const pathname = requestUrl.pathname;
        const method = (options?.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
        if (requestUrl.origin !== location.origin) return Promise.reject(new Error('QA blocked external request'));
        const fixture = window.__qaFormMocks?.[pathname];
        if (fixture && method === 'POST') {
          (window.__qaFormRequests ||= []).push({path:pathname, body:JSON.parse(options?.body || '{}')});
          return Promise.resolve(new Response(JSON.stringify(fixture.body), {status:fixture.status, headers:{'content-type':'application/json'}}));
        }
        if (pathname === '/api/openai/status') return Promise.resolve(new Response(JSON.stringify({configured:true}), {headers:{'content-type':'application/json'}}));
        if (pathname === '/api/dataforseo/status') return Promise.resolve(new Response(JSON.stringify({configured:true,maxSerpCost:0.1}), {headers:{'content-type':'application/json'}}));
        if (pathname === '/api/google/status') return Promise.resolve(new Response(JSON.stringify({ configured: true, connected: true }), { headers: { 'content-type': 'application/json' } }));
        if (pathname === '/api/google/properties' && window.__qaGoogleFailure) {
          window.__qaFailureRequests = (window.__qaFailureRequests || 0) + 1;
          const failure = window.__qaGoogleFailure;
          if (failure === 'offline') return Promise.reject(new TypeError('QA offline'));
          if (failure === 'timeout') return Promise.reject(new DOMException('QA timeout', 'TimeoutError'));
          return Promise.resolve(new Response(failure === 'invalid' ? '{' : failure === 'empty' ? '' : JSON.stringify({ error: 'QA ' + failure }), { status: ['400', '500'].includes(failure) ? Number(failure) : 200, headers: { 'content-type': 'application/json' } }));
        }
        if (pathname === '/api/google/properties') return Promise.resolve(new Response(JSON.stringify({ properties: Array.from({ length: 19 }, (_, i) => ({ url: 'https://qa-' + i + '.example/' })) }), { headers: { 'content-type': 'application/json' } }));
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.origin !== location.origin || method !== 'GET') return Promise.reject(new Error('QA blocked non-read request'));
        return realFetch(input, options);
      };
      if (!sessionStorage.getItem('opportunity-qa-seeded')) {
        localStorage.setItem('seogrow-gsc-v1', JSON.stringify({ [client.id]: {
          totals: { clicks: 2, impressions: 100, ctr: 2, position: 8 },
          graph: [], countries: [], devices: [], imports: [],
          queries: [{ dimension: 'yoga', position: 8, impressions: 100, clicks: 2, ctr: 2 }],
          pages: [], queryPages: [{ query: 'yoga', pages: ['https://example.com/yoga/'] }],
          dateFrom: '2026-06-07', dateTo: '2026-09-05', importedAt: '2026-09-08T08:00:00Z'
        } }));
        localStorage.setItem('seogrow-tasks-v2', '[]');
        sessionStorage.setItem('opportunity-qa-seeded', 'true');
      }
      localStorage.setItem('seogrow-clients', JSON.stringify([client]));
      localStorage.setItem('seogrow-selected-client-v1', JSON.stringify(client.id));
      localStorage.setItem('seogrow-selected-page-v1', JSON.stringify('Audit SEO'));
      localStorage.setItem('seogrow-page-audit-history-v2', JSON.stringify({ [client.id]: [audit] }));
      localStorage.setItem('seogrow-analyses-v2', JSON.stringify({ [client.id]: [] }));
    })();`,
  });

  await command("Page.navigate", { url: `${appUrl}#Audit%20SEO` });
  await waitFor("document.readyState === 'complete' && document.querySelector('#root')", "root React con progetto QA");
  await waitFor("document.querySelector('.guided-nav')", "navigazione guidata visibile");
  await waitFor(
    "document.querySelector('.remediation-host') && document.querySelector('.audit-issue-select')",
    "RemediationHost nativo in Audit SEO",
  );
  const remediationText = await evaluate("document.querySelector('.remediation-host')?.textContent || ''");
  if (!/Correzione controllata/i.test(remediationText) || !/Problema da correggere/i.test(remediationText)) {
    throw new Error(`Host remediation incompleto: ${remediationText}`);
  }

  const activeProject = await evaluate("document.body?.innerText || ''");
  if (!/Browser QA/.test(activeProject) || /Progetto di esempio/.test(activeProject)) {
    throw new Error("Il browser smoke non ha inizializzato in modo univoco il progetto QA richiesto.");
  }

  await clickSidebar("Correzioni");
  await waitFor("document.querySelector('.corrections-workspace-root')", "workspace Correzioni");
  const correctionsText = await evaluate("document.querySelector('.corrections-workspace-root')?.textContent || ''");
  if (!/Rollback WordPress stale-safe/i.test(correctionsText)) {
    throw new Error(`Workspace Correzioni incompleto: ${correctionsText}`);
  }

  await clickSidebar("Audit SEO");
  await waitFor(
    "document.querySelector('.remediation-host') && document.querySelector('.audit-issue-select')",
    "ritorno ad Audit SEO con RemediationHost",
  );

  // Product features are exercised on an isolated QA profile; no remote audits enabled.
  await clickSidebar("Centro progetto");
  await waitFor("document.querySelector('main h1')?.textContent.includes('Centro progetto')", "Centro progetto");
  await waitFor("document.querySelector('.wizard-steps') && document.querySelector('.report-option')", "wizard e modello report");
  await evaluate("[...document.querySelectorAll('.workspace-tools button')].find(button => button.textContent.startsWith('Comandi')).click()");
  await waitFor("document.querySelector('.command-dialog')?.open", "palette comandi aperta");
  await evaluate("[...document.querySelectorAll('.command-dialog button')].find(button => button.textContent === 'Chiudi').click()");
  await waitFor("!document.querySelector('.command-dialog')?.open", "palette comandi chiusa");
  await clickSidebar("Task");
  await waitFor("document.querySelector('[aria-label=\"Viste salvate task\"]')", "viste task salvabili");
  const viewToolbar = '[aria-label="Viste salvate task"]';
  const setInput = async (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await setInput('.task-filters input', 'yoga');
  await evaluate("(() => { const select = document.querySelector('.task-filters select'); select.value = 'Da fare'; select.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await setInput(viewToolbar + ' input', 'Yoga da fare');
  await evaluate(`document.querySelector(${JSON.stringify(viewToolbar + ' > button')}).click()`);
  await waitFor(`document.querySelector(${JSON.stringify(viewToolbar + ' select')})?.options.length === 2`, "vista salvata");
  const chooseView = () => evaluate(`(() => { const select = document.querySelector(${JSON.stringify(viewToolbar + ' select')}); select.value = select.options[1].value; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await setInput('.task-filters input', '');
  await chooseView();
  await waitFor(`document.querySelector(${JSON.stringify(viewToolbar + ' select')})?.selectedOptions[0]?.textContent === 'Yoga da fare' && document.querySelector('.task-filters input').value === 'yoga' && document.querySelector('.task-filters select').value === 'Da fare'`, "vista selezionata e filtri ripristinati");
  await setInput(viewToolbar + ' input', 'Nome diverso');
  await waitFor(`document.querySelector(${JSON.stringify(viewToolbar + ' select')})?.selectedOptions[0]?.textContent === 'Yoga da fare'`, "selezione conservata dopo render estraneo ai filtri");
  await setInput('.task-filters input', 'altro');
  await waitFor(`document.querySelector(${JSON.stringify(viewToolbar + ' select')})?.value === ''`, "modifica manuale ricerca azzera vista");
  await chooseView();
  await evaluate("(() => { const select = document.querySelector('.task-filters select'); select.value = 'Tutti'; select.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await waitFor(`document.querySelector(${JSON.stringify(viewToolbar + ' select')})?.value === ''`, "modifica manuale stato azzera vista");
  await clickSidebar("Piano editoriale");
  await waitFor("document.querySelectorAll('.calendar-day').length >= 28", "calendario mensile");
  await clickSidebar("Audit SEO");
  await waitFor("document.querySelector('.remediation-host') && document.querySelector('.audit-issue-select')", "ritorno al controllo Audit SEO");

  await clickSidebar("Integrazioni");
  await waitFor("[...document.querySelectorAll('button')].some(button => button.textContent.includes('Carica proprietà Google'))", "caricamento proprietà disponibile");
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.includes('Carica proprietà Google')).click()");
  await waitFor("document.querySelector('[aria-label=\"Proprietà Search Console\"]')?.options.length === 20", "19 proprietà Google visibili nel selettore");
  const propertyPicker = await evaluate("(() => { const select = document.querySelector('[aria-label=\"Proprietà Search Console\"]'); const rect = select.getBoundingClientRect(); return { width: rect.width, height: rect.height, size: select.size, value: select.value }; })()");
  if (propertyPicker.width < 200 || propertyPicker.height < 100 || propertyPicker.size < 2 || propertyPicker.value !== "") throw new Error(`Selettore proprietà compresso o selezione implicita: ${JSON.stringify(propertyPicker)}`);
  await evaluate("(() => { const select = document.querySelector('[aria-label=\"Proprietà Search Console\"]'); select.value = 'https://qa-18.example/'; select.dispatchEvent(new Event('change', { bubbles: true })); })()");
  await waitFor("[...document.querySelectorAll('button')].some(button => button.textContent.includes('Importa ora via API') && !button.disabled)", "importazione abilitata dopo selezione esplicita");
  await clickSidebar("Audit SEO");
  await waitFor("document.querySelector('.remediation-host') && document.querySelector('.audit-issue-select')", "ritorno dopo test Google simulato");

  // Regression: create -> save -> reload -> open the same persisted task.
  await clickSidebar("Opportunità");
  const opportunityButton = "document.querySelector('.opportunity-table tbody tr button')";
  await waitFor(opportunityButton + "?.textContent.trim() === 'Crea task'", "opportunità yoga senza task");
  await evaluate("(() => { const button = " + opportunityButton + "; button.click(); button.click(); button.click(); })()");
  await waitFor(opportunityButton + "?.textContent.trim() === 'Apri task'", "stato opportunità aggiornato dopo creazione");
  await evaluate(opportunityButton + ".click()");
  await waitFor("document.querySelector('.task-editor')", "apertura task esistente");
  await evaluate("document.querySelector('.task-editor').requestSubmit()");
  await waitFor("!document.querySelector('.task-editor')", "task salvato");
  await waitFor("(async () => { const { workspaceStorage } = await import('/src/workspaceDatabase.js'); return JSON.parse(workspaceStorage.getItem('seogrow-tasks-v2') || '[]').some(task => task.query === 'yoga' && task.userEdited === true); })()", "salvataggio task completato dopo debounce");
  const originalTaskId = await evaluate("(async () => { const { workspaceStorage } = await import('/src/workspaceDatabase.js'); return JSON.parse(workspaceStorage.getItem('seogrow-tasks-v2')).find(task => task.query === 'yoga').id; })()");
  await evaluate("(async () => { const { flushWorkspace } = await import('/src/workspaceDatabase.js'); await flushWorkspace(); })()");
  await reload();
  await clickSidebar("Opportunità");
  await waitFor(opportunityButton + "?.textContent.trim() === 'Apri task'", "dopo reload nessun nuovo Crea task");
  await evaluate(opportunityButton + ".click()");
  await waitFor("document.querySelector('.task-editor')", "task persistito riaperto");
  await evaluate("document.querySelector('[aria-label=\"Chiudi finestra\"]').click()");
  const savedTasks = await evaluate("(async () => { const { workspaceStorage } = await import('/src/workspaceDatabase.js'); return JSON.parse(workspaceStorage.getItem('seogrow-tasks-v2')).filter(task => task.query === 'yoga' && task.sourceClientId === 9001); })()");
  if (savedTasks.length !== 1 || savedTasks[0].id !== originalTaskId || savedTasks[0].sourceUrl !== 'https://example.com/yoga/') throw new Error('Task duplicato o associazione persa dopo reload');
  await clickSidebar("Audit SEO");
  await waitFor("document.querySelector('.remediation-host') && document.querySelector('.audit-issue-select')", "ritorno dopo test persistenza opportunità");

  browserReport.scenarios.push({ id: "EXISTING-REGRESSION", status: "PASS", covers: ["OPPORTUNITY-001", "OPPORTUNITY-002", "OPPORTUNITY-003", "OPPORTUNITY-005", "OPPORTUNITY-006", "VIEWS-001", "GOOGLE-001", "NAV-001"] });
  await runBrowserMatrix({ evaluate, waitFor, command, clickSidebar, reload, record, screenshot, mode: process.env.QA_MODE || "release" });
  await runFormMatrix({ evaluate, waitFor, clickSidebar, reload, record, mode: process.env.QA_MODE || "release" });
  await clickSidebar("Audit SEO");
  await waitFor("document.querySelector('.remediation-host') && document.querySelector('.audit-issue-select')", "audit ready for existing responsive checks");
  await assertViewportVisibility(1440, "desktop", "desktop");
  await assertViewportVisibility(900, "tablet", "tablet");
  await assertViewportVisibility(390, "mobile", "mobile");
  await command("Emulation.clearDeviceMetricsOverride");

  const uncaught = browserEvents.filter(event => event.method === "Runtime.exceptionThrown");
  if (uncaught.length) throw new Error("Uncaught browser exceptions: " + JSON.stringify(uncaught));
  browserReport.ok = true;
  console.log(`Browser smoke OK con ${version.Browser}. Navigazione reale Audit SEO → Correzioni → Audit SEO e visibilità desktop/tablet/mobile verificate.`);
} catch (error) {
  browserReport.error = error.message;
  await screenshot("failure").catch(() => {});
  await writeFile(output + "/failure-dom.txt", await evaluate("document.documentElement.outerHTML").catch(() => "Document unavailable"));
  throw error;
} finally {
  await writeFile(output + "/browser-events.json", JSON.stringify(browserEvents, null, 2));
  await writeFile(output + "/browser-report.json", JSON.stringify(browserReport, null, 2));
  if (socket) {
    try { socket.close(); } catch { /* già chiuso */ }
  }
  for (const { reject } of pending.values()) reject(new Error("Browser smoke terminato."));
  pending.clear();
  if (chrome.exitCode === null) {
    chrome.kill("SIGTERM");
    await sleep(300);
  }
  if (chrome.exitCode === null) chrome.kill("SIGKILL");
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  if (chrome.exitCode && chrome.exitCode !== 0 && !chromeLog.includes("DevTools listening")) {
    console.warn(chromeLog.slice(-1500));
  }
}
