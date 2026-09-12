import { readFileSync, existsSync, lstatSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const here = dirname(fileURLToPath(import.meta.url));
const fail = message => { throw new Error(message); };
const hash = data => createHash('sha256').update(data).digest('hex');
try {
  if (!process.argv[2]) fail('Indica la cartella del repository SeoGrow-AI.');
  const folder = resolve(process.argv[2]);
  const git = (...args) => execFileSync('git', ['-C',folder,...args], { encoding:'utf8', stdio:['ignore','pipe','pipe'] }).trim();
  const root = resolve(git('rev-parse','--show-toplevel'));
  if(root!==folder) fail('Seleziona la cartella principale del repository, non una sottocartella.');
  const remote=git('remote','get-url','origin');
  if(!/^(https:\/\/github\.com\/|git@github\.com:)robertozanoni-it\/SeoGrow-AI(?:\.git)?\/?$/i.test(remote)) fail('Questo repository non corrisponde a robertozanoni-it/SeoGrow-AI.');
  if(git('status','--porcelain')) fail('Il repository contiene modifiche locali. Salvale prima con un commit; nessun file è stato sovrascritto.');
  const manifest=JSON.parse(readFileSync(join(here,'manifest.json'),'utf8'));
  const patch=join(here,'batch-remediation.patch');
  if(hash(readFileSync(patch))!==manifest.patchSha256) fail('Checksum della patch errato. Nessuna modifica applicata.');
  for(const entry of manifest.files) {
    const path=resolve(folder,entry.path), rel=relative(folder,path);
    if(!rel||rel.startsWith('..'+sep)||rel==='..'||!['src','server','scripts'].includes(rel.split(sep)[0])) fail('Percorso non autorizzato nel manifest.');
    let component=folder;
    for(const part of rel.split(sep)) {component=join(component,part);if(existsSync(component)&&lstatSync(component).isSymbolicLink()) fail('Symlink non ammesso nei file da aggiornare: '+entry.path);}
    if(entry.beforeSha256===null) {if(existsSync(path)) fail('File nuovo già esistente: '+entry.path);}
    else if(!existsSync(path)||hash(readFileSync(path))!==entry.beforeSha256) fail('Versione diversa da quella verificata: '+entry.path+'. Aggiornamento fermato senza sovrascrivere.');
  }
  git('apply','--check',patch);
  const stamp=new Date().toISOString().replace(/[-:.TZ]/g,'');
  const backup=join(dirname(folder),'SeoGrow-backup-prima-batch-'+stamp);
  mkdirSync(backup);
  for(const entry of manifest.files.filter(e=>e.beforeSha256)) {const target=join(backup,entry.path);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(folder,entry.path),target);}
  copyFileSync(join(here,'manifest.json'),join(backup,'manifest.json'));
  const branch='feat/batch-locale-'+stamp;
  git('switch','-c',branch);
  git('apply',patch);
  for(const entry of manifest.files) if(hash(readFileSync(join(folder,entry.path)))!==entry.afterSha256) fail('Controllo dopo applicazione fallito: '+entry.path+'. Backup: '+backup);
  console.log('\nAggiornamento applicato e checksum verificati.\nRamo locale: '+branch+'\nBackup: '+backup+'\n');
  console.log('Nessuna modifica a .env, credenziali, node_modules o siti WordPress. Nessun commit o push automatico.');
  console.log('\nRiavvia SeoGrow con AVVIA.command nella sua cartella. Prima di usare il batch su siti reali, completa il collaudo su staging.');
} catch(error) {console.error('\nAGGIORNAMENTO NON COMPLETATO: '+(error.stderr?.toString().trim()||error.message));process.exitCode=1;}
