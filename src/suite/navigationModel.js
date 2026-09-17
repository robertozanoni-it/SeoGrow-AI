import { isRegisteredPage } from "../core/modules/moduleRegistry.js";
import { PRODUCT_MODULES } from "./productArchitecture.js";

const item = (moduleDefinition) => Object.freeze({
  page: moduleDefinition.page,
  label: moduleDefinition.label,
  icon: moduleDefinition.icon,
  advancedOnly: moduleDefinition.advancedOnly,
});

const groups = [];
for (const moduleDefinition of PRODUCT_MODULES) {
  let navigationGroup = groups.find((candidate) => candidate.label === moduleDefinition.group);
  if (!navigationGroup) {
    navigationGroup = { label: moduleDefinition.group, items: [] };
    groups.push(navigationGroup);
  }
  navigationGroup.items.push(item(moduleDefinition));
}

export const SUITE_NAVIGATION = Object.freeze(
  groups.map((navigationGroup) => Object.freeze({
    label: navigationGroup.label,
    items: Object.freeze(navigationGroup.items),
  })),
);

for (const navigationGroup of SUITE_NAVIGATION) {
  for (const navigationItem of navigationGroup.items) {
    if (!isRegisteredPage(navigationItem.page)) {
      throw new Error(`Navigazione SeoGrow punta a una pagina non registrata: ${navigationItem.page}`);
    }
  }
}

export const suiteNavigationItem = (page) => {
  for (const navigationGroup of SUITE_NAVIGATION) {
    const found = navigationGroup.items.find((navigationItem) => navigationItem.page === page);
    if (found) return found;
  }
  return null;
};
