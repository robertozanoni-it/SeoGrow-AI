import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { prepareWorkspaceRestore } from '../src/workspaceRestore.js';
const root = new URL('../qa/workspace/', import.meta.url);
await mkdir(root, { recursive: true });
const timestamp = '2026-09-06T12:00:00.000Z';
const manifests = {};
for (const [label, firstId] of [['A', 9101], ['B', 9201]]) {
  const clients = [firstId, firstId + 1].map((id, i) => ({ id, name: `QA ${label} cliente ${i + 1} — FITTIZIO`, url: `https://qa-${label.toLowerCase()}-${i + 1}.example/` }));
  const backup = {
    schemaVersion: 4, exportedAt: timestamp, selectedClient: firstId, clients,
    tasks: clients.map(client => ({ id: `qa-${label}-${client.id}`, title: `QA ${label}: controllare titolo fittizio`, status: 'Da fare', priority: 'Media', sourceClientId: client.id, sourceUrl: client.url })),
    gscData: {}, gscHistory: {}, rankings: {}, topicalMaps: {}, geoData: {}, contentDrafts: {}, wordpressProfiles: {}, auditResults: {}, preferences: {},
    analyses: {}, pageAuditHistory: {}, agentRuns: {},
    corrections: clients.map(client => ({ id: `correction-${label}-${client.id}`, batchId: `batch-${label}`, clientId: client.id, issueLabel: `QA ${label} titolo — dati simulati`, sourceUrl: client.url, fields: ['title'], before: { title: `Prima ${label}` }, after: { title: `Dopo ${label}` }, status: 'Bloccato', writeConfirmed: false, frontendConfirmed: false, appliedAt: timestamp, verificationNote: 'Fixture: nessuna scrittura WordPress eseguita.' })),
  };
  for (const client of clients) {
    const audit = { url: client.url, createdAt: timestamp, timestamp, source: 'qa-fixture', complete: false, issues: [], reviewItems: [], pages: [], pagesChecked: 0, note: 'Dati di collaudo fittizi, nessun crawl eseguito.' };
    backup.analyses[client.id] = [audit];
    backup.pageAuditHistory[client.id] = [{ ...audit }];
    backup.agentRuns[client.id] = [{ id: `run-${label}-${client.id}`, projectId: client.id, goal: `QA ${label} — simulazione annullata`, status: 'CANCELLED', createdAt: timestamp, observations: [], recommendations: [], approvalHistory: [], plan: { steps: [] }, pendingApproval: null }];
  }
  const prepared = await prepareWorkspaceRestore(backup);
  const manifest = { workspace: Object.fromEntries([...prepared.entries].sort(([a], [b]) => a.localeCompare(b))), corrections: prepared.corrections.toSorted((a, b) => a.id.localeCompare(b.id)) };
  const content = JSON.stringify(backup, null, 2) + '\n';
  await writeFile(new URL(`backup-${label}.json`, root), content);
  await writeFile(new URL(`expected-${label}.json`, root), JSON.stringify(manifest, null, 2) + '\n');
  manifests[label] = { sha256: createHash('sha256').update(content).digest('hex'), clients: clients.map(c => c.id), corrections: prepared.corrections.length, workspaceKeys: prepared.entries.size };
  if (label === 'A') {
    await writeFile(new URL('invalid-duplicate-client.json', root), JSON.stringify({ ...backup, clients: [clients[0], clients[0]] }, null, 2) + '\n');
    await writeFile(new URL('invalid-schema.json', root), JSON.stringify({ ...backup, schemaVersion: 999 }, null, 2) + '\n');
  }
}
await writeFile(new URL('manifest.json', root), JSON.stringify(manifests, null, 2) + '\n');
console.log('A/B validati con il validatore applicativo; manifest e due casi invalidi generati. Nessun browser o sito modificato.');
