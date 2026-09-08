import { qaMatrix, requiredScenarios } from "./qa-matrix.mjs";
import { spawn, execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (!["smoke", "full", "release"].includes(mode)) throw new Error("Usage: qa-runner.mjs smoke|full|release");
const output = path.join(root, ".qa-runtime", "automation", mode);
await mkdir(output, { recursive: true });
const report = { mode, commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), startedAt: new Date().toISOString(), steps: [], ok: false };
const children = [];
let temporary;
async function run(name, args, cwd = root, env = process.env) {
  const started = Date.now();
  const log = path.join(output, name + ".log");
  let text = "";
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", value => { text += value; });
  child.stderr.on("data", value => { text += value; });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 120000);
  const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
  clearTimeout(timeout);
  await writeFile(log, text);
  report.steps.push({ name, exitCode: code, durationMs: Date.now() - started, log });
  console.log(name + ": " + (code === 0 ? "PASS" : "FAIL"));
  if (code !== 0) throw new Error(name + " failed: " + text.slice(-1800));
}
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer(); server.on("error", reject);
  server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(() => resolve(port)); });
});
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise(resolve => child.once("exit", resolve));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  await closed; clearTimeout(timer);
}
try {
  if (mode !== "smoke") {
    await run("lint", ["node_modules/eslint/bin/eslint.js", "."]);
    const tests = (await readdir(path.join(root, "src"))).filter(name => name.endsWith(".test.js")).sort().map(name => "src/" + name);
    await run("unit-integration-storage", ["--test", "--test-reporter=tap", ...tests]);
    const tap = await readFile(path.join(output, "unit-integration-storage.log"), "utf8");
    report.tests = Object.fromEntries(["tests", "pass", "fail", "skipped", "duration_ms"].map(key => [key, Number(tap.match(new RegExp("# " + key + " ([0-9.]+)"))?.[1])]));
    if (!report.tests.tests || report.tests.fail || report.tests.skipped) throw new Error("Incomplete or skipped Node test suite");
    await run("production-build", ["node_modules/vite/bin/vite.js", "build"]);
  }
  temporary = await mkdtemp(path.join(tmpdir(), "seogrow-qa-"));
  for (const entry of ["src", "server", "scripts", "wordpress-plugin", "public", "index.html", "package.json", "vite.config.js"]) {
    try { await cp(path.join(root, entry), path.join(temporary, entry), { recursive: true }); }
    catch (error) { if (error.code !== "ENOENT" || !["public", "vite.config.js"].includes(entry)) throw error; }
  }
  await symlink(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "dir");
  const apiPort = await freePort(), uiPort = await freePort();
  // Do not inherit credentials or read the user's dotenv file. Runtime files stay in the disposable copy.
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(), PORT: String(apiPort),
    APP_ORIGIN: "http://127.0.0.1:" + uiPort, APP_API_TOKEN: "qa-token-".repeat(8),
    CREDENTIAL_ENCRYPTION_KEY: "qa-key-".repeat(10), NODE_ENV: "development",
    QA_MODE: mode, QA_OUTPUT: output, CHROME_BIN: process.env.CHROME_BIN || "" };
  for (const [name, args] of [
    ["api", ["--import=" + path.join(temporary, "server/remediationBootstrap.js"), path.join(temporary, "server/index.js")]],
    ["vite", [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(uiPort), "--strictPort"]],
  ]) {
    const child = spawn(process.execPath, args, { cwd: temporary, env, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let logs = "";
    child.stdout.on("data", data => { logs += data; });
    child.stderr.on("data", data => { logs += data; });
    child.on("exit", () => { writeFile(path.join(output, name + ".log"), logs).catch(() => {}); });
  }
  const url = "http://127.0.0.1:" + uiPort + "/";
  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline) {
    if (children.some(child => child.exitCode !== null)) throw new Error("QA runtime exited before health check");
    try { const response = await fetch(url + "api/health", { signal: AbortSignal.timeout(700) }); if (response.ok && (await response.json()).ok === true) { ready = true; break; } } catch { /* poll bounded readiness */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("QA runtime health check failed");
  await run("browser", [path.join(temporary, "scripts/browser-smoke.mjs"), url], temporary, env);
  const browser = JSON.parse(await readFile(path.join(output, "browser-report.json"), "utf8"));
  if (!browser.ok || !browser.scenarios?.length) throw new Error("Browser matrix did not execute");
  for (const id of requiredScenarios(mode)) {
    if (!browser.scenarios.some(s => s.id === id && s.status === "PASS")) throw new Error("Required scenario did not pass: " + id);
  }
  report.matrix = qaMatrix;
  report.browser = browser;
  report.ok = true;
} catch (error) {
  report.error = error.message; process.exitCode = 1; console.error(error.message);
} finally {
  for (const child of children) await stop(child);
  if (temporary) await rm(temporary, { recursive: true, force: true, maxRetries: 5 });
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log("QA report: " + path.join(output, "report.json"));
}
