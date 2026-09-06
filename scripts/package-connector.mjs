import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
const root = new URL('../wordpress-plugin/seogrow-connector/',import.meta.url);
const loader = await readFile(new URL('seogrow-connector.php',root),'utf8');
const version = loader.match(/Version:\s*([\d.]+)/)?.[1];
if(!version) throw new Error('Missing Connector version');
const required = [...loader.matchAll(/require_once __DIR__ \. '\/([^']+)'/g)].map(m=>m[1]);
const names = (await readdir(root)).filter(n=>/\.(php|inc)$/.test(n)).sort();
for(const file of required) if(!names.includes(file)) throw new Error(`Missing required module: ${file}`);
const zip = new JSZip();
const manifest = {version,files:{}};
for(const name of names) {
  const bytes=await readFile(new URL(name,root));
  zip.file(`seogrow-connector/${name}`,bytes);
  manifest.files[name]=createHash('sha256').update(bytes).digest('hex');
}
zip.file('seogrow-connector/build-manifest.json',JSON.stringify(manifest,null,2));
const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
const check=await JSZip.loadAsync(bytes);
for(const [name,sha] of Object.entries(manifest.files)) {
  const extracted=await check.file(`seogrow-connector/${name}`).async('nodebuffer');
  if(createHash('sha256').update(extracted).digest('hex')!==sha) throw new Error(`ZIP integrity failed: ${name}`);
}
await mkdir('artifacts',{recursive:true});
await writeFile(`artifacts/seogrow-connector-${version}.zip`,bytes);
console.log(`Connector ${version}: ${names.length} files verified, all loader modules included.`);
