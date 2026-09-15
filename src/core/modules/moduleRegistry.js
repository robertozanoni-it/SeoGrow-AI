import { validateSuiteModuleSet } from "./moduleContract.js";
import { hubManifest } from "../../experience/hub/manifest.js";
import { tasksManifest } from "../../experience/tasks/manifest.js";
import { auditManifest } from "../../modules/audit/manifest.js";
import { rankManifest } from "../../modules/rank/manifest.js";
import { contentManifest } from "../../modules/content/manifest.js";
import { linksManifest } from "../../modules/links/manifest.js";
import { geoManifest } from "../../modules/geo/manifest.js";
import { publishManifest } from "../../modules/publish/manifest.js";
import { agentManifest } from "../../intelligence/agent/manifest.js";
import { systemManifest } from "../../system/manifest.js";

/**
 * SeoGrow Suite domain registry.
 *
 * Each domain owns its manifest. This registry only composes and validates the
 * Suite, so adding a module does not require embedding its definition in Core.
 * Existing page labels remain the compatibility contract while the legacy
 * monolith is extracted incrementally.
 */
export const SUITE_MODULES = Object.freeze([
  hubManifest,
  auditManifest,
  rankManifest,
  contentManifest,
  linksManifest,
  geoManifest,
  tasksManifest,
  agentManifest,
  publishManifest,
  systemManifest,
]);

validateSuiteModuleSet(SUITE_MODULES);

const pageOwners = new Map();
for (const moduleDefinition of SUITE_MODULES) {
  if (moduleDefinition.status !== "active") continue;
  for (const page of moduleDefinition.pages) pageOwners.set(page, moduleDefinition);
}

export const REGISTERED_PAGES = Object.freeze([...pageOwners.keys()]);

/**
 * Transitional aliases let new Suite terminology coexist with existing saved
 * page labels. No persisted workspace value is rewritten by this registry.
 */
export const SUITE_PAGE_ALIASES = Object.freeze({
  Hub: "Panoramica",
  "Audit & Fix": "Audit SEO",
  Audit: "Audit SEO",
  Rankings: "Posizionamenti",
  Rank: "Posizionamenti",
  Content: "Piano editoriale",
  Links: "Link interni",
  GEO: "GEO AI",
  Publish: "Correzioni",
  Agent: "SEO Agent",
});

export const resolvePageAlias = (page) => SUITE_PAGE_ALIASES[page] || page;

export const isRegisteredPage = (page) => pageOwners.has(resolvePageAlias(page));

export const moduleForPage = (page) => pageOwners.get(resolvePageAlias(page)) || null;

export const moduleById = (id) => SUITE_MODULES.find((moduleDefinition) => moduleDefinition.id === id) || null;

export const activeSuiteModules = () => SUITE_MODULES.filter((moduleDefinition) => moduleDefinition.status === "active");
