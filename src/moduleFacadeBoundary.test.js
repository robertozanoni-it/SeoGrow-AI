import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUITE_MODULES } from "./core/modules/moduleRegistry.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
const geoFacade = await readFile(new URL("./modules/geo/index.js", import.meta.url), "utf8");
const agentFacade = await readFile(new URL("./intelligence/agent/index.js", import.meta.url), "utf8");

const publicFacadeDefinitions = Object.freeze({
  hub: Object.freeze({ path: "./experience/hub/index.js", manifest: "hubManifest" }),
  audit: Object.freeze({ path: "./modules/audit/index.js", manifest: "auditManifest" }),
  rank: Object.freeze({ path: "./modules/rank/index.js", manifest: "rankManifest" }),
  content: Object.freeze({ path: "./modules/content/index.js", manifest: "contentManifest" }),
  links: Object.freeze({ path: "./modules/links/index.js", manifest: "linksManifest" }),
  geo: Object.freeze({ path: "./modules/geo/index.js", manifest: "geoManifest" }),
  tasks: Object.freeze({ path: "./experience/tasks/index.js", manifest: "tasksManifest" }),
  agent: Object.freeze({ path: "./intelligence/agent/index.js", manifest: "agentManifest" }),
  publish: Object.freeze({ path: "./modules/publish/index.js", manifest: "publishManifest" }),
  system: Object.freeze({ path: "./system/index.js", manifest: "systemManifest" }),
});

async function sourceFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path.join(directory, entry.name), relative));
    else if (/\.(?:js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) files.push(relative);
  }
  return files;
}

const directImporters = async (target) => {
  const importers = [];
  const pattern = new RegExp(`from\\s+["']\\.\\/${target}(?:\\.jsx)?["']`);
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === `${target}.jsx`) continue;
    if (normalized === "modules/geo/index.js" || normalized === "intelligence/agent/index.js") continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  return importers;
};

test("ogni modulo Suite attivo espone un public facade con il proprio manifest", async () => {
  const activeIds = SUITE_MODULES
    .filter((moduleDefinition) => moduleDefinition.status === "active")
    .map((moduleDefinition) => moduleDefinition.id)
    .sort();
  const facadeIds = Object.keys(publicFacadeDefinitions).sort();

  assert.deepEqual(facadeIds, activeIds);

  for (const moduleId of activeIds) {
    const definition = publicFacadeDefinitions[moduleId];
    const source = await readFile(new URL(definition.path, import.meta.url), "utf8");
    assert.match(source, new RegExp(`\\b${definition.manifest}\\b`), `${moduleId} deve esporre ${definition.manifest}`);
    assert.match(source, /from\s+["']\.\/manifest\.js["']/, `${moduleId} deve usare il proprio manifest`);
  }
});

test("GEO e Agent espongono facade pubbliche senza richiedere il loader JSX nei test", () => {
  assert.match(geoFacade, /default as GeoPage/);
  assert.match(geoFacade, /\.\.\/\.\.\/GeoPage\.jsx/);
  assert.match(geoFacade, /geoManifest/);
  assert.match(agentFacade, /default as AgentPage/);
  assert.match(agentFacade, /\.\.\/\.\.\/AgentPage\.jsx/);
  assert.match(agentFacade, /agentModuleTools/);
  assert.match(agentFacade, /LEGACY_AGENT_TOOL_CAPABILITIES/);
});

test("nessun nuovo consumer aggira la facade GEO", async () => {
  assert.deepEqual(await directImporters("GeoPage"), ["App.jsx"]);
});

test("nessun nuovo consumer aggira la facade Agent", async () => {
  assert.deepEqual(await directImporters("AgentPage"), ["App.jsx"]);
});
