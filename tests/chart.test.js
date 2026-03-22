import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM, VirtualConsole } from 'jsdom';

import {
  applyQobuzFilter,
  formatStatusText,
  getChartItems,
  initQobuzChartFilter,
  isSupportedChartPath,
  itemHasSupportedLink,
  readToggleState,
  scanChartItemsForQobuz,
  writeToggleState,
} from '../src/chart.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(rootDir, 'tests', 'fixtures', 'charts', 'top', 'album', 'all-time', 'index.html');

async function loadFixture(url = 'https://rateyourmusic.com/charts/top/album/all-time/') {
  const html = await readFile(fixturePath, 'utf8');
  const virtualConsole = new VirtualConsole();

  return new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    virtualConsole,
  });
}

async function waitFor(predicate, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 20));
  }

  throw new Error('Timed out waiting for condition');
}

test('isSupportedChartPath only enables the script on chart URLs', () => {
  assert.equal(isSupportedChartPath('/charts/top/album/all-time/'), true);
  assert.equal(isSupportedChartPath('/release/album/james-blake/trying-times/'), false);
});

test('itemHasSupportedLink detects Qobuz and Tidal links inside chart cards', async () => {
  const dom = await loadFixture();
  const items = getChartItems(dom.window.document);

  assert.equal(itemHasSupportedLink(items[0]), true);
  assert.equal(itemHasSupportedLink(items[1]), false);
  assert.equal(itemHasSupportedLink(items[2]), true);
  assert.equal(itemHasSupportedLink(items[3]), true);
  assert.equal(itemHasSupportedLink(items[4]), false);
});

