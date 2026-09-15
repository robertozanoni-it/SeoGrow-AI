import { defineSuiteModule, validateSuiteModuleSet } from "./moduleContract.js";

/**
 * SeoGrow Suite domain registry.
 *
 * This is intentionally independent from React and from the current hash-based
 * router. The existing page labels remain the compatibility contract while the
 * application is migrated incrementally from the legacy monolith.
 */
export const SUITE_MODULES = Object.freeze([
  defineSuiteModule({
    id: "hub",
    label: "SeoGrow Hub",
    layer: "experience",
    status: "active",
    homePage: "Panoramica",
    futurePath: "/overview",
    pages: ["Panoramica", "Clienti", "Centro progetto", "Storico", "SeoGrow AI"],
    capabilities: ["project-context", "project-health", "activity-summary"],
  }),
  defineSuiteModule({
    id: "audit",
    label: "Audit & Fix",
    layer: "module",
    status: "active",
    homePage: "Audit SEO",
    futurePath: "/audit",
    pages: ["Audit SEO", "Problemi", "Correzioni"],
    capabilities: ["detect", "prioritize", "fix", "verify"],
  }),
  defineSuiteModule({
    id: "rank",
    label: "Rank & Growth",
    layer: "module",
    status: "active",
    homePage: "Posizionamenti",
    futurePath: "/rank",
    pages: ["Posizionamenti", "Opportunità"],
    capabilities: ["rankings", "search-opportunities", "growth-signals"],
  }),
  defineSuiteModule({
    id: "content",
    label: "Content",
    layer: "module",
    status: "active",
    homePage: "Piano editoriale",
    futurePath: "/content",
    pages: ["Piano editoriale"],
    capabilities: ["editorial-plan", "content-brief", "content-optimization"],
  }),
  defineSuiteModule({
    id: "links",
    label: "Links",
    layer: "module",
    status: "active",
    homePage: "Link interni",
    futurePath: "/links",
    pages: ["Link interni"],
    capabilities: ["internal-links", "broken-links", "anchor-analysis"],
  }),
  defineSuiteModule({
    id: "geo",
    label: "GEO",
    layer: "module",
    status: "active",
    homePage: "GEO AI",
    futurePath: "/geo",
    pages: ["GEO AI"],
    capabilities: ["entity-clarity", "answerability", "citation-readiness"],
  }),
  defineSuiteModule({
    id: "tasks",
    label: "Tasks",
    layer: "experience",
    status: "active",
    homePage: "Task",
    futurePath: "/tasks",
    pages: ["Task"],
    capabilities: ["work-queue", "cross-module-actions"],
  }),
  defineSuiteModule({
    id: "agent",
    label: "SeoGrow Agent",
    layer: "intelligence",
    status: "active",
    homePage: "SEO Agent",
    futurePath: "/agent",
    pages: ["SEO Agent"],
    capabilities: ["orchestration", "planning", "approvals", "verification"],
  }),
  defineSuiteModule({
    id: "publish",
    label: "Publish",
    layer: "action",
    status: "planned",
    homePage: null,
    futurePath: "/publish",
    pages: [],
    capabilities: ["wordpress", "rank-math", "elementor", "preview", "rollback", "verify"],
  }),
  defineSuiteModule({
    id: "system",
    label: "System",
    layer: "system",
    status: "active",
    homePage: "Integrazioni",
    futurePath: "/settings",
    pages: ["Integrazioni", "Impostazioni"],
    capabilities: ["integrations", "settings"],
  }),
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
  Agent: "SEO Agent",
});

export const resolvePageAlias = (page) => SUITE_PAGE_ALIASES[page] || page;

export const isRegisteredPage = (page) => pageOwners.has(resolvePageAlias(page));

export const moduleForPage = (page) => pageOwners.get(resolvePageAlias(page)) || null;

export const moduleById = (id) => SUITE_MODULES.find((moduleDefinition) => moduleDefinition.id === id) || null;

export const activeSuiteModules = () => SUITE_MODULES.filter((moduleDefinition) => moduleDefinition.status === "active");
