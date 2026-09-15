import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { LEGACY_AGENT_TOOL_CAPABILITIES } from "./intelligence/agent/legacyToolCapabilityMap.js";

const runtime = await readFile(new URL("./agentRuntime.js", import.meta.url), "utf8");

const registeredLegacyTools = () => [...runtime.matchAll(/readTool\("([^"]+)"/g)]
  .map((match) => match[1]);

test("ogni tool registrato nel runtime Agent corrente ha una capability Suite", () => {
  const registered = [...new Set(registeredLegacyTools())].sort();
  const mapped = Object.keys(LEGACY_AGENT_TOOL_CAPABILITIES).sort();
  assert.deepEqual(registered, mapped);
});

test("il runtime non introduce nomi capability Suite prima del compatibility adapter", () => {
  assert.doesNotMatch(runtime, /readTool\("(?:audit|rank|content|links|geo|publish):/);
});
