const MODULE_ID = /^[a-z][a-z0-9-]*$/;
const FUTURE_PATH = /^\/[a-z0-9][a-z0-9/-]*$/;
const CAPABILITY_ID = /^[a-z][a-z0-9-]*$/;

export const MODULE_LAYERS = Object.freeze([
  "experience",
  "module",
  "intelligence",
  "action",
  "system",
]);

export const MODULE_STATUSES = Object.freeze(["active", "planned", "disabled"]);

const uniqueStrings = (values, field, { pattern } = {}) => {
  if (!Array.isArray(values)) throw new TypeError(`${field} deve essere un array.`);
  const normalized = values.map((value) => String(value || "").trim());
  if (normalized.some((value) => !value)) throw new TypeError(`${field} contiene un valore vuoto.`);
  if (pattern && normalized.some((value) => !pattern.test(value))) {
    throw new TypeError(`${field} contiene un identificatore non valido.`);
  }
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${field} contiene duplicati.`);
  return Object.freeze(normalized);
};

export function defineSuiteModule(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new TypeError("La definizione del modulo SeoGrow deve essere un oggetto.");
  }

  const id = String(definition.id || "").trim();
  const label = String(definition.label || "").trim();
  const layer = String(definition.layer || "").trim();
  const status = String(definition.status || "").trim();
  const futurePath = String(definition.futurePath || "").trim();

  if (!MODULE_ID.test(id)) throw new TypeError(`ID modulo SeoGrow non valido: ${id || "(vuoto)"}`);
  if (!label) throw new TypeError(`Il modulo ${id} richiede una label.`);
  if (!MODULE_LAYERS.includes(layer)) throw new TypeError(`Layer modulo SeoGrow non valido: ${layer}`);
  if (!MODULE_STATUSES.includes(status)) throw new TypeError(`Stato modulo SeoGrow non valido: ${status}`);
  if (!FUTURE_PATH.test(futurePath)) throw new TypeError(`Percorso futuro modulo SeoGrow non valido: ${futurePath || "(vuoto)"}`);

  const pages = uniqueStrings(definition.pages || [], `${id}.pages`);
  const capabilities = uniqueStrings(definition.capabilities || [], `${id}.capabilities`, { pattern: CAPABILITY_ID });
  const homePage = definition.homePage == null ? null : String(definition.homePage).trim();

  if (status === "active" && !pages.length) {
    throw new TypeError(`Il modulo attivo ${id} deve possedere almeno una pagina.`);
  }
  if (homePage && !pages.includes(homePage)) {
    throw new TypeError(`La home ${homePage} non appartiene al modulo ${id}.`);
  }
  if (status === "active" && !homePage) {
    throw new TypeError(`Il modulo attivo ${id} richiede una homePage.`);
  }

  return Object.freeze({
    id,
    label,
    layer,
    status,
    homePage,
    futurePath,
    pages,
    capabilities,
  });
}

export function validateSuiteModuleSet(modules) {
  if (!Array.isArray(modules) || !modules.length) throw new TypeError("Il registry SeoGrow richiede almeno un modulo.");
  const ids = new Set();
  const paths = new Set();
  const activePages = new Map();

  for (const moduleDefinition of modules) {
    if (ids.has(moduleDefinition.id)) throw new TypeError(`Modulo SeoGrow duplicato: ${moduleDefinition.id}`);
    if (paths.has(moduleDefinition.futurePath)) throw new TypeError(`Percorso modulo SeoGrow duplicato: ${moduleDefinition.futurePath}`);
    ids.add(moduleDefinition.id);
    paths.add(moduleDefinition.futurePath);

    if (moduleDefinition.status !== "active") continue;
    for (const page of moduleDefinition.pages) {
      const owner = activePages.get(page);
      if (owner) throw new TypeError(`Pagina SeoGrow registrata due volte: ${page} (${owner}, ${moduleDefinition.id})`);
      activePages.set(page, moduleDefinition.id);
    }
  }

  return true;
}
