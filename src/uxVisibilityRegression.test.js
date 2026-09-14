import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const progressSource = await readFile(new URL('./AnalysisProgress.jsx', import.meta.url), 'utf8');
const guidedSource = await readFile(new URL('./GuidedUxLayer.jsx', import.meta.url), 'utf8');
const resolutionCss = await readFile(new URL('./ProblemResolutionPage.css', import.meta.url), 'utf8');

test('site audit progress starts in an active indeterminate state', () => {
  assert.match(progressSource, /const indeterminate = !state \|\| state\.discovering;/);
  assert.match(progressSource, /value=\{indeterminate \? undefined : done\}/);
  assert.doesNotMatch(progressSource, /value=\{state\?\.discovering \? 0 : done\}/);
});

test('overview surfaces audit problems even when active tasks exist', () => {
  const problemAction = guidedSource.indexOf('problemi nell\'ultimo audit');
  const taskAction = guidedSource.indexOf('task aperte');
  assert.ok(problemAction >= 0, 'problem action must exist');
  assert.ok(taskAction >= 0, 'task action must exist');
  assert.ok(problemAction < taskAction, 'audit problems must be evaluated before task actions');
  assert.doesNotMatch(guidedSource, /if \(activeTasks\.length\)[\s\S]{0,500}else if \(!analysis\)/);
});

test('problem resolution desktop layout has two total columns', () => {
  assert.match(resolutionCss, /\.problem-resolution-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(320px, 380px\);/);
  assert.match(resolutionCss, /\.problem-resolution-content\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.doesNotMatch(resolutionCss, /\.problem-resolution-content\s*\{[\s\S]{0,180}?repeat\(2/);
});
