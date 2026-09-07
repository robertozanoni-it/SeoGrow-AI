import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

for (const name of ["e2e", "postwrite-sampler"]) {
  test(`taxonomy ${name}: authenticated Connector cannot fall back to generic fetch`, async () => {
    const source = await readFile(new URL(`../scripts/wordpress-taxonomy-${name}.mjs`, import.meta.url), "utf8");
    assert.match(source, /import \{ pinnedHttpsFetch \} from "\.\.\/server\/pinnedHttpsFetch\.js"/);
    assert.match(source, /await pinnedHttpsFetch\(endpoint,/);
    assert.doesNotMatch(source, /\b(?:fetch|nativeFetch)\(endpoint,/);
    assert.match(source, /redirect: "manual",\s*signal: AbortSignal.timeout\(20_000\)/);
  });
}

for (const blocked of [false, true]) {
  test(`postwrite sampler isolates transports and fails closed: blocked=${blocked}`, () => {
    const program = `
      import assert from 'node:assert/strict';
      import { mock } from 'node:test';
      const blocked = ${blocked};
      let pinned = 0, local = 0, frontend = 0;
      globalThis.setTimeout = fn => { queueMicrotask(fn); return 0; };
      mock.module(${JSON.stringify(new URL("../server/pinnedHttpsFetch.js", import.meta.url).href)}, {
        namedExports: { pinnedHttpsFetch: async (url, options) => {
          pinned++;
          assert.equal(new URL(url).pathname, '/wp-json/seogrow/v1/taxonomy-diagnostics');
          assert.match(options.headers.authorization, /^Basic /);
          assert.equal(options.redirect, 'manual');
          assert.ok(options.signal instanceof AbortSignal);
          if (blocked) throw new Error('Indirizzo remoto non pubblico.');
          return Response.json({readOnly:true,writesPerformed:0,resource:'taxonomy-diagnostics',
            meta:{rank_math_description:{apiValue:'original',dbRows:[{value:'original'}],cache:{values:['original']}}}});
        }}
      });
      const { runPostWriteSampler } = await import(${JSON.stringify(new URL("../scripts/wordpress-taxonomy-postwrite-sampler.mjs", import.meta.url).href)});
      const nativeFetch = async (url, options) => {
        assert.equal(options.headers.authorization, undefined);
        assert.ok(!String(url).includes('/wp-json/'));
        if (String(url).startsWith('http://127.0.0.1:5176/')) {
          local++;
          return Response.json({seo:{rankMath:{meta_description:'original'}}});
        }
        frontend++;
        return new Response('<meta name="description" content="original">');
      };
      const pending = runPostWriteSampler({nativeFetch,appUrl:'http://127.0.0.1:5176',siteUrl:'https://example.test',
        username:'test',applicationPassword:'test',targetUrl:'https://example.test/category/test/',original:'original'});
      if (blocked) {
        await assert.rejects(pending, /non pubblico/);
        assert.equal(pinned, 1);
      } else {
        const result = await pending;
        assert.equal(result.samples.length, 3);
        assert.equal(pinned, 3); assert.equal(local, 3); assert.equal(frontend, 3);
        assert.equal(result.classification.code, 'POSTWRITE_ORIGINAL_RESTORED');
      }
    `;
    const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--input-type=module", "-e", program], { encoding: "utf8", timeout: 10_000 });
    assert.equal(result.status, 0, result.stderr + result.stdout);
  });
}
