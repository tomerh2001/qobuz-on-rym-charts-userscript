import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

import {
  applyQobuzFilter,
  formatStatusText,
  getChartItems,
  initQobuzChartFilter,
  isSupportedChartPath,
  itemHasQobuzLink,
  readToggleState,
  writeToggleState,
} from '../src/chart.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(rootDir, 'tests', 'fixtures', 'charts', 'top', 'album', 'all-time', 'index.html');

async function loadFixture(url = 'https://rateyourmusic.com/charts/top/album/all-time/') {
  const html = await readFile(fixturePath, 'utf8');
  return new JSDOM(html, {
    url,
    pretendToBeVisual: true,
  });
}

test('isSupportedChartPath only enables the script on chart URLs', () => {
  assert.equal(isSupportedChartPath('/charts/top/album/all-time/'), true);
  assert.equal(isSupportedChartPath('/release/album/james-blake/trying-times/'), false);
});

test('itemHasQobuzLink detects Qobuz links inside chart cards', async () => {
  const dom = await loadFixture();
  const items = getChartItems(dom.window.document);

  assert.equal(itemHasQobuzLink(items[0]), true);
  assert.equal(itemHasQobuzLink(items[1]), false);
  assert.equal(itemHasQobuzLink(items[2]), true);
  assert.equal(itemHasQobuzLink(items[3]), false);
});

test('applyQobuzFilter hides non-Qobuz chart entries and renders a toggle button summary', async () => {
  const dom = await loadFixture();
  const doc = dom.window.document;
  const summary = applyQobuzFilter(doc, true);

  assert.deepEqual(summary, {
    total: 4,
    matches: 2,
    shown: 2,
    hidden: 2,
  });

  assert.equal(doc.getElementById('qobuz-entry').style.display, '');
  assert.equal(doc.getElementById('open-qobuz-entry').style.display, '');
  assert.equal(doc.getElementById('spotify-only-entry').style.display, 'none');
  assert.equal(doc.getElementById('no-links-entry').style.display, 'none');

  const status = doc.querySelector('[data-qobuz-chart-filter-status]');
  assert.ok(status);
  assert.equal(status.tagName, 'BUTTON');
  assert.equal(status.textContent, formatStatusText(summary, true));
});

test('applyQobuzFilter leaves all chart entries visible when filtering is off', async () => {
  const dom = await loadFixture();
  const doc = dom.window.document;
  const summary = applyQobuzFilter(doc, false);

  assert.deepEqual(summary, {
    total: 4,
    matches: 2,
    shown: 4,
    hidden: 0,
  });

  assert.equal(doc.getElementById('spotify-only-entry').style.display, '');
  assert.equal(doc.getElementById('no-links-entry').style.display, '');
  assert.equal(
    doc.querySelector('[data-qobuz-chart-filter-status]').textContent,
    formatStatusText(summary, false),
  );
});

test('readToggleState and writeToggleState persist the filter preference', async () => {
  const dom = await loadFixture();

  assert.equal(readToggleState(dom.window), true);

  writeToggleState(false, dom.window);
  assert.equal(readToggleState(dom.window), false);

  writeToggleState(true, dom.window);
  assert.equal(readToggleState(dom.window), true);
});

test('initQobuzChartFilter applies immediately on supported chart fixtures and toggles on click', async () => {
  const dom = await loadFixture();
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;

  try {
    const observer = initQobuzChartFilter({
      doc: dom.window.document,
      locationObject: dom.window.location,
    });

    await new Promise(resolve => dom.window.requestAnimationFrame(resolve));

    assert.ok(observer);
    assert.equal(dom.window.document.getElementById('spotify-only-entry').style.display, 'none');

    dom.window.document.querySelector('[data-qobuz-chart-filter-status]').click();
    assert.equal(dom.window.document.getElementById('spotify-only-entry').style.display, '');
    assert.equal(readToggleState(dom.window), false);

    observer.disconnect();
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MutationObserver;
  }
});
