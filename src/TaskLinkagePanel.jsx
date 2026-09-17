import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardCheck, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { registerPageHost } from "./PageStartHierarchy.js";
import { readWorkspaceJson as readJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { listCorrections } from "./remediationStore.js";
import { buildUnifiedProblems } from "./problemsModel.js";
import { openProblemResolution } from "./AutomaticProposalNavigation.js";
import { navigatePage } from "./navigationUx.js";
import { workspaceStorage } from "./workspaceDatabase.js";
import { writeCorrectionsWorkflowContext } from "./taskWorkflow.js";
import { linkedTaskCounts, taskLinkSummary, taskOrigin } from "./experience/tasks/index.js";
import "./TaskLinkagePanel.css";

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};
const forClient = (store, clientId) => {
  const value = store?.[clientId] ?? store?.[String(clientId)] ?? [];
  return Array.isArray(value) ? value : value ? [value] : [];
};

export default function TaskLinkagePanel() {
  const [page, setPage] = useState(currentPage);
  const [revision, setRevision] = useState(0);
  const [host, setHost] = useState(null);
  const [correctionSnapshot, setCorrectionSnapshot] = useState({ clientId: null, rows: [] });

  useEffect(() => {
    const refreshPage = () => setPage(currentPage());
    const refresh = () => setRevision(value => value + 1);
    for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.addEventListener(event, refreshPage);
    for (const event of ["storage", "seogrow-storage-ok", "seogrow-remediation-history", "seogrow-task-cause-reconciled"]) window.addEventListener(event, refresh);
    return () => {
      for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.removeEventListener(event, refreshPage);
      for (const event of ["storage", "seogrow-storage-ok", "seogrow-remediation-history", "seogrow-task-cause-reconciled"]) window.removeEventListener(event, refresh);
    };
  }, []);

  useEffect(() => {
    if (page !== "Task") return undefined;
    let release;
    const frame = window.requestAnimationFrame(() => {
      const mountedHost = document.createElement("div");
      mountedHost.className = "task-linkage-panel-host guided-next-actions-host";
      mountedHost.dataset.taskLinkageHost = "true";
      release = registerPageHost(page, mountedHost);
      document.body.dataset.seogrowTaskLinkagePanel = "true";
      setHost(mountedHost);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      release?.();
      delete document.body.dataset.seogrowTaskLinkagePanel;
    };
  }, [page]);

  const stores = useMemo(() => ({
    revision,
    tasks: readJson(WORKSPACE_KEYS.tasks, []),
    analyses: readJson(WORKSPACE_KEYS.analyses, {}),
    pageAudits: readJson(WORKSPACE_KEYS.pageAuditHistory, {}),
    closures: readJson(WORKSPACE_KEYS.problemClosures, []),
  }), [revision]);
  const clientId = Number(readJson(WORKSPACE_KEYS.selectedClient, 0));
  const tasks = useMemo(
    () => stores.tasks.filter(task => Number(task.sourceClientId) === clientId && !task.stale),
    [stores.tasks, clientId],
  );

  useEffect(() => {
    if (page !== "Task" || !Number.isSafeInteger(clientId) || clientId <= 0) return undefined;
    let cancelled = false;
    listCorrections({ clientId })
      .then(rows => { if (!cancelled) setCorrectionSnapshot({ clientId, rows }); })
      .catch(() => { if (!cancelled) setCorrectionSnapshot({ clientId, rows: [] }); });
    return () => { cancelled = true; };
  }, [page, clientId, revision]);

  const corrections = useMemo(
    () => correctionSnapshot.clientId === clientId ? correctionSnapshot.rows : [],
    [correctionSnapshot, clientId],
  );
  const problems = useMemo(() => buildUnifiedProblems({
    clientId,
    siteHistory: forClient(stores.analyses, clientId),
    pageHistory: forClient(stores.pageAudits, clientId),
    tasks: stores.tasks,
    corrections,
    closures: stores.closures,
  }).rows, [clientId, stores.analyses, stores.pageAudits, stores.tasks, stores.closures, corrections]);
  const counts = linkedTaskCounts(tasks);
  const linked = tasks.filter(task => taskLinkSummary(task).id);

  const openCause = task => {
    const cause = taskLinkSummary(task);
    if (cause.type === "problem") {
      const problem = problems.find(item => item.key === cause.id);
      if (problem && openProblemResolution(problem, clientId, "task-linkage")) return;
      navigatePage("Audit SEO");
      return;
    }
    if (cause.type === "correction") {
      writeCorrectionsWorkflowContext(workspaceStorage, {
        id: task.id,
        correctionId: cause.id,
        kind: "remediation",
        title: task.title,
        sourceUrl: task.sourceUrl || "",
        targetUrl: task.targetUrl || "",
      });
      window.dispatchEvent(new CustomEvent("seogrow-corrections-task-handoff"));
      navigatePage("Correzioni");
      return;
    }
    if (cause.type === "opportunity") {
      sessionStorage.setItem("seogrow-opportunity-focus-v1", cause.id);
      navigatePage("Opportunità");
    }
  };

  if (page !== "Task" || !host || !Number.isSafeInteger(clientId) || clientId <= 0) return null;
  return createPortal(
    <section className="task-linkage-panel" aria-label="Collegamenti e riconciliazione Task">
      <header>
        <div><span className="eyebrow"><ShieldCheck /> Gate riconciliazione attivo</span><h2>Origine e causa delle Task</h2><p>I task automatici mantengono il collegamento alla causa SEO che li ha generati; i task manuali restano indipendenti.</p></div>
        <div className="task-linkage-kpis">
          <span><strong>{counts.manual}</strong><small>Manuali</small></span>
          <span><strong>{counts.automatic}</strong><small>Automatici</small></span>
          <span><strong>{counts.linked}</strong><small>Collegati</small></span>
          <span><strong>{counts.completedByCause}</strong><small>Riconciliati</small></span>
        </div>
      </header>
      {linked.length ? (
        <div className="task-linkage-table-wrap"><table><caption className="sr-only">Task collegate a problemi, correzioni o opportunità</caption><thead><tr><th>Task</th><th>Origine</th><th>Causa</th><th>Stato</th><th>Azione</th></tr></thead><tbody>
          {linked.map(task => {
            const cause = taskLinkSummary(task);
            return <tr key={task.id}>
              <td><strong>{task.title}</strong><small>{task.priority} · {task.due || "Da pianificare"}</small></td>
              <td><span className={`task-origin ${taskOrigin(task)}`}>{taskOrigin(task) === "manual" ? "Manuale" : "Automatica"}</span></td>
              <td><Link2 /><span><strong>{cause.label}</strong><small>{cause.id}</small></span></td>
              <td><span className={`task-link-status ${task.status === "Completato" ? "done" : "active"}`}>{task.status}</span>{task.causeReconciled && <small>Chiusura riconciliata con la causa</small>}</td>
              <td><button type="button" className="secondary mini" onClick={() => openCause(task)}>Apri {cause.label}</button></td>
            </tr>;
          })}
        </tbody></table></div>
      ) : (
        <div className="task-linkage-empty"><ClipboardCheck /><div><strong>Nessuna Task collegata</strong><p>I task manuali esistenti continuano a funzionare normalmente. I nuovi task automatici registrano la causa in modo esplicito.</p></div></div>
      )}
      <footer><RefreshCw /><span>Quando una causa verificata viene chiusa, il task collegato passa a Completato; se quella stessa causa ricompare, solo i task chiusi automaticamente vengono riaperti. L’undo del Task manager resta protetto da stale-check.</span></footer>
    </section>,
    host,
  );
}
