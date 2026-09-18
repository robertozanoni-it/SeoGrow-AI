import test from "node:test";
import assert from "node:assert/strict";
import { prepareElementorBrokenExternalLink } from "./brokenLinkRemediation.js";

const target = "https://www.yogajournal.com/poses/types/advanced/";
const wrapped = `https://www.google.com/search?q=${target}`;
const anchor = "Yoga Journal fornisce approfondimenti dettagliati sulle tecniche per affrontare queste posizioni complesse";
const beforeText = `<p>Una guida qualificada come <a href="${wrapped}">${anchor}</a>, sottolineando sempre l'importanza di una progressione graduale.</p>`;
const fixture = (html = beforeText) => [
  { id: "heading", elType: "widget", widgetType: "heading", settings: { title: "Titolo invariato" }, elements: [] },
  { id: "cd1d669", elType: "widget", widgetType: "text-editor", settings: { editor: html, text_color: "#123456" }, elements: [] },
];

for (const [mode, replacement] of [["unlink-preserve-text", anchor], ["delete-anchor-text", ""]]) {
  test(`isolated Elementor cleanup: ${mode}`, () => {
    const input = fixture();
    const snapshot = JSON.stringify(input);
    const result = prepareElementorBrokenExternalLink(snapshot, target, mode);
    assert.equal(result.state, "valid");
    assert.equal(result.count, 1);
    assert.equal(result.action, mode);
    assert.deepEqual(result.anchors, [anchor]);
    assert.deepEqual(JSON.parse(result.serialized), fixture(beforeText.replace(`<a href="${wrapped}">${anchor}</a>`, replacement)));
    assert.equal(JSON.stringify(input), snapshot);
  });
}
