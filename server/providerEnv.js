import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "dotenv";

const OPENAI_KEY = "OPENAI_API_KEY";
const providerKeys = (source) => Object.keys(source || {}).filter((key) => /^OPENAI_/.test(key));

const readEnv = (filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return parse(fs.readFileSync(filePath));
  } catch {
    return null;
  }
};

const candidateEnvFiles = ({ cwd, home, sharedEnv }) => {
  const candidates = [];
  if (sharedEnv) candidates.push(sharedEnv);
  const base = path.basename(cwd);
  if (base.endsWith("-preview")) {
    candidates.push(path.join(path.dirname(cwd), base.slice(0, -"-preview".length), ".env"));
  }
  candidates.push(path.join(home, "SeoGrow-AI", ".env"));
  return [...new Set(candidates.map((value) => path.resolve(value)))];
};

export function hydrateLocalProviderEnv({
  cwd = process.cwd(),
  home = os.homedir(),
  env = process.env,
  sharedEnv = process.env.SEOGROW_SHARED_ENV || "",
} = {}) {
  const localPath = path.resolve(cwd, ".env");
  const local = readEnv(localPath) || {};
  for (const key of providerKeys(local)) {
    if (!env[key]) env[key] = local[key];
  }
  if (env[OPENAI_KEY]) return { configured: true, source: "local-env", imported: false };

  for (const filePath of candidateEnvFiles({ cwd, home, sharedEnv })) {
    if (filePath === localPath) continue;
    const source = readEnv(filePath);
    if (!source?.[OPENAI_KEY]) continue;
    for (const key of providerKeys(source)) {
      if (!env[key]) env[key] = source[key];
    }
    return { configured: Boolean(env[OPENAI_KEY]), source: filePath, imported: true };
  }

  return { configured: false, source: "", imported: false };
}
