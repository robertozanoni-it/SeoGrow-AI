export const reportSections = {
  overview: "Sintesi executive",
  tasks: "Attività",
  issues: "Problemi tecnici",
  geo: "Preparazione GEO",
  queries: "Query Search Console",
  rankings: "Posizionamenti",
  editorial: "Piano editoriale",
  links: "Link interrotti",
};

export function reportTemplate(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const sections = Object.fromEntries(
    Object.keys(reportSections).map((key) => [key, input.sections?.[key] !== false]),
  );
  if (!Object.values(sections).some(Boolean)) sections.tasks = true;
  return {
    brand: String(input.brand || "").slice(0, 100),
    title: String(input.title || "Report SEO").slice(0, 100),
    intro: String(input.intro || "").slice(0, 2000),
    color: /^#[\da-f]{6}$/i.test(input.color || "") ? input.color : "#16a05d",
    sections,
  };
}
