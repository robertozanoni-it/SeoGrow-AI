const STATUS_CLASSES = new Set(["PASS", "FAIL", "MANUAL", "INFO"]);

function panelStyle(rootId, width, maxHeight) {
  const selector = `#${rootId}`;
  return `
${selector} { position:fixed; right:18px; bottom:18px; z-index:2147483000; width:min(${width}px,calc(100vw - 36px)); font:14px/1.35 system-ui,sans-serif; }
${selector} button { cursor:pointer; border:0; border-radius:10px; padding:10px 14px; font-weight:700; }
${selector} .launcher { float:right; background:#111827; color:white; box-shadow:0 8px 30px rgba(0,0,0,.22); }
${selector} .panel { clear:both; margin-top:10px; background:white; color:#111827; border:1px solid #d1d5db; border-radius:14px; box-shadow:0 14px 40px rgba(0,0,0,.22); max-height:${maxHeight}vh; overflow:auto; padding:14px; }
${selector} .row { padding:9px 0; border-bottom:1px solid #e5e7eb; }
${selector} .row:last-child { border-bottom:0; }
${selector} .PASS { color:#166534; } ${selector} .FAIL { color:#b91c1c; } ${selector} .MANUAL { color:#92400e; } ${selector} .INFO { color:#1d4ed8; }
${selector} .actions { display:flex; gap:8px; margin-top:12px; } ${selector} .secondary { background:#e5e7eb; color:#111827; }
`;
}

function appendSummary(panel, report, title, countKeys) {
  const heading = document.createElement("strong");
  heading.textContent = `${title}: ${report.summary.overall}`;
  const counts = document.createElement("div");
  counts.textContent = countKeys.map((key) => `${key} ${report.summary.counts[key] || 0}`).join(" · ");
  panel.append(heading, counts);
}

function appendResults(panel, results) {
  for (const item of results) {
    const row = document.createElement("div");
    row.className = "row";
    const status = document.createElement("strong");
    status.className = STATUS_CLASSES.has(item.status) ? item.status : "INFO";
    status.textContent = String(item.status || "INFO");
    const area = document.createTextNode(` — ${String(item.area || "")}`);
    const detail = document.createElement("small");
    detail.textContent = String(item.detail || "");
    row.append(status, area, document.createElement("br"), detail);
    panel.append(row);
  }
}

function appendActions(panel, report) {
  const actions = document.createElement("div");
  actions.className = "actions";
  const copy = document.createElement("button");
  copy.className = "secondary";
  copy.textContent = "Copia report JSON";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    } catch {
      copy.textContent = "Copia non disponibile";
    }
  });
  const close = document.createElement("button");
  close.className = "secondary";
  close.textContent = "Chiudi";
  close.addEventListener("click", () => panel.remove());
  actions.append(copy, close);
  panel.append(actions);
}

export function installQaPanel({
  rootId,
  conflictingRootId,
  launcherLabel,
  runningLabel,
  title,
  countKeys,
  run,
  width = 520,
  maxHeight = 72,
}) {
  if (document.getElementById(rootId)) return;
  if (conflictingRootId) document.getElementById(conflictingRootId)?.remove();

  const root = document.createElement("div");
  root.id = rootId;
  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.textContent = launcherLabel;
  root.append(launcher);
  document.body.append(root);

  const css = document.createElement("style");
  css.textContent = panelStyle(rootId, width, maxHeight);
  document.head.append(css);

  launcher.addEventListener("click", async () => {
    launcher.disabled = true;
    launcher.textContent = runningLabel;
    root.querySelector(".panel")?.remove();
    try {
      const report = await run();
      const panel = document.createElement("section");
      panel.className = "panel";
      appendSummary(panel, report, title, countKeys);
      appendResults(panel, report.results);
      appendActions(panel, report);
      root.append(panel);
    } finally {
      launcher.disabled = false;
      launcher.textContent = launcherLabel;
    }
  });
}
