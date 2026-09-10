import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileAuthoritativeInventoryWithPublicCoverage,
  validateAuthoritativeWordPressInventory,
} from "../server/elementorWordPressInventory.js";

const siteUrl = "https://example.com";
const validPayload = () => ({
  source: "seogrow-connector",
  connectorVersion: "1.3.1",
  readOnly: true,
  inventoryScope: "all-public-queryable-post-types",
  complete: true,
  truncated: false,
  totalResources: 3,
  resources: [
    { id: 1, postType: "page", status: "publish", url: "https://example.com/" },
    { id: 2, postType: "page", status: "publish", url: "https://example.com/a/" },
    { id: 3, postType: "post", status: "publish", url: "https://example.com/b/" },
  ],
});

test("inventario Connector completo e read-only viene accettato", () => {
  const result = validateAuthoritativeWordPressInventory(validPayload(), { siteUrl });
  assert.equal(result.verified, true);
  assert.equal(result.status, "verified-authoritative");
  assert.equal(result.resources.length, 3);
  assert.equal(result.sharedWriteAllowed, false);
});

test("claim client o sorgente diversa non diventa inventario autorevole", () => {
  const payload = validPayload();
  payload.source = "browser-client";
  const result = validateAuthoritativeWordPressInventory(payload, { siteUrl });
  assert.equal(result.verified, false);
  assert.equal(result.status, "invalid-contract");
});

test("inventario troncato o incompleto resta fail-closed", () => {
  const truncated = validPayload();
  truncated.truncated = true;
  assert.equal(validateAuthoritativeWordPressInventory(truncated, { siteUrl }).status, "truncated");

  const incomplete = validPayload();
  incomplete.complete = false;
  assert.equal(validateAuthoritativeWordPressInventory(incomplete, { siteUrl }).status, "incomplete");
});

test("inventario completo oltre il vecchio limite di 30 risorse viene accettato", () => {
  const large = validPayload();
  large.totalResources = 31;
  large.resources = Array.from({ length: 31 }, (_, index) => ({
    id: index + 1,
    postType: "page",
    status: "publish",
    url: `https://example.com/p-${index}/`,
  }));
  const result = validateAuthoritativeWordPressInventory(large, { siteUrl });
  assert.equal(result.verified, true);
  assert.equal(result.status, "verified-authoritative");
  assert.equal(result.resources.length, 31);
  assert.equal(result.maxResources, 2000);
});

test("inventario oltre il tetto fail-closed di 2000 risorse resta bloccato", () => {
  const tooLarge = validPayload();
  tooLarge.totalResources = 2001;
  tooLarge.resources = Array.from({ length: 2001 }, (_, index) => ({
    id: index + 1,
    postType: "page",
    status: "publish",
    url: `https://example.com/p-${index}/`,
  }));
  const result = validateAuthoritativeWordPressInventory(tooLarge, { siteUrl });
  assert.equal(result.verified, false);
  assert.equal(result.status, "truncated");
  assert.equal(result.truncated, true);
});

test("duplicati, URL esterne e conteggi incoerenti bloccano l'inventario", () => {
  const duplicate = validPayload();
  duplicate.resources[2] = { id: 2, postType: "page", status: "publish", url: "https://example.com/b/" };
  assert.equal(validateAuthoritativeWordPressInventory(duplicate, { siteUrl }).status, "invalid-resources");

  const external = validPayload();
  external.resources[2].url = "https://evil.example.net/b/";
  assert.equal(validateAuthoritativeWordPressInventory(external, { siteUrl }).status, "invalid-resources");

  const mismatch = validPayload();
  mismatch.totalResources = 4;
  assert.equal(validateAuthoritativeWordPressInventory(mismatch, { siteUrl }).status, "count-mismatch");
});

test("inventario autorevole e coverage pubblica coincidente attestano la coverage", () => {
  const inventory = validateAuthoritativeWordPressInventory(validPayload(), { siteUrl });
  const publicCoverage = {
    publicCoverageReconciled: true,
    sitemapUrls: [
      "https://example.com/",
      "https://example.com/a/",
      "https://example.com/b/",
    ],
  };
  const result = reconcileAuthoritativeInventoryWithPublicCoverage(inventory, publicCoverage);
  assert.equal(result.verified, true);
  assert.equal(result.status, "verified-complete");
  assert.equal(result.scope.globallyComplete, true);
  assert.equal(result.totalUrls, 3);
  assert.deepEqual(result.publicUrlsOutsideInventory, []);
  assert.deepEqual(result.inventoryUrlsMissingFromPublicCoverage, []);
  assert.equal(result.sharedWriteAllowed, false);
});

test("categorie e archivi già compresi nella coverage verificata sono un superset sicuro", () => {
  const inventory = validateAuthoritativeWordPressInventory(validPayload(), { siteUrl });
  const result = reconcileAuthoritativeInventoryWithPublicCoverage(inventory, {
    publicCoverageReconciled: true,
    sitemapUrls: [
      "https://example.com/",
      "https://example.com/a/",
      "https://example.com/b/",
      "https://example.com/category/news/",
    ],
  });
  assert.equal(result.verified, true);
  assert.equal(result.status, "verified-public-superset");
  assert.deepEqual(result.publicUrlsOutsideInventory, ["https://example.com/category/news/"]);
  assert.equal(result.totalUrls, 4);
  assert.equal(result.scope.globallyComplete, true);
  assert.equal(result.scope.publicSuperset, true);
  assert.equal(result.sharedWriteAllowed, false);
});

test("una risorsa WordPress assente dalla sitemap resta bloccante", () => {
  const inventory = validateAuthoritativeWordPressInventory(validPayload(), { siteUrl });
  const result = reconcileAuthoritativeInventoryWithPublicCoverage(inventory, {
    publicCoverageReconciled: true,
    sitemapUrls: ["https://example.com/", "https://example.com/a/"],
  });
  assert.equal(result.verified, false);
  assert.equal(result.status, "inventory-routes-missing-from-public-coverage");
  assert.deepEqual(result.inventoryUrlsMissingFromPublicCoverage, ["https://example.com/b/"]);
  assert.deepEqual(result.publicUrlsOutsideInventory, []);
  assert.equal(result.scope.globallyComplete, false);
});
