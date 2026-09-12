import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWholePageResponse } from '../server/linkEvidenceHook.js';
import { assertCompletedModelResponse } from '../server/remediationOutput.js';
for (const status of [201,204,206,404,503]) test(`HTTP ${status} is not full-page negative link evidence`,()=>assert.throws(()=>assertWholePageResponse({status,headers:new Headers()}),/non completa/));
test('a ranged HTTP 200 does not establish link absence',()=>assert.throws(()=>assertWholePageResponse({status:200,headers:new Headers({'content-range':'bytes 0-100/500'})}),/non completa/));
test('ordinary full HTTP 200 can be checked for complete HTML',()=>assert.doesNotThrow(()=>assertWholePageResponse({status:200,headers:new Headers()})));
for(const finish_reason of [null,''])test(`explicit unfinished chat reason ${finish_reason} stays blocked`,()=>assert.throws(()=>assertCompletedModelResponse({choices:[{finish_reason,message:{content:'{"value":"unfinished"}'}}]}),e=>e.code==='AI_OUTPUT_INCOMPLETE'));
