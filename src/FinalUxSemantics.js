const EMPTY_CLASS = /(?:^|[-_])(empty|no-data|no-results|blocking-state)(?:$|[-_])/i;
const LOADING_TEXT = /(?:caricamento|analisi|verifica|generazione|connessione|salvataggio|in corso|attendi|loading|checking)/i;

const addClass = (element, className) => {
  if (element?.classList && !element.classList.contains(className)) element.classList.add(className);
};

const normalizeStates = (root = document) => {
  root.querySelectorAll?.('[role="alert"]').forEach((element) => addClass(element, 'ux-state-error'));
  root.querySelectorAll?.('[role="status"]').forEach((element) => addClass(element, 'ux-state-status'));
  root.querySelectorAll?.('progress,[aria-busy="true"]').forEach((element) => addClass(element, 'ux-state-loading'));

  root.querySelectorAll?.('section,div,article').forEach((element) => {
    if ([...element.classList].some((className) => EMPTY_CLASS.test(className))) addClass(element, 'ux-state-empty');
  });

  root.querySelectorAll?.('button:disabled').forEach((button) => {
    if (!LOADING_TEXT.test(button.textContent || '')) return;
    if (button.getAttribute('aria-busy') !== 'true') button.setAttribute('aria-busy', 'true');
    addClass(button, 'ux-state-loading');
  });
};

const GUIDE_REPLACEMENTS = Object.freeze({
  'SEO Agent': Object.freeze({
    'Dai un obiettivo alla volta e mantieni visibili piano, approvazioni ed esito.': 'Dai un obiettivo preciso: l’Agent analizza e propone, mentre Task e Correzioni gestiscono le azioni.',
    'Scegli il livello di autonomia appropriato.': 'L’Agent usa solo capacità di lettura realmente disponibili.',
    'Controlla le azioni proposte.': 'Controlla analisi, fonti e proposte prima dell’handoff.',
    'Autorizza soltanto le operazioni desiderate.': 'Apri Task o Correzioni quando vuoi trasformare una proposta in azione.',
    'Controlla output, fonti, costi ed esito.': 'Verifica output, fonti e stato nei moduli proprietari.',
    'Modalità': 'Capacità',
    'Approva': 'Azione',
  }),
  'GEO AI': Object.freeze({
    'Valuta la leggibilità del brand e dei contenuti per sistemi generativi.': 'Valuta leggibilità tecnica, entità, schema, citabilità e contenuto usando solo evidenze osservabili.',
    'Seleziona progetto e contenuto.': 'Seleziona il progetto e verifica quali fonti reali sono disponibili.',
    'Esegui i controlli GEO disponibili.': 'Esegui audit, diagnostica OpenAI sul contesto e osservazioni Google quando disponibili.',
    'Individua le carenze azionabili.': 'Distingui gap osservati da diagnostica: nessun punteggio GEO sintetico.',
    'Prepara interventi coerenti con brand e contenuto.': 'Trasforma i gap in Opportunità o Task senza dichiarare presenza reale nei motori AI.',
    'Ripeti il controllo dopo le modifiche.': 'Ripeti le verifiche e confronta solo evidenze realmente osservabili.',
  }),
});

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || 'Panoramica'; }
  catch { return 'Panoramica'; }
};

const replaceGuideCopy = () => {
  const replacements = GUIDE_REPLACEMENTS[currentPage()];
  if (!replacements) return;
  const roots = document.querySelectorAll('.guided-page-help,.guided-wizard,.guided-step-card');
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const source = node.nodeValue?.trim();
      const replacement = replacements[source];
      if (!replacement) continue;
      node.nodeValue = node.nodeValue.replace(source, replacement);
    }
  }
};

const reconcile = () => {
  normalizeStates(document);
  replaceGuideCopy();
};

if (typeof window !== 'undefined' && !window.__seogrowFinalUxSemanticsInstalled) {
  window.__seogrowFinalUxSemanticsInstalled = true;
  let frame = 0;
  const schedule = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(reconcile);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled', 'aria-busy', 'role'] });
  for (const event of ['hashchange', 'popstate', 'seogrow-locationchange', 'seogrow-storage-ok']) window.addEventListener(event, schedule);
  schedule();
}

export { normalizeStates, replaceGuideCopy, GUIDE_REPLACEMENTS };
