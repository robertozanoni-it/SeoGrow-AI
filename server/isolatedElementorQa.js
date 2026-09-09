import { isDeepStrictEqual } from "node:util";
const BASELINE = [
  {
    "id": "a90b1c23",
    "elType": "container",
    "settings": {
      "container_type": "flex",
      "flex_direction": "column",
      "content_width": "boxed",
      "padding": {
        "unit": "px",
        "top": 40,
        "right": 24,
        "bottom": 40,
        "left": 24,
        "isLinked": false
      }
    },
    "elements": [
      {
        "id": "b90c2d34",
        "elType": "widget",
        "settings": {
          "title": "Collaudo SeoGrow — versione iniziale",
          "header_size": "h1",
          "typography_typography": "custom",
          "typography_font_family": "Roboto",
          "typography_font_size": {
            "unit": "px",
            "size": 36
          },
          "typography_font_size_mobile": {
            "unit": "px",
            "size": 26
          },
          "typography_font_weight": "600"
        },
        "elements": [],
        "widgetType": "heading"
      },
      {
        "id": "c90d3e45",
        "elType": "widget",
        "settings": {
          "editor": "<p>Pagina tecnica temporanea. Verifica di testo, caratteri, impaginazione e ripristino. Nessun servizio o contenuto commerciale.</p>"
        },
        "elements": [],
        "widgetType": "text-editor"
      }
    ],
    "isInner": false
  }
];
export const QA_SITE = "https://yogabuenaonda.it/";
export const QA_PAGE = 8196;
export function isolatedElementorQaPatch(base, resource, id, entity) {
  if (String(base) !== QA_SITE || resource !== "pages" || Number(id) !== QA_PAGE ||
      entity?.id !== QA_PAGE || entity.status !== "draft" || entity.template !== "elementor_canvas" ||
      entity.title?.raw !== "SeoGrow — collaudo isolato 2026-09-09" ||
      entity.meta?._elementor_edit_mode !== "builder" ||
      entity.meta?._elementor_template_type !== "wp-page" ||
      !Array.isArray(entity.meta?.rank_math_robots) ||
      !entity.meta.rank_math_robots.includes("noindex") ||
      !entity.meta.rank_math_robots.includes("nofollow") ||
      !Array.isArray(entity.meta?._elementor_conditions) || entity.meta._elementor_conditions.length !== 0) {
    throw new Error("Collaudo consentito soltanto sulla bozza Canvas isolata 8196 di Yoga Buena Onda.");
  }
  let tree;
  try { tree = JSON.parse(entity.meta._elementor_data); } catch { throw new Error("Documento di collaudo non valido."); }
  if (!isDeepStrictEqual(tree, BASELINE)) throw new Error("La pagina di collaudo non coincide con il modello autorizzato. Nessuna modifica preparata.");
  tree[0].elements[0].settings.title = "Collaudo SeoGrow — versione di prova";
  return { meta: { _elementor_data: JSON.stringify(tree) } };
}

