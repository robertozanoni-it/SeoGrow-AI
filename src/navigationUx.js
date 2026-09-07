export function navigatePage(page) {
  const next = `#${encodeURIComponent(page)}`;
  if (page === "Correzioni") {
    window.__seogrowCorrectionsMode = true;
    if (window.location.hash !== next) window.history.pushState(null, "", next);
    window.dispatchEvent(new CustomEvent("seogrow-locationchange"));
    return;
  }
  if (window.location.hash !== next) window.location.hash = next;
  else window.dispatchEvent(new CustomEvent("seogrow-locationchange"));
}

export const isNavigationItemVisible = (label, advancedOnly, mode, currentPage) =>
  mode === "advanced" || !advancedOnly || label === currentPage;

const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function searchWorkspace(query, { pages, clients, tasks }) {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const matches = (...fields) => tokens.every(token => normalize(fields.join(" ")).includes(token));
  const results = [
    ...[...new Set([...pages, "Correzioni"])].filter(label => matches(label)).map(label => ({ label, meta: "Sezione", page: label })),
    ...clients.filter(client => matches(client.name, client.url)).map(client => ({ label: client.name, meta: client.url, page: "Panoramica", clientId: client.id })),
    ...tasks.filter(task => matches(task.title, task.client, task.detail, task.sourceUrl, task.targetUrl)).map(task => ({ label: task.title, meta: task.client, page: "Task", clientId: task.sourceClientId || clients.find(client => client.name === task.client)?.id, taskId: task.id })),
  ];
  return results;
}
