import test from "node:test";
import assert from "node:assert/strict";
import { matchBrokenLinkHref, singleAnchorHref, transformBrokenLinkAnchors } from "./modules/links/brokenLinkHref.js";

const target = "https://www.yogajournal.com/poses/types/advanced/";
const wrapped = `https://www.google.com/search?q=${target}`;

test("pure matcher keeps URL identity exact", () => {
  assert.equal(matchBrokenLinkHref(target, target)?.kind, "exact");
  for (const other of [target.toUpperCase(), target.slice(0, -1), `${target}?lang=it`, `${target}#pose`]) {
    assert.equal(matchBrokenLinkHref(other, target), null);
  }
});

test("pure matcher accepts one canonical Google wrapper", () => {
  const match = matchBrokenLinkHref(wrapped, target);
  assert.equal(match?.kind, "google-url-wrapper");
  assert.equal(match?.targetUrl, target);
});

test("pure anchor transformer counts direct and wrapped occurrence independently", () => {
  const html = `<p><a href="${target}">Prima</a><a href="${wrapped}">Seconda</a></p>`;
  const result = transformBrokenLinkAnchors(html, target);
  assert.equal(result.count, 2);
  assert.deepEqual(result.anchors, ["Prima", "Seconda"]);
  assert.deepEqual(result.matches.map((item) => item.kind), ["exact", "google-url-wrapper"]);
});


test("ownership prerequisite exposes two pure matches before Elementor planning", () => {
  const html = `<p><a href="${target}">Prima</a><a href="${wrapped}">Seconda</a></p>`;
  const result = transformBrokenLinkAnchors(html, target);
  assert.equal(result.count, 2);
  assert.equal(result.matches.filter((item) => item.kind === "exact").length, 1);
  assert.equal(result.matches.filter((item) => item.kind === "google-url-wrapper").length, 1);
});


test("pure parser ignores URL-looking data attributes and duplicate href attributes", () => {
  const html = `<a data-href="${target}" title="href='${target}'" href="https://other.example/">${target}</a>`;
  assert.equal(transformBrokenLinkAnchors(html, target).count, 0);
  assert.equal(singleAnchorHref(` data-href="${target}" href="https://other.example/"`), "https://other.example/");
  assert.equal(singleAnchorHref(` href="${target}" HREF="https://other.example/"`), "");
});

test("pure transformer leaves comments and non-rendered raw-text blocks untouched", () => {
  const anchor = `<a href="${target}">Testo</a>`;
  for (const html of [`<!-- ${anchor} -->`, `<script>${anchor}</script>`, `<template>${anchor}</template>`, `<textarea>${anchor}</textarea>`, `<style>${anchor}</style>`]) {
    const result = transformBrokenLinkAnchors(html, target, true);
    assert.equal(result.value, html);
    assert.equal(result.count, 0);
  }
});

test("pure matcher handles encoded Google destination without broadening identity", () => {
  const destination = "https://example.com/doc?a=1&b=2";
  const href = `https://www.google.com/url?q=${encodeURIComponent(destination)}&source=test`;
  assert.equal(matchBrokenLinkHref(href, destination)?.kind, "google-url-wrapper");
});
