import fs from "node:fs";
import path from "node:path";
import { summarizeLocalStorageOperations } from "./global-quality-audit-lib.mjs";

const root = process.cwd();
const walk = (dir) => fs.readdirSync(dir, { withFileTypes:true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});
const runtime = walk(path.join(root, "src")).filter((file) => /\.(?:js|jsx)$/.test(file) && !/\.test\.js$/.test(file));
const text = (file) => fs.readFileSync(file, "utf8");
const rel = (file) => path.relative(root, file).split(path.sep).join("/");
const matches = (pattern) => runtime.flatMap((file) => [...text(file).matchAll(pattern)].map((match) => ({ file:rel(file), match:match[0] })));

const markers = matches(/\b(?:TODO|FIXME|HACK)\b/g);
const readJsonDefs = matches(/\bconst\s+readJson\s*=/g);
const storageOperations = summarizeLocalStorageOperations(
  runtime.map((file) => ({ file: rel(file), source: text(file) })),
);
const nativeDialogs = matches(/\bwindow\.(?:confirm|alert)\s*\(/g);
const shims = runtime.filter((file) => text(file).includes("Legacy compatibility shim.")).map(rel);
const appLines = text(path.join(root, "src/App.jsx")).split(/\r?\n/).length;
const geoPage = text(path.join(root, "src/GeoPage.jsx"));
const geoPanel = text(path.join(root, "src/GeoInsightsPanel.jsx"));
const guided = text(path.join(root, "src/GuidedUxLayer.jsx"));
const guidedCss = text(path.join(root, "src/GuidedUxLayer.css"));
const taskFactory = text(path.join(root, "src/experience/tasks/taskFactory.js"));
const correctionsSource = text(path.join(root, "src/CorrectionsWorkspace.jsx"));
const workspaceDbSource = text(path.join(root, "src/workspaceDatabase.js"));
const routeReconcilerSource = text(path.join(root, "src/PageRouteReconciler.js"));
const dist = path.join(root, "dist/assets");
const appBundles = fs.existsSync(dist) ? fs.readdirSync(dist).filter((name) => /^appMain-.*\.js$/.test(name)).map((name) => ({ name, bytes:fs.statSync(path.join(dist,name)).size })) : [];
const mainBundle = appBundles.sort((a,b) => b.bytes-a.bytes)[0] || null;

const checks = {
  noImplementationMarkers: markers.length === 0,
  appShellBounded: appLines < 5000,
  mainBundleBelow700k: !mainBundle || mainBundle.bytes < 700 * 1024,
  geoTabsFunctional: /setActiveTab/.test(geoPage) && /GeoInsightsPanel/.test(geoPage) && /Entità e schema osservati/.test(geoPanel) && /Azioni GEO verificabili/.test(geoPanel),
  geoEvidenceNotDecorative: /Cosa NON misura/.test(geoPage) && /Nessun entity score/.test(geoPanel) && /onOpenOpportunities/.test(geoPanel) && /onCreateTask/.test(geoPanel),
  sidebarTonesAlternating: /groupIndex % 2/.test(guided) && /tone-blue/.test(guidedCss) && /tone-mint/.test(guidedCss),
  centralizedTaskFactory: /sourceClientId/.test(taskFactory) && /priority/.test(taskFactory),
  nativeStorageBoundaryIsolated: storageOperations.nativeBypass.length === 0,
  workspaceJsonReadersCentralized: readJsonDefs.length === 0,
  noGlobalDomPolling: !/setInterval\(syncTargets,\s*300\)/.test(guided) && !/setInterval\(syncTargets,\s*300\)/.test(correctionsSource),
  workspaceSameTabEventsCentralized: /window\.dispatchEvent\(storageEvent\)/.test(workspaceDbSource) && /seogrow-workspace-change/.test(workspaceDbSource) && /channel\?\.postMessage/.test(workspaceDbSource) && !/new StorageEvent\("storage"/.test(routeReconcilerSource),
};
const failures = Object.entries(checks).filter(([,ok]) => !ok).map(([name]) => name);
const report = {
  ok: failures.length === 0,
  checks,
  failures,
  metrics: {
    appLines,
    mainBundleBytes: mainBundle?.bytes ?? null,
    duplicateReadJsonDefinitions: readJsonDefs.length,
    directLocalStorageOperations: storageOperations.nativeBypass.length,
    workspaceStorageAliasOperations: storageOperations.canonicalAlias.length,
    nativeStorageBoundaryOperations: storageOperations.nativeBoundary.length,
    nativeDialogs: nativeDialogs.length,
    legacyCompatibilityShims: shims.length,
  },
  warnings: {
    readJsonDefinitions: readJsonDefs,
    nativeStorageBypasses: storageOperations.nativeBypass,
    workspaceStorageAliases: storageOperations.canonicalAlias,
    legacyShims: shims,
  },
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
