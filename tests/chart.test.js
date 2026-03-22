import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM, VirtualConsole } from 'jsdom';

import {
  applyProviderFilter,
  formatStatusText,
  getChartItems,
  initChartProviderFilter,
  isSupportedChartPath,
  itemHasProviderLink,
  itemHasSupportedLink,
  readFilterMode,
  scanChartItemsForProviders,
  writeFilterMode,
} from '../src/chart.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(rootDir, 'tests', 'fixtures', 'charts', 'top', 'album', 'all-time', 'index.html');

function getControlsFrame(doc) {
  return doc.querySelector('iframe[data-qobuz-chart-filter-controls]');
}

function getControlsDoc(doc) {
  return getControlsFrame(doc)?.contentDocument ?? doc;
}

function getStatusElement(doc) {
  return getControlsDoc(doc).querySelector('[data-qobuz-chart-filter-status]');
}

function getProviderButton(doc, mode) {
  return getControlsDoc(doc).querySelector(`[data-qobuz-chart-filter-button="${mode}"]`);
}

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

test('itemHasProviderLink detects provider-specific links inside chart cards', async () => {
  const dom = await loadFixture();
  const items = getChartItems(dom.window.document);

  assert.equal(itemHasProviderLink(items[0], 'qobuz'), true);
  assert.equal(itemHasProviderLink(items[0], 'tidal'), false);
  assert.equal(itemHasProviderLink(items[2], 'qobuz'), true);
  assert.equal(itemHasProviderLink(items[3], 'tidal'), true);
  assert.equal(itemHasProviderLink(items[4], 'qobuz'), false);
  assert.equal(itemHasSupportedLink(items[3]), true);
  assert.equal(itemHasSupportedLink(items[4]), false);
});

test('applyProviderFilter hides entries without qobuz links in qobuz mode', async () => {
  const dom = await loadFixture();
  const doc = dom.window.document;
  const summary = applyProviderFilter(doc, 'qobuz');

  assert.deepEqual(summary, {
    total: 5,
    qobuzMatches: 2,
    tidalMatches: 1,
    shown: 2,
    hidden: 3,
  });

  assert.equal(doc.getElementById('qobuz-entry').style.display, '');
  assert.equal(doc.getElementById('open-qobuz-entry').style.display, '');
  assert.equal(doc.getElementById('tidal-entry').style.display, 'none');
  assert.equal(doc.getElementById('spotify-only-entry').style.display, 'none');
  assert.equal(doc.getElementById('no-links-entry').style.display, 'none');
  assert.equal(getStatusElement(doc).textContent, formatStatusText(summary, 'qobuz'));
});

test('applyProviderFilter hides entries without tidal links in tidal mode', async () => {
  const dom = await loadFixture();
  const doc = dom.window.document;
  const summary = applyProviderFilter(doc, 'tidal');

  assert.deepEqual(summary, {
    total: 5,
    qobuzMatches: 2,
    tidalMatches: 1,
    shown: 1,
    hidden: 4,
  });

  assert.equal(doc.getElementById('qobuz-entry').style.display, 'none');
  assert.equal(doc.getElementById('open-qobuz-entry').style.display, 'none');
  assert.equal(doc.getElementById('tidal-entry').style.display, '');
  assert.equal(doc.getElementById('spotify-only-entry').style.display, 'none');
  assert.equal(doc.getElementById('no-links-entry').style.display, 'none');
  assert.equal(getStatusElement(doc).textContent, formatStatusText(summary, 'tidal'));
});

test('applyProviderFilter leaves all chart entries visible when filtering is off', async () => {
  const dom = await loadFixture();
  const doc = dom.window.document;
  const summary = applyProviderFilter(doc, 'off');

  assert.deepEqual(summary, {
    total: 5,
    qobuzMatches: 2,
    tidalMatches: 1,
    shown: 5,
    hidden: 0,
  });

  assert.equal(doc.getElementById('spotify-only-entry').style.display, '');
  assert.equal(doc.getElementById('no-links-entry').style.display, '');
  assert.equal(getStatusElement(doc).textContent, formatStatusText(summary, 'off'));
});

test('readFilterMode and writeFilterMode persist the active provider mode', async () => {
  const dom = await loadFixture();

  assert.equal(readFilterMode(dom.window), 'qobuz');

  writeFilterMode('tidal', dom.window);
  assert.equal(readFilterMode(dom.window), 'tidal');

  writeFilterMode('off', dom.window);
  assert.equal(readFilterMode(dom.window), 'off');
});

test('scanChartItemsForProviders can trigger lazy-loaded qobuz links by scanning the chart', async () => {
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

  const summary = await scanChartItemsForProviders({
    doc,
    view: dom.window,
    mode: 'qobuz',
    settleMs: 0,
    maxSteps: 8,
  });

  assert.equal(itemHasProviderLink(lazyItem, 'qobuz'), true);
  assert.equal(summary.qobuzMatches, 3);
  assert.equal(summary.tidalMatches, 1);
  assert.equal(summary.total, 5);
  assert.ok(scrollTargets.includes(765));
  assert.ok(scrollTargets.includes(1530));
});

