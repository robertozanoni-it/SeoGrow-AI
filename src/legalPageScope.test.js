import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLegalPage, excludeLegalSeo } from './legalPageScope.js';
import { buildAutoFixPlan } from './autoFixPlan.js';
test('policy pages excluded, editorial privacy articles retained', () => {
  assert.equal(isLegalPage('https://example.com/en/privacy-policy/'), true);
  assert.equal(isLegalPage('https://example.com/blog/come-proteggere-la-privacy/'), false);
  const data = excludeLegalSeo({url:'https://example.com',pages:[{url:'https://example.com/privacy-policy/'},{url:'https://example.com/corsi/'}],issues:[{url:'https://example.com/privacy-policy/',label:'0 H1'},{url:'https://example.com/corsi/',label:'0 H1'}]});
  assert.equal(data.issues.length,1); assert.equal(data.pagesChecked,1); assert.equal(data.legalPages.length,1);
  assert.equal(data.legalScopeVersion, 3);
});
test('historic auto fix keeps original indexes after policy exclusions', () => {
  const plan=buildAutoFixPlan({clientId:1,siteUrl:'https://example.com',audit:{issues:[{url:'https://example.com/privacy/',label:'H1'},{url:'https://example.com/corsi/',label:'H1'}]}});
  assert.deepEqual(plan.entries.map(e=>e.index),[1]);
});

test('legal footer destinations and separator variants are excluded', () => {
  for (const slug of ['cookie-policy', 'politica-di-utilizzo', 'termini-di-uso', 'termini-del-servizio', 'privacy-policy', 'Privacy_%20policy', 'Cookie_Policy.html']) {
    assert.equal(isLegalPage(`https://yogabuenaonda.it/${slug}/`), true, slug);
  }
  assert.equal(isLegalPage('https://example.com/blog/guida-alla-cookie-policy/'), false);
});

test('broken-link scope follows the source page, not the broken destination', () => {
  const fromLegal = excludeLegalSeo({
    url: 'https://example.com/',
    issues: [{ type: 'broken-external-link', sourceUrl: 'https://example.com/privacy-policy/', targetUrl: 'https://external.example/missing', label: '404' }],
  });
  assert.equal(fromLegal.issues.length, 0);
  assert.equal(fromLegal.legalPages[0]?.url, 'https://example.com/privacy-policy/');

  const toLegal = excludeLegalSeo({
    url: 'https://example.com/',
    issues: [{ type: 'broken-link', sourceUrl: 'https://example.com/articolo/', targetUrl: 'https://example.com/privacy-policy/', label: '404' }],
  });
  assert.equal(toLegal.issues.length, 1);
  assert.equal(toLegal.legalPages.length, 0);
});
