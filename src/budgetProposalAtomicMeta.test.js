import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const budgetServer = await readFile(new URL("../server/providerBudgetConfigHook.js", import.meta.url), "utf8");
const budgetUi = await readFile(new URL("./ProviderBudgetUx.js", import.meta.url), "utf8");
const navigation = await readFile(new URL("./AutomaticProposalNavigation.js", import.meta.url), "utf8");
const proposalLinks = await readFile(new URL("./ProposalBeforeAfterLinks.js", import.meta.url), "utf8");
const atomic = await readFile(new URL("../wordpress-plugin/seogrow-connector/atomic-write.php", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("OpenAI e DataForSEO espongono budget esplicito, spesa, residuo e stati di allerta", () => {
  assert.match(budgetServer, /OPENAI_MONTHLY_BUDGET_USD/);
  assert.match(budgetServer, /DATAFORSEO_MONTHLY_BUDGET_USD/);
  assert.match(budgetServer, /\/api\/provider-budget-config/);
  assert.match(budgetUi, /\/api\/openai\/status/);
  assert.match(budgetUi, /\/api\/dataforseo\/status/);
  assert.match(budgetUi, /Budget non impostato nel \.env/);
  assert.match(budgetUi, /Budget quasi esaurito/);
  assert.match(budgetUi, /Budget esaurito/);
  assert.match(budgetUi, /line\("Residuo"/);
  assert.match(budgetUi, /dataset\.fingerprint/);
  assert.match(main, /import ['"]\.\/ProviderBudgetUx['"]/);
});

test("clic sull'intera riga di un problema automatico apre direttamente la proposta", () => {
  assert.match(navigation, /event\.target\.closest\?\.\("\.problem-row"\)/);
  assert.match(navigation, /row\.querySelector\("\.problem-correctability\.automatic"\)/);
  assert.match(navigation, /openedFrom.*problem-row/);
  assert.match(navigation, /navigatePage\(PROPOSAL_ROUTE_PAGE\)/);
  assert.match(navigation, /stopImmediatePropagation/);
});

test("proposta mostra URL cliccabile accanto al confronto prima dopo", () => {
  assert.match(proposalLinks, /automatic-proposal-source-link/);
  assert.match(proposalLinks, /wp-live-preview-row/);
  assert.match(proposalLinks, /correction-readable/);
  assert.match(proposalLinks, /Pagina della correzione:/);
  assert.match(proposalLinks, /Apri pagina interessata/);
  assert.match(main, /import ['"]\.\/ProposalBeforeAfterLinks['"]/);
});

test("Connector consente solo CAS atomico single-row sui meta SEO noti", () => {
  for (const key of [
    "rank_math_title",
    "rank_math_description",
    "rank_math_canonical_url",
    "_yoast_wpseo_title",
    "_yoast_wpseo_metadesc",
    "_yoast_wpseo_canonical",
  ]) assert.match(atomic, new RegExp(key));
  assert.match(atomic, /count\(\$expected\['meta'\]\) !== 1/);
  assert.match(atomic, /count\(\$matches\) !== 1/);
  assert.match(atomic, /SELECT meta_id, meta_key, meta_value FROM \{\$wpdb->postmeta\} WHERE post_id = %d FOR UPDATE/);
  assert.match(atomic, /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ/);
  assert.match(atomic, /BINARY meta_value = BINARY %s/);
  assert.match(atomic, /atomicGuaranteed' => true/);
  assert.match(atomic, /staleChecked' => true/);
  assert.match(atomic, /wp_cache_delete\(\$id, 'post_meta'\)/);
  assert.match(atomic, /single-seo-postmeta-cas-v1/);
  assert.doesNotMatch(atomic, /rank_math_robots.*seogrow_connector_atomic_seo_meta_keys/s);
});
