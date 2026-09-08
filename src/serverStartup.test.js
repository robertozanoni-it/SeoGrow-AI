import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
test("occupied API port exits nonzero and never announces a healthy server", async () => {
  const holder = net.createServer();
  await new Promise((resolve, reject) => { holder.once("error", reject); holder.listen(0, "127.0.0.1", resolve); });
  try {
    await assert.rejects(exec(process.execPath, ["server/index.js"], { cwd: new URL("../", import.meta.url), env: { ...process.env, PORT: String(holder.address().port), HOST: "127.0.0.1" }, timeout: 15000 }), error => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /porta .* già occupata/);
      assert.doesNotMatch(error.stdout, /API locale disponibile/);
      return true;
    });
  } finally { await new Promise(resolve => holder.close(resolve)); }
});
