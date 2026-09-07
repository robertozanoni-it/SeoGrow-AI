const encode = value => JSON.stringify(value);
export function taskChange(before, after) {
  const previous = new Map(before.map(task => [task.id, task]));
  const next = new Map(after.map(task => [task.id, task]));
  return [...new Set([...previous.keys(), ...next.keys()])]
    .filter(id => encode(previous.get(id)) !== encode(next.get(id)))
    .map(id => ({ id, before: previous.get(id), after: next.get(id), index: before.findIndex(task => task.id === id) }));
}
export function undoTaskChange(current, changes) {
  if (!changes?.length) return current;
  for (const change of changes) {
    const matches = current.filter(task => task.id === change.id);
    if (matches.length > 1 || encode(matches[0]) !== encode(change.after)) throw new Error("La task è cambiata dopo questa operazione. Annullamento non disponibile.");
  }
  const restored = current.filter(task => !changes.some(change => change.id === task.id));
  for (const change of changes.filter(change => change.before).toSorted((a, b) => a.index - b.index)) restored.splice(Math.max(0, change.index), 0, change.before);
  return restored;
}
export function savedViews(value) {
  return Array.isArray(value) ? value.filter(view => typeof view?.id === "string" && typeof view.name === "string" && view.filters && typeof view.filters === "object").slice(0, 30) : [];
}
