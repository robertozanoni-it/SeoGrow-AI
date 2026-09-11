// Shared by the browser download and its ZIP integrity regression tests.
export async function buildConnectorArchive(modules) {
  const sources = {};
  for (const [path, load] of Object.entries(modules)) {
    const name = path.split("/").at(-1);
    if (!/^[a-z0-9-]+\.(?:php|inc)$/i.test(name) || sources[name] !== undefined) throw new Error("Nome modulo Connector non valido o duplicato.");
    sources[name] = typeof load === "function" ? await load() : load;
    if (typeof sources[name] !== "string" || !sources[name].trim()) throw new Error(`Modulo Connector vuoto: ${name}`);
  }
  const main = sources["seogrow-connector.php"] || "";
  const version = main.match(/Version:\s*([\d.]+)/)?.[1];
  if (!version) throw new Error("Versione del Connector non disponibile.");
  for (const source of Object.values(sources)) {
    for (const match of source.matchAll(/require_once\s+__DIR__\s*\.\s*['"]\/([^'"]+)['"]/g)) {
      if (!sources[match[1]]) throw new Error(`Pacchetto incompleto: manca ${match[1]}. Nessuno ZIP è stato scaricato.`);
    }
  }
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const manifest = { version, files: {} };
  for (const name of Object.keys(sources).sort()) {
    zip.file(`seogrow-connector/${name}`, sources[name]);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sources[name]));
    manifest.files[name] = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  }
  zip.file("seogrow-connector/build-manifest.json", JSON.stringify(manifest, null, 2));
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const check = await JSZip.loadAsync(bytes);
  for (const [name, source] of Object.entries(sources)) {
    if (await check.file(`seogrow-connector/${name}`)?.async("string") !== source) throw new Error(`ZIP non integro: ${name}`);
  }
  return { bytes, version, fileCount: Object.keys(sources).length };
}
