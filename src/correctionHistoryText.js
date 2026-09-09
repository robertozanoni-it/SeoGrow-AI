// Presentation only: never change the snapshots used by rollback.
export function historyText(field, value) {
  if (field !== 'meta._elementor_data') return value == null || value === '' ? '(vuoto)' : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  try {
    const tree = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(tree)) throw new Error('Invalid document');
    const lines = [];
    const walk = nodes => nodes.forEach(node => {
      for (const key of ['title', 'editor', 'text']) {
        if (typeof node.settings?.[key] === 'string') {
          const text = node.settings[key].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          lines.push(text || '(testo vuoto)');
        }
      }
      if (Array.isArray(node.elements)) walk(node.elements);
    });
    walk(tree);
    return lines.join('\n\n') || 'Nessun testo semplice disponibile. Consulta i dettagli tecnici.';
  } catch {
    return 'Anteprima testuale non disponibile. Consulta i dettagli tecnici.';
  }
}

export function historyFieldLabel(field) {
  return ({ 'meta._elementor_data': 'Testi Elementor', title: 'Titolo', content: 'Contenuto', excerpt: 'Estratto', 'meta.rank_math_title': 'Titolo SEO', 'meta.rank_math_description': 'Meta description' })[field] || field;
}
