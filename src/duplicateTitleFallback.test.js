import test from "node:test";
import assert from "node:assert/strict";
import { deterministicDuplicateTitle } from "../server/deterministicSeoTitle.js";
import { generatePatch } from "../server/wordpressPatchV2Hook.js";
import { registerRoutes as registerSeoRoutes } from "../server/wordpressSeoAdapterV2Hook.js";

const page = {
  title: "Yoga Buena Onda",
  excerpt: "",
  content: "",
  url: "https://yogabuenaonda.it/yoga-alimentazione-cinisello-balsamo",
};
const issue = { type: "duplicate-title", label: "Title duplicato" };

const withoutOpenAi = (t) => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  });
};

test("la URL reale yoga alimentazione produce un title deterministico leggibile", () => {
  assert.equal(
    deterministicDuplicateTitle(page, issue),
    "Yoga Alimentazione Cinisello Balsamo",
  );
});

test("WordPress core prepara il title duplicato anche senza OpenAI", async (t) => {
  withoutOpenAi(t);
  const result = await generatePatch({
    topic: "Remediation WordPress title",
    context: JSON.stringify({ page, issue }),
  });
  assert.equal(result.deterministic, true);
  assert.equal(result.changes.title, "Yoga Alimentazione Cinisello Balsamo");
  assert.equal(result.quality.publishable, true);
  assert.equal(result.quality.source, "url-slug");
});

test("Rank Math/Yoast possono ricevere lo stesso fallback title senza OpenAI", async (t) => {
  withoutOpenAi(t);
  const routes = new Map();
  const app = { post: (path, handler) => routes.set(path, handler) };
  registerSeoRoutes(app);
  let status = 200;
  let payload = null;
  const response = {
    status(value) { status = value; return this; },
    json(value) { payload = value; return this; },
  };
  await routes.get("/api/wordpress/generate-seo-value-v2")({
    body: { kind: "seo_title", issue, page },
    ip: "duplicate-title-fallback-test",
  }, response);
  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.value, "Yoga Alimentazione Cinisello Balsamo");
  assert.equal(payload.publishable, true);
  assert.equal(payload.deterministicFallback, true);
});

test("il fallback non viene usato per un problema title diverso dal duplicato", async (t) => {
  withoutOpenAi(t);
  await assert.rejects(
    generatePatch({
      topic: "Remediation WordPress title",
      context: JSON.stringify({ page, issue: { type: "title", label: "Title mancante" } }),
    }),
    /OpenAI non è configurata/,
  );
});
