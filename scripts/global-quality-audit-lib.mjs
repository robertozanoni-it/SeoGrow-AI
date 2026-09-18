const STORAGE_OPERATION = /\blocalStorage\.(?:getItem|setItem|removeItem)\b/g;
const WORKSPACE_ALIAS = /import\s*\{\s*workspaceStorage\s+as\s+localStorage\s*\}\s*from\s*["'][^"']*workspaceDatabase(?:\.js)?["']/;

const normalizePath = (value) => String(value || "").replaceAll("\\", "/");

export function classifyLocalStorageOperations(file, source) {
  const normalizedFile = normalizePath(file);
  const text = String(source || "");
  const operations = [...text.matchAll(STORAGE_OPERATION)].map((match) => ({
    file: normalizedFile,
    match: match[0],
    index: match.index ?? -1,
  }));
  if (!operations.length) return {
    canonicalAlias: [],
    nativeBoundary: [],
    nativeBypass: [],
  };

  if (WORKSPACE_ALIAS.test(text)) return {
    canonicalAlias: operations,
    nativeBoundary: [],
    nativeBypass: [],
  };

  if (normalizedFile === "src/workspaceDatabase.js" || normalizedFile.endsWith("/src/workspaceDatabase.js")) return {
    canonicalAlias: [],
    nativeBoundary: operations,
    nativeBypass: [],
  };

  return {
    canonicalAlias: [],
    nativeBoundary: [],
    nativeBypass: operations,
  };
}

export function summarizeLocalStorageOperations(files) {
  const summary = {
    canonicalAlias: [],
    nativeBoundary: [],
    nativeBypass: [],
  };
  for (const entry of files || []) {
    const classified = classifyLocalStorageOperations(entry.file, entry.source);
    summary.canonicalAlias.push(...classified.canonicalAlias);
    summary.nativeBoundary.push(...classified.nativeBoundary);
    summary.nativeBypass.push(...classified.nativeBypass);
  }
  return summary;
}