test('applyQobuzFilter hides entries without Qobuz or Tidal links and renders a toggle button summary', async () => {
  const dom = await loadFixture();
  const doc = dom.window.document;
  const summary = applyQobuzFilter(doc, true);

  assert.deepEqual(summary, {
    total: 5,
    matches: 3,
    shown: 3,
    hidden: 2,
  });

  assert.equal(doc.getElementById('qobuz-entry').style.display, '');
  assert.equal(doc.getElementById('open-qobuz-entry').style.display, '');
  assert.equal(doc.getElementById('tidal-entry').style.display, '');
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
    total: 5,
    matches: 3,
    shown: 5,
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

test('scanChartItemsForQobuz can trigger lazy-loaded qobuz links by scanning the chart', async () => {
  const dom = await loadFixture();
  const doc = dom.window.document;
  const lazyItem = doc.getElementById('spotify-only-entry');
  const mediaLinks = lazyItem.querySelector('.page_charts_section_charts_item_info');
  const lazyQobuzLink = doc.createElement('a');
  lazyQobuzLink.href = 'https://open.qobuz.com/album/lazy-loaded-link';
  lazyQobuzLink.textContent = 'Lazy Qobuz';

  Object.defineProperty(doc.documentElement, 'scrollHeight', {
    configurable: true,
    value: 2600,
  });
  Object.defineProperty(dom.window, 'innerHeight', {
    configurable: true,
    value: 900,
  });

  const scrollTargets = [];
  dom.window.scrollTo = (_x, y) => {
    scrollTargets.push(y);
    if (y >= 1200 && !mediaLinks.querySelector('a[href*="qobuz.com"]')) {
      mediaLinks.append(lazyQobuzLink);
    }
  };

  const summary = await scanChartItemsForQobuz({
    doc,
    view: dom.window,
    settleMs: 0,
    maxSteps: 8,
  });

  assert.equal(itemHasSupportedLink(lazyItem), true);
  assert.equal(summary.matches, 4);
  assert.equal(summary.total, 5);
  assert.ok(scrollTargets.includes(765));
  assert.ok(scrollTargets.includes(1530));
});

test('initQobuzChartFilter applies immediately on supported chart fixtures and toggles on click', async () => {
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    jsdomErrors.push(error);
  });
  const html = await readFile(fixturePath, 'utf8');
  const dom = new JSDOM(html, {
    url: 'https://rateyourmusic.com/charts/top/album/all-time/',
    pretendToBeVisual: true,
    virtualConsole,
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;

  try {
    const observer = initQobuzChartFilter({
      doc: dom.window.document,
      locationObject: dom.window.location,
    });

    await waitFor(
      () => !dom.window.document.querySelector('[data-qobuz-chart-filter-status]').textContent.includes('scanning'),
    );

    assert.ok(observer);
    assert.equal(dom.window.document.getElementById('spotify-only-entry').style.display, 'none');

    dom.window.document.querySelector('[data-qobuz-chart-filter-status]').click();
    assert.equal(dom.window.document.getElementById('spotify-only-entry').style.display, '');
    assert.equal(readToggleState(dom.window), false);

    observer.disconnect();
    assert.deepEqual(jsdomErrors, []);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MutationObserver;
  }
});

test('initQobuzChartFilter does not rescan after toggling off and back on once the page was already scanned', async () => {
  const dom = await loadFixture();
  const doc = dom.window.document;

  Object.defineProperty(doc.documentElement, 'scrollHeight', {
    configurable: true,
    value: 2600,
  });
  Object.defineProperty(dom.window, 'innerHeight', {
    configurable: true,
    value: 900,
  });

  const scrollTargets = [];
  dom.window.scrollTo = (_x, y) => {
    scrollTargets.push(y);
  };

  globalThis.window = dom.window;
  globalThis.document = doc;
  globalThis.MutationObserver = dom.window.MutationObserver;

  try {
    const observer = initQobuzChartFilter({
      doc,
      locationObject: dom.window.location,
    });

    await waitFor(
      () => !doc.querySelector('[data-qobuz-chart-filter-status]').textContent.includes('scanning'),
    );

    assert.ok(scrollTargets.length > 0);

    const statusButton = doc.querySelector('[data-qobuz-chart-filter-status]');
    scrollTargets.length = 0;

    statusButton.click();
    assert.equal(doc.getElementById('spotify-only-entry').style.display, '');

    statusButton.click();
    assert.equal(doc.getElementById('spotify-only-entry').style.display, 'none');
    assert.deepEqual(scrollTargets, []);

    observer.disconnect();
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MutationObserver;
  }
});

test('initQobuzChartFilter refreshes when a qobuz link is added inside an existing chart item', async () => {
  const dom = await loadFixture();
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;

  try {
    const observer = initQobuzChartFilter({
      doc: dom.window.document,
      locationObject: dom.window.location,
    });

    await waitFor(
      () => !dom.window.document.querySelector('[data-qobuz-chart-filter-status]').textContent.includes('scanning'),
    );

    const hiddenItem = dom.window.document.getElementById('spotify-only-entry');
    assert.equal(hiddenItem.style.display, 'none');

    const lateQobuzLink = dom.window.document.createElement('a');
    lateQobuzLink.href = 'https://open.qobuz.com/album/late-added-link';
    lateQobuzLink.textContent = 'Late Qobuz';
    hiddenItem.querySelector('.page_charts_section_charts_item_info').append(lateQobuzLink);

    await waitFor(() => hiddenItem.style.display === '');

    observer.disconnect();
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MutationObserver;
  }
});

test('initQobuzChartFilter does not queue a second full scan for observer updates during an active scan', async () => {
  const dom = await loadFixture();
  const doc = dom.window.document;
  const lazyItem = doc.getElementById('spotify-only-entry');
  const mediaLinks = lazyItem.querySelector('.page_charts_section_charts_item_info');

  Object.defineProperty(doc.documentElement, 'scrollHeight', {
    configurable: true,
    value: 2600,
  });
  Object.defineProperty(dom.window, 'innerHeight', {
    configurable: true,
    value: 900,
  });

  const scrollTargets = [];
  dom.window.scrollTo = (_x, y) => {
    scrollTargets.push(y);
    if (y >= 1200 && !mediaLinks.querySelector('a[href*="qobuz.com"]')) {
      const lateQobuzLink = doc.createElement('a');
      lateQobuzLink.href = 'https://open.qobuz.com/album/observer-during-scan';
      lateQobuzLink.textContent = 'Observer During Scan';
      mediaLinks.append(lateQobuzLink);
    }
  };

  globalThis.window = dom.window;
  globalThis.document = doc;
  globalThis.MutationObserver = dom.window.MutationObserver;

  try {
    const observer = initQobuzChartFilter({
      doc,
      locationObject: dom.window.location,
    });

    await waitFor(
      () => !doc.querySelector('[data-qobuz-chart-filter-status]').textContent.includes('scanning'),
    );

    observer.disconnect();
    assert.equal(itemHasSupportedLink(lazyItem), true);
    assert.equal(lazyItem.style.display, '');
    assert.deepEqual(scrollTargets, [765, 1530, 1700, 1700, 0]);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MutationObserver;
  }
});
