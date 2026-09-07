import { initializeWorkspace } from "./workspaceDatabase.js";

async function exposeWorkspaceCrashHarnessInDev() {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(globalThis.location?.search || "");
  if (params.get("qaWorkspaceRestoreCrash") !== "1") return;
  const { runWorkspacePhysicalCrashHarnessFromPicker } = await import("./workspaceCrashHarness.js");
  globalThis.seoGrowQaCrashRestore = runWorkspacePhysicalCrashHarnessFromPicker;
  console.warn("SeoGrow QA crash harness armato. Esegui seoGrowQaCrashRestore() dalla console DevTools; non usare Importa backup per questa prova.");
}

async function exposeMasterQaInDev() {
  if (!import.meta.env.DEV) return;
  const params = new URLSearchParams(globalThis.location?.search || "");
  if (params.get("qaMaster") !== "1") return;
  const { installMasterQaV2Panel, runMasterQaV2 } = await import("./masterQaHarnessV2.js");
  globalThis.seoGrowMasterQa = runMasterQaV2;
  installMasterQaV2Panel();
  console.warn("SeoGrow Master QA v2 attivo. Usa il pulsante 'Esegui collaudo generale v2' oppure seoGrowMasterQa() dalla Console.");
}

initializeWorkspace().then(async () => {
  await exposeWorkspaceCrashHarnessInDev();
  await exposeMasterQaInDev();
  return import("./appMain.jsx");
}).catch(error => {
  const root = document.getElementById("root");
  const message = document.createElement("p");
  message.setAttribute("role", "alert");
  message.textContent = `Workspace non aperto. I dati precedenti sono conservati. ${error.message}`;
  root.replaceChildren(message);
});
