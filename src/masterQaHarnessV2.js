import { MANUAL_MASTER_QA_CHECKS, runMasterQa, summarizeMasterQa } from "./masterQaHarness.js";
import { runMasterQaV2AsyncChecks, runMasterQaV2Checks } from "./masterQaV2Checks.js";

export async function runMasterQaV2() {
  const base = await runMasterQa();
  const automaticBase = base.results.filter((item) => item.status !== "MANUAL");
  const extra = [...runMasterQaV2Checks(), ...(await runMasterQaV2AsyncChecks())];
  const manual = MANUAL_MASTER_QA_CHECKS.map((area) => ({
    status: "MANUAL",
    area,
    detail: "Richiede evidenza manuale/ambiente reale; il Master QA non simula un PASS.",
  }));
  const results = [...automaticBase, ...extra, ...manual];
  const report = {
    ...base,
    version: 2,
    results,
    summary: summarizeMasterQa(results),
  };
  window.__seogrowLastMasterQaReport = report;
  return report;
}

const style = `
#seogrow-master-qa-v2 { position:fixed; right:18px; bottom:18px; z-index:2147483000; width:min(560px,calc(100vw - 36px)); font:14px/1.35 system-ui,sans-serif; }
#seogrow-master-qa-v2 button { cursor:pointer; border:0; border-radius:10px; padding:10px 14px; font-weight:700; }
#seogrow-master-qa-v2 .launcher { float:right; background:#111827; color:white; box-shadow:0 8px 30px rgba(0,0,0,.22); }
#seogrow-master-qa-v2 .panel { clear:both; margin-top:10px; background:white; color:#111827; border:1px solid #d1d5db; border-radius:14px; box-shadow:0 14px 40px rgba(0,0,0,.22); max-height:76vh; overflow:auto; padding:14px; }
#seogrow-master-qa-v2 .row { padding:9px 0; border-bottom:1px solid #e5e7eb; }
#seogrow-master-qa-v2 .row:last-child { border-bottom:0; }
#seogrow-master-qa-v2 .PASS { color:#166534; } #seogrow-master-qa-v2 .FAIL { color:#b91c1c; } #seogrow-master-qa-v2 .MANUAL { color:#92400e; } #seogrow-master-qa-v2 .INFO { color:#1d4ed8; }
#seogrow-master-qa-v2 .actions { display:flex; gap:8px; margin-top:12px; } #seogrow-master-qa-v2 .secondary { background:#e5e7eb; color:#111827; }
`;

export function installMasterQaV2Panel() {
  if (document.getElementById("seogrow-master-qa-v2")) return;
  document.getElementById("seogrow-master-qa")?.remove();
  const root = document.createElement("div");
  root.id = "seogrow-master-qa-v2";
  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.textContent = "Esegui collaudo generale v2";
  root.append(launcher);
  document.body.append(root);
  const css = document.createElement("style");
  css.textContent = style;
  document.head.append(css);

  launcher.addEventListener("click", async () => {
    launcher.disabled = true;
    launcher.textContent = "Collaudo v2 in corso…";
    root.querySelector(".panel")?.remove();
    try {
      const report = await runMasterQaV2();
      const panel = document.createElement("section");
      panel.className = "panel";
      panel.innerHTML = `<strong>Master QA v2: ${report.summary.overall}</strong><div>PASS ${report.summary.counts.PASS} · FAIL ${report.summary.counts.FAIL} · INFO ${report.summary.counts.INFO} · MANUAL ${report.summary.counts.MANUAL}</div>`;
      for (const item of report.results) {
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `<strong class="${item.status}">${item.status}</strong> — ${item.area}<br><small></small>`;
        row.querySelector("small").textContent = item.detail;
        panel.append(row);
      }
      const actions = document.createElement("div");
      actions.className = "actions";
      const copy = document.createElement("button");
      copy.className = "secondary";
      copy.textContent = "Copia report JSON";
      copy.addEventListener("click", () => navigator.clipboard.writeText(JSON.stringify(report, null, 2)));
      const close = document.createElement("button");
      close.className = "secondary";
      close.textContent = "Chiudi";
      close.addEventListener("click", () => panel.remove());
      actions.append(copy, close);
      panel.append(actions);
      root.append(panel);
    } finally {
      launcher.disabled = false;
      launcher.textContent = "Esegui collaudo generale v2";
    }
  });
}
