import assert from "node:assert/strict";

// Scenarios operate on the existing real-browser profile, never on user data.
export async function runBrowserMatrix({ evaluate, waitFor, command, clickSidebar, reload, record, screenshot, mode }) {
  const tasks = () => evaluate("(async () => { const m = await import('/src/workspaceDatabase.js'); return JSON.parse(m.workspaceStorage.getItem('seogrow-tasks-v2') || '[]'); })()");
  const persisted = async (condition) => {
    await waitFor("(async () => { const m = await import('/src/workspaceDatabase.js'); const tasks = JSON.parse(m.workspaceStorage.getItem('seogrow-tasks-v2') || '[]'); return " + condition + "; })()", "task state persisted");
    await evaluate("(async () => { const m = await import('/src/workspaceDatabase.js'); await m.flushWorkspace(); })()");
  };
  const select = (selector, value) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('Missing select'); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const input = (selector, value) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('Missing input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const click = async text => {
    const target = `[...(document.querySelector('[role=dialog]') || document).querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)} && !e.disabled)`;
    await waitFor(target, `Enabled button: ${text}`);
    await evaluate(`(${target}).click()`);
  };
  // Existing table does not need test-only markup: labelled status select is unambiguous.
  const status = '[aria-label^="Stato della task"]';
  await clickSidebar("Task");
  await waitFor("document.querySelector('.task-filters')", "Task ready");
  const original = (await tasks()).find(task => task.query === "yoga");
  assert.ok(original, "Opportunity fixture must have a task");
  const id = JSON.stringify(original.id);

  await record("TASK-001", async () => {
    await select('.task-filters select', 'Da fare');
    await select(status, 'In corso');
    await waitFor("!document.querySelector('[aria-label^=\"Stato della task\"]')", "task excluded by Da fare");
    await persisted(`tasks.some(t => t.id === ${id} && t.status === 'In corso')`);
    await select('.task-filters select', 'In corso');
    await waitFor("document.querySelector('[aria-label^=\"Stato della task\"]')?.value === 'In corso'", "task visible with matching filter");
    const current = await tasks();
    assert.equal(current.filter(t => t.id === original.id).length, 1);
    for (const key of ["title", "sourceUrl", "query", "notes", "sourceClientId"]) assert.equal(current.find(t => t.id === original.id)[key], original[key]);
  });
  await record("TASK-002", async () => {
    await click("Annulla ultima modifica task");
    await persisted(`tasks.some(t => t.id === ${id} && t.status === 'Da fare')`);
    await reload();
    await clickSidebar("Task");
    await waitFor("document.querySelector('.task-filters')", "task filters after reload");
    assert.equal((await tasks()).find(t => t.id === original.id).status, "Da fare");
    assert.equal(await evaluate("document.querySelector('.task-filters select').value"), "Tutti", "filters are session UI state");
  });
  await record("TASK-005", async () => {
    await select(status, "In corso");
    await waitFor("document.querySelector('[aria-label^=\"Stato della task\"]')?.value === 'In corso'", "first update");
    await select(status, "Completato");
    await persisted(`tasks.some(t => t.id === ${id} && t.status === 'Completato')`);
    await clickSidebar("Opportunità");
    await waitFor("document.querySelector('.opportunity-table button')?.textContent.trim() === 'Crea task'", "completed task no longer matches active opportunity");
    await clickSidebar("Task");
    await click("Annulla ultima modifica task");
    await persisted(`tasks.some(t => t.id === ${id} && t.status === 'In corso')`);
    await reload(); await clickSidebar("Task");
    assert.equal((await tasks()).find(t => t.id === original.id).status, "In corso");
  });

  await record("CRUD-001", async () => {
    await click("Nuova task");
    await waitFor("document.querySelector('.task-editor')", "new task modal");
    await input('.task-editor input', 'QA Manual');
    await evaluate("(() => { const form = document.querySelector('.task-editor'); form.requestSubmit(); form.requestSubmit(); })()");
    await persisted("tasks.some(t => t.title === 'QA Manual')");
    const manual = (await tasks()).find(t => t.title === "QA Manual");
    assert.equal((await tasks()).filter(t => t.title === "QA Manual").length, 1, "double submit creates one task");
    await evaluate("[...document.querySelectorAll('.task-title-button')].find(b => b.textContent.includes('QA Manual')).click()");
    await waitFor("document.querySelector('.task-editor')", "read manual task");
    await input('.task-editor input', 'QA Edited');
    await evaluate("document.querySelector('.task-editor').requestSubmit()");
    await persisted("tasks.some(t => t.title === 'QA Edited')");
    await reload(); await clickSidebar("Task");
    assert.equal((await tasks()).find(t => t.id === manual.id).title, "QA Edited");
    await evaluate("[...document.querySelectorAll('.task-title-button')].find(b => b.textContent.includes('QA Edited')).click()");
    await waitFor("document.querySelector('.task-editor')", "delete modal");
    // Only accepts the delete confirmation for our fixture.
    await evaluate("window.confirm = message => message === 'Eliminare questa task?'");
    await click("Elimina");
    await persisted(`!tasks.some(t => t.id === ${JSON.stringify(manual.id)})`);
    await click("Annulla ultima modifica task");
    await persisted(`tasks.some(t => t.id === ${JSON.stringify(manual.id)} && t.title === 'QA Edited')`);
  });

  await record("FILTER-006", async () => {
    await input('.task-filters input', 'QA Edited');
    await select('.task-filters select', 'In corso');
    await waitFor("document.querySelectorAll('.task-title-button').length === 0", "AND filter excludes mismatched status");
    await select('.task-filters select', 'Da fare');
    await waitFor("document.querySelectorAll('.task-title-button').length === 1", "AND filter finds task");
    await input('.task-filters input', '');
    await select('.task-filters select', 'Tutti');
  });

  if (mode !== "smoke") {
    await record("TASK-004", async () => {
      await evaluate("(async () => { const m = await import('/src/workspaceDatabase.js'); await m.flushWorkspace(); })()");
      const before = await tasks();
      // Hold the actual application transaction open. A fast reload alone can
      // happen before the debounced write starts and never exercise interruption.
      await evaluate(`(() => {
        const put = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function(value, key) {
          const result = put.call(this, value, key);
          if (this.name === 'workspace' && key === 'seogrow-tasks-v2' &&
              JSON.parse(value).some(t => t.status === 'In revisione')) {
            window.__qaWriteInFlight = true;
            const keepAlive = () => { const request = this.get(key); request.onsuccess = keepAlive; };
            keepAlive();
          }
          return result;
        };
      })()`);
      await select(status, "In revisione");
      await waitFor("window.__qaWriteInFlight === true", "native task write transaction is in flight before reload");
      await reload(); await clickSidebar("Task");
      const after = await tasks();
      assert.equal(after.length, before.length);
      assert.equal(new Set(after.map(t => t.id)).size, after.length);
      for (const task of after) {
        const old = before.find(t => t.id === task.id); assert.ok(old);
        assert.ok([old.status, "In revisione"].includes(task.status));
        for (const key of Object.keys(old).filter(key => !["status", "updatedAt"].includes(key))) assert.deepEqual(task[key], old[key]);
      }
    });
    await record("STORAGE-QUEUE-001", async () => {
      const before = await tasks();
      const result = await evaluate(`(async () => {
        const m = await import('/src/workspaceDatabase.js');
        await m.flushWorkspace();
        const before = m.workspaceStorage.getItem('seogrow-tasks-v2');
        const put = IDBObjectStore.prototype.put;
        let injected = false, rejected = false;
        IDBObjectStore.prototype.put = function(value, key) {
          if (key === 'seogrow-tasks-v2') { injected = true; throw new DOMException('QA quota failure', 'QuotaExceededError'); }
          return put.call(this, value, key);
        };
        try {
          const changed = JSON.parse(before).map(t => ({ ...t, notes: 'Uncommitted' }));
          m.workspaceStorage.setItem('seogrow-tasks-v2', JSON.stringify(changed));
          m.workspaceStorage.setItem('seogrow-qa-uncommitted', 'must disappear');
          try { await m.flushWorkspace(); } catch { rejected = true; }
          return { injected, rejected, same: m.workspaceStorage.getItem('seogrow-tasks-v2') === before,
            noPhantomKey: m.workspaceStorage.getItem('seogrow-qa-uncommitted') === null };
        } finally { IDBObjectStore.prototype.put = put; }
      })()`);
      assert.deepEqual(result, { injected: true, rejected: true, same: true, noPhantomKey: true });
      await waitFor("document.body.innerText.includes('non salvati')", "storage failure is visible, never a success");
      await reload(); await clickSidebar("Task");
      assert.deepEqual(await tasks(), before, "quota failure and reload preserve complete tasks");
    });
    await record("BACKUP-001", async () => {
      const result = await evaluate(`(async () => {
        const { exportWorkspaceBackup, readWorkspaceBackup } = await import('/src/seoHelpers.js');
        const { workspaceStorage } = await import('/src/workspaceDatabase.js');
        const tasks = JSON.parse(workspaceStorage.getItem('seogrow-tasks-v2'));
        const data = { schemaVersion: 4, clients: [{id: 9001, name: 'Browser QA', url: 'https://example.com/'}], tasks, gscData: {} };
        const originalURL = URL.createObjectURL, originalClick = HTMLAnchorElement.prototype.click;
        let blob;
        URL.createObjectURL = value => { blob = value; return originalURL.call(URL, value); };
        HTMLAnchorElement.prototype.click = function() {};
        try {
          await exportWorkspaceBackup(data, 'qa-passphrase-only');
          if (!blob) throw new Error('No exported backup');
          const restored = await readWorkspaceBackup(blob, 'qa-passphrase-only');
          let rejected = false;
          try { await readWorkspaceBackup(blob, 'wrong-password'); } catch { rejected = true; }
          return { same: JSON.stringify(restored.tasks) === JSON.stringify(tasks), rejected };
        } finally { URL.createObjectURL = originalURL; HTMLAnchorElement.prototype.click = originalClick; }
      })()`);
      assert.equal(result.same, true);
      assert.equal(result.rejected, true);
    });
    await record("ERROR-001", async () => {
      await clickSidebar("Integrazioni");
      for (const failure of ["400", "500", "offline", "invalid", "empty", "timeout"]) {
        await evaluate(`window.__qaFailureRequests = 0; window.__qaGoogleFailure = ${JSON.stringify(failure)}`);
        await click("Carica proprietà Google");
        await waitFor("[...document.querySelectorAll('button')].some(b => b.textContent.includes('Carica proprietà Google') && !b.disabled)", "error settles without infinite loading");
        await waitFor("window.__qaFailureRequests > 0 && document.querySelector('.integration-result')?.textContent.includes('Errore Google:')", "visible error " + failure);
        assert.equal((await tasks()).length, 2);
      }
      await evaluate("window.__qaGoogleFailure = null");
      await click("Carica proprietà Google");
      await waitFor("document.querySelector('[aria-label=\"Proprietà Search Console\"]')?.options.length === 20", "recovery after API failures");
    });
  }

  if (mode === "release") {
    await record("STRESS-500", async () => {
      const beforeStress = await tasks();
      await evaluate("(async () => { const m = await import('/src/workspaceDatabase.js'); const tasks = JSON.parse(m.workspaceStorage.getItem('seogrow-tasks-v2')); const generated = Array.from({length: 500}, (_, i) => ({ id: 'stress-' + i, title: 'Stress item ' + i, sourceClientId: i === 499 ? 9002 : 9001, client: 'Browser QA', status: 'Da fare', priority: 'Media', due: '', notes: 'Keep', kind: 'manual' })); const value = JSON.stringify([...tasks, ...generated]); m.workspaceStorage.setItem('seogrow-tasks-v2', value); await m.flushWorkspace(); window.dispatchEvent(new StorageEvent('storage', { key: 'seogrow-tasks-v2', newValue: value })); })()");
      await clickSidebar("Task");
      await input('.task-filters input', 'Stress item 498');
      await waitFor("document.querySelectorAll('.task-title-button').length === 1", "500 task search");
      await input('.task-filters input', 'Stress item 499');
      await waitFor("document.querySelectorAll('.task-title-button').length === 0", "other project task excluded");
      await input('.task-filters input', '');
      await persisted("tasks.length === 502");
      await reload(); await clickSidebar("Task");
      assert.equal((await tasks()).length, 502);
      assert.equal(new Set((await tasks()).map(t => t.id)).size, 502);
      // Do not turn every unrelated field scenario into another stress test.
      // The stress assertions above run on all 502 records before cleanup.
      await evaluate(`(async () => { const m = await import('/src/workspaceDatabase.js'); m.workspaceStorage.setItem('seogrow-tasks-v2', ${JSON.stringify(JSON.stringify(beforeStress))}); await m.flushWorkspace(); })()`);
      await reload(); await clickSidebar("Task");
      assert.deepEqual(await tasks(), beforeStress, "stress fixture cleanup restores the exact starting records");
    });
    await record("IDB-REAL-001", async () => {
      const valid = await evaluate(`(async () => {
        const { workspaceTransaction } = await import('/src/workspaceDatabase.js');
        const name = 'qa-disposable-atomic';
        const open = () => new Promise((resolve, reject) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => { r.result.createObjectStore('workspace'); r.result.createObjectStore('corrections'); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        let db = await open();
        await workspaceTransaction(db, tx => tx.objectStore('workspace').put({ id: 'stable', status: 'old', notes: 'keep' }, 'task'));
        let aborted = false;
        try { await workspaceTransaction(db, tx => { tx.objectStore('workspace').put({ id: 'stable', status: 'new', notes: 'new' }, 'task'); tx.abort(); }); } catch { aborted = true; }
        db.close(); db = await open();
        const value = await new Promise((resolve, reject) => { const tx = db.transaction('workspace'); const r = tx.objectStore('workspace').get('task'); tx.oncomplete = () => resolve(r.result); tx.onabort = () => reject(tx.error); });
        db.close(); indexedDB.deleteDatabase(name);
        return aborted && value.id === 'stable' && value.status === 'old' && value.notes === 'keep';
      })()`);
      assert.equal(valid, true);
    });
  }

  await record("RESPONSIVE-001", async () => {
    for (const width of [1440, 768, 390]) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
      await clickSidebar("Task");
      await waitFor("document.querySelector('.task-filters')", "task viewport");
      await screenshot("tasks-" + width);
      const geometry = await evaluate("({ overflow: document.documentElement.scrollWidth > innerWidth + 2, buttons: [...document.querySelectorAll('.task-title-button')].length })");
      assert.equal(geometry.overflow, false, "page horizontal overflow at " + width);
      assert.ok(geometry.buttons > 0);
      await evaluate("document.querySelector('.task-title-button').click()");
      await waitFor("document.querySelector('[role=dialog]')", "modal viewport");
      const dialog = await evaluate("(() => { const e = document.querySelector('[role=dialog]'); const r = e.getBoundingClientRect(); return { name: e.getAttribute('aria-labelledby'), left: r.left, right: r.right, width: innerWidth, focusInside: e.contains(document.activeElement), unlabelled: [...e.querySelectorAll('input,select,textarea')].filter(n => !n.labels?.length && !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')).length, unnamedButtons: [...e.querySelectorAll('button')].filter(n => !n.textContent.trim() && !n.getAttribute('aria-label')).length }; })()");
      assert.ok(dialog.name && dialog.focusInside);
      assert.equal(dialog.unlabelled, 0);
      assert.equal(dialog.unnamedButtons, 0);
      assert.ok(dialog.left >= -2 && dialog.right <= dialog.width + 2);
      await screenshot("task-modal-" + width);
      await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await waitFor("!document.querySelector('[role=dialog]')", "Escape closes modal");
    }
    await command("Emulation.clearDeviceMetricsOverride");
  });
}
