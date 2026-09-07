import test from "node:test";
import assert from "node:assert/strict";
import { atomicWordPressWrite } from "../server/wordpressAtomicWrite.js";

for (const operation of ["apply", "rollback"]) {
  test(`${operation} forwards exact snapshot and never falls back after conflict`, async () => {
    const calls = [];
    const payload = { resource: "pages", id: 12, expectedCurrent: { title: "Case sensitive" }, changes: { title: "New" }, operation };
    await assert.rejects(atomicWordPressWrite(new URL("https://example.it/blog/"), {}, payload, async (url, options) => {
      calls.push(String(url));
      assert.deepEqual(JSON.parse(options.body), payload);
      return Response.json({ code: "STALE_CONFLICT", message: "Changed" }, { status: 409 });
    }), error => error.code === "STALE_CONFLICT");
    assert.deepEqual(calls, ["https://example.it/blog/wp-json/seogrow/v1/atomic-write"]);
  });
}

test("old Connector or unproven success cannot be reported as atomic", async () => {
  for (const data of [{}, { ok: true, staleChecked: true }]) {
    await assert.rejects(atomicWordPressWrite(new URL("https://example.it"), {}, {}, async () => Response.json(data)), /garanzia atomica/);
  }
});

test("redirect and incomplete success retain uncertain outcome without retry", async () => {
  for (const response of [new Response(null, { status: 302, headers: { location: 'https://other.example/' } }), Response.json({ ok: true }), Response.json(null)]) {
    let calls = 0;
    await assert.rejects(atomicWordPressWrite(new URL('https://example.it/'), {}, {}, async () => { calls++; return response; }), error => error.code === 'ATOMIC_RESULT_UNVERIFIED');
    assert.equal(calls, 1);
  }
});

test("missing Connector route is a denial, not a standard REST fallback", async () => {
  await assert.rejects(atomicWordPressWrite(new URL('https://example.it/'), {}, {}, async () => Response.json({ code: 'rest_no_route' }, { status: 404 })), error => error.code === 'ATOMIC_WRITE_UNAVAILABLE');
});

test('atomic flags alone cannot prove persistence of the requested entity and field', async () => {
  const payload = { resource: 'pages', id: 12, changes: { title: 'New' }, expectedCurrent: { title: 'Old' }, operation: 'apply' };
  for (const entity of [{ id: 13, title: { raw: 'New' } }, { id: 12, title: { raw: 'Old' } }, { id: 12, title: { rendered: 'New' } }]) {
    await assert.rejects(atomicWordPressWrite(new URL('https://example.it/'), {}, payload, async () => Response.json({ ok: true, atomicGuaranteed: true, staleChecked: true, entity })), error => error.code === 'ATOMIC_RESULT_UNVERIFIED');
  }
});

test('proven single-row CAS success is accepted for posts and pages', async () => {
  for (const resource of ['posts', 'pages']) {
    const payload = {
      resource,
      id: 12,
      changes: { title: 'New title', content: 'New body' },
      expectedCurrent: { title: 'Old title', content: 'Old body' },
      operation: 'apply',
    };
    const result = await atomicWordPressWrite(new URL('https://example.it/'), {}, payload, async () => Response.json({
      ok: true,
      atomicGuaranteed: true,
      staleChecked: true,
      entity: {
        id: 12,
        title: { raw: 'New title' },
        content: { raw: 'New body' },
        excerpt: { raw: '' },
      },
    }));
    assert.equal(result.ok, true);
    assert.equal(result.entity.id, 12);
  }
});
