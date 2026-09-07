export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function calendarDays(month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return [];
  const [year, number] = month.split("-").map(Number);
  if (year < 1900 || year > 2100 || number < 1 || number > 12) return [];
  return Array.from({ length: new Date(year, number, 0).getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
export function planItems(plan, saved) {
  const entries = Array.isArray(saved) ? saved.filter(item => typeof item?.id === "string" && validDate(item.date)).slice(0, 200) : [];
  const all = new Map(entries.map(item => [item.id, item]));
  for (const item of plan) if (typeof item.id === "string") all.set(item.id, { ...item, date: all.get(item.id)?.date || "" });
  return [...all.values()];
}
export function scheduleItem(saved, item, date) {
  if (date && !validDate(date)) throw new Error("Data non valida");
  const others = (Array.isArray(saved) ? saved : []).filter(entry => entry?.id !== item.id);
  if (!date) return others;
  if (others.length >= 200) throw new Error("Limite di 200 attività pianificate raggiunto.");
  return [...others, { id: item.id, title: item.title, type: item.type, url: item.url, date }];
}
export const reportSections = { tasks: "Attività", issues: "Problemi tecnici", geo: "Preparazione GEO", queries: "Query Search Console", links: "Link interrotti" };
export function reportTemplate(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const sections = Object.fromEntries(Object.keys(reportSections).map(key => [key, input.sections?.[key] !== false]));
  if (!Object.values(sections).some(Boolean)) sections.tasks = true;
  return { brand: String(input.brand || "").slice(0, 100), title: String(input.title || "Report SEO").slice(0, 100), intro: String(input.intro || "").slice(0, 2000), color: /^#[\da-f]{6}$/i.test(input.color || "") ? input.color : "#16a05d", sections };
}