test('initChartProviderFilter applies qobuz mode by default and switches to tidal exclusively on click', async () => {
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
    const observer = initChartProviderFilter({
      doc: dom.window.document,
      locationObject: dom.window.location,
    });

    await waitFor(() => !getStatusElement(dom.window.document).textContent.includes('Scanning'));

    const qobuzButton = getProviderButton(dom.window.document, 'qobuz');
    const tidalButton = getProviderButton(dom.window.document, 'tidal');

    assert.ok(observer);
    assert.ok(getControlsFrame(dom.window.document));
    assert.equal(qobuzButton.getAttribute('aria-pressed'), 'true');
    assert.equal(tidalButton.getAttribute('aria-pressed'), 'false');
    assert.equal(dom.window.document.getElementById('qobuz-entry').style.display, '');
    assert.equal(dom.window.document.getElementById('tidal-entry').style.display, 'none');

    tidalButton.click();
    assert.equal(qobuzButton.getAttribute('aria-pressed'), 'false');
    assert.equal(tidalButton.getAttribute('aria-pressed'), 'true');
    assert.equal(dom.window.document.getElementById('qobuz-entry').style.display, 'none');
    assert.equal(dom.window.document.getElementById('tidal-entry').style.display, '');
    assert.equal(readFilterMode(dom.window), 'tidal');

    tidalButton.click();
    assert.equal(qobuzButton.getAttribute('aria-pressed'), 'false');
    assert.equal(tidalButton.getAttribute('aria-pressed'), 'false');
    assert.equal(dom.window.document.getElementById('spotify-only-entry').style.display, '');
    assert.equal(readFilterMode(dom.window), 'off');

    observer.disconnect();
    assert.deepEqual(jsdomErrors, []);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MutationObserver;
  }
});

test('initChartProviderFilter replaces legacy single-button controls with the new two-button panel', async () => {
  const dom = await loadFixture();
  const doc = dom.window.document;

  const legacyStyle = doc.createElement('style');
  legacyStyle.id = 'qobuz-on-rym-charts-style';
  legacyStyle.textContent = `
    [data-qobuz-chart-filter-status] {
      position: fixed;
      left: 16px;
      bottom: 16px;
      padding: 12px 16px;
      border-radius: 999px;
      background: rgba(14, 18, 24, 0.9);
      color: #f5f7fa;
    }
  `;
  doc.head.append(legacyStyle);

  const legacyStatus = doc.createElement('button');
  legacyStatus.type = 'button';
  legacyStatus.setAttribute('data-qobuz-chart-filter-status', '');
  legacyStatus.textContent = 'Qobuz only: ON (legacy)';
  doc.body.append(legacyStatus);

  globalThis.window = dom.window;
  globalThis.document = doc;
  globalThis.MutationObserver = dom.window.MutationObserver;

  try {
    const observer = initChartProviderFilter({
      doc,
      locationObject: dom.window.location,
    });

    await waitFor(() => !getStatusElement(doc).textContent.includes('Scanning'));

    assert.ok(observer);
    assert.equal(doc.querySelectorAll('iframe[data-qobuz-chart-filter-controls]').length, 1);
    assert.equal(getControlsDoc(doc).querySelectorAll('[data-qobuz-chart-filter-button]').length, 2);
    assert.equal(doc.querySelectorAll('[data-qobuz-chart-filter-status]').length, 0);
    assert.match(doc.getElementById('qobuz-on-rym-charts-style').textContent, /iframe\[data-qobuz-chart-filter-controls]/);

    observer.disconnect();
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MutationObserver;
  }
});

test('initChartProviderFilter stops provider-button clicks from leaking to other delegated page handlers', async () => {
  const dom = await loadFixture();
  const doc = dom.window.document;
  let leakedClicks = 0;

  doc.body.addEventListener('click', () => {
    leakedClicks += 1;
  });

  globalThis.window = dom.window;
  globalThis.document = doc;
  globalThis.MutationObserver = dom.window.MutationObserver;

  try {
    const observer = initChartProviderFilter({
      doc,
      locationObject: dom.window.location,
    });

    await waitFor(() => !getStatusElement(doc).textContent.includes('Scanning'));

    getProviderButton(doc, 'tidal').click();

    assert.equal(doc.getElementById('qobuz-entry').style.display, 'none');
    assert.equal(doc.getElementById('tidal-entry').style.display, '');
    assert.equal(leakedClicks, 0);

    observer.disconnect();
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MutationObserver;
  }
});

test('initChartProviderFilter does not rescan after switching providers once the page was already scanned', async () => {
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
    const observer = initChartProviderFilter({
      doc,
      locationObject: dom.window.location,
    });

    await waitFor(() => !getStatusElement(doc).textContent.includes('Scanning'));

    assert.ok(scrollTargets.length > 0);

    scrollTargets.length = 0;
    getProviderButton(doc, 'tidal').click();
    assert.equal(doc.getElementById('qobuz-entry').style.display, 'none');
    assert.equal(doc.getElementById('tidal-entry').style.display, '');

    getProviderButton(doc, 'qobuz').click();
    assert.equal(doc.getElementById('qobuz-entry').style.display, '');
    assert.equal(doc.getElementById('tidal-entry').style.display, 'none');
    assert.deepEqual(scrollTargets, []);

    observer.disconnect();
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MutationObserver;
  }
});

test('initChartProviderFilter refreshes when a qobuz link is added inside an existing chart item', async () => {
  const dom = await loadFixture();
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;

  try {
    const observer = initChartProviderFilter({
      doc: dom.window.document,
      locationObject: dom.window.location,
    });

    await waitFor(() => !getStatusElement(dom.window.document).textContent.includes('Scanning'));

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

test('initChartProviderFilter does not queue a second full scan for observer updates during an active scan', async () => {
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
    const observer = initChartProviderFilter({
      doc,
      locationObject: dom.window.location,
    });

    await waitFor(() => !getStatusElement(doc).textContent.includes('Scanning'));

    observer.disconnect();
    assert.equal(itemHasProviderLink(lazyItem, 'qobuz'), true);
    assert.equal(lazyItem.style.display, '');
    assert.deepEqual(scrollTargets, [765, 1530, 1700, 1700, 0]);
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MutationObserver;
  }
});
