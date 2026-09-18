import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const progressSource = await readFile(new URL('./AnalysisProgress.jsx', import.meta.url), 'utf8');
const overviewSource = await readFile(new URL('./OverviewDashboard.jsx', import.meta.url), 'utf8');
const intelligenceSource = await readFile(new URL('./projectIntelligence.js', import.meta.url), 'utf8');
const resolutionCss = await readFile(new URL('./ProblemResolutionPage.css', import.meta.url), 'utf8');

test('site audit progress starts in an active indeterminate state', () => {
  assert.match(progressSource, /const indeterminate = !state \|\| state\.discovering;/);
  assert.match(progressSource, /value=\{indeterminate \? undefined : done\}/);
  assert.doesNotMatch(progressSource, /value=\{state\?\.discovering \? 0 : done\}/);
});

test('overview surfaces audit problems even while the canonical summary is still loading', () => {
  assert.match(overviewSource, /fallbackProblemSummary/);
  assert.match(overviewSource, /active:\s*auditIssues\.length/);
  assert.match(overviewSource, /problemSummaryState\?\.key === summaryKey/);
  assert.match(intelligenceSource, /if \(criticalIssues\)[\s\S]*id: "critical"/);
  assert.match(intelligenceSource, /if \(highTasks\.length\)[\s\S]*id: "tasks"/);
});

test('problem resolution desktop layout has two total columns', () => {
  assert.match(resolutionCss, /\.problem-resolution-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(320px, 380px\);/);
  assert.match(resolutionCss, /\.problem-resolution-content\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.doesNotMatch(resolutionCss, /\.problem-resolution-content\s*\{[\s\S]{0,180}?repeat\(2/);
});
