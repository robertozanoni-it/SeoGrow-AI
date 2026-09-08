import test from 'node:test';
import assert from 'node:assert/strict';
import { getWordPressSession, rememberWordPressSession, forgetWordPressSession } from './wordpressSession.js';
import { correctionPresentation, readableCorrectionFields } from './correctionPresentation.js';
test('WordPress sessions are isolated by project and installation and expire', () => {
  const c = { url:'https://example.com/wp/', username:'qa', applicationPassword:'synthetic-only' };
  rememberWordPressSession(1,c);
  assert.equal(getWordPressSession(1,c.url).username,'qa');
  assert.equal(getWordPressSession(2,c.url),null);
  assert.equal(getWordPressSession(1,'https://example.com/'),null);
  assert.equal(getWordPressSession(1,c.url,Date.now()+31*60_000),null);
  rememberWordPressSession(1,c); forgetWordPressSession(1,c.url);
  assert.equal(getWordPressSession(1,c.url),null);
});
test('Shared ownership failure is explained as blocked, never a proposed change', () => {
  const p=correctionPresentation({status:'ownership_error',reason:'raw ownership'});
  assert.match(p.title,/bloccata/); assert.match(p.title,/nessuna proposta/);
  assert.match(p.next,/Elementor/);
  assert.match(correctionPresentation({status:'preview'}).title,/pronta/);
});
test('Human readable before/after preserves exact values including literal markup', () => {
  assert.deepEqual(readableCorrectionFields({data:{changed:['meta.rank_math_description'],previewBefore:{meta:{rank_math_description:''}},previewAfter:{meta:{rank_math_description:'<b>Test</b>'}}}}),[{field:'meta.rank_math_description',label:'Meta description',before:'(vuoto)',after:'<b>Test</b>'}]);
});
