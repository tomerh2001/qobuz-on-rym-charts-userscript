export const CHART_ITEM_SELECTOR = '.page_charts_section_charts_item.object_release, .page_charts_section_charts_item';

const CHART_CONTAINER_SELECTOR = '#page_charts_section_charts, .page_charts_section_charts';
const QOBUZ_LINK_SELECTOR = 'a[href*="qobuz.com"]';
const FILTERED_ATTR = 'data-qobuz-chart-filtered';
const STATUS_ATTR = 'data-qobuz-chart-filter-status';
const STYLE_ID = 'qobuz-on-rym-charts-style';
const TOGGLE_STORAGE_KEY = 'qobuz-on-rym-charts-enabled';
const SCAN_SETTLE_MS = 150;
const SCAN_MAX_STEPS = 30;
const SCAN_STABLE_STEPS = 2;

function normalizeWhitespace(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function isSupportedChartPath(pathname) {
  return /^\/charts\//i.test(normalizeWhitespace(pathname));
}

export function findChartContainer(doc = document) {
  return doc.querySelector(CHART_CONTAINER_SELECTOR);
}

export function getChartItems(root = document) {
  const seen = new Set();
  return [...root.querySelectorAll(CHART_ITEM_SELECTOR)].filter(item => {
    if (item.parentElement?.closest('.page_charts_section_charts_item')) {
      return false;
    }

    if (seen.has(item)) {
      return false;
    }

    seen.add(item);
    return Boolean(
      item.querySelector('.page_charts_section_charts_item_title, .page_charts_section_charts_item_link, .page_charts_section_charts_item_info'),
    );
  });
}

export function itemHasQobuzLink(item) {
  return Boolean(item?.querySelector?.(QOBUZ_LINK_SELECTOR));
}

export function formatStatusText(summary, enabled) {
  if (summary.scanning) {
    return `Qobuz only: scanning... (${summary.matches} matches in ${summary.total})`;
  }

  if (enabled) {
    return `Qobuz only: ON (${summary.shown} shown, ${summary.hidden} hidden)`;
  }

  return `Qobuz only: OFF (${summary.matches} match${summary.matches === 1 ? '' : 'es'})`;
}

function summarizeItems(items) {
  const total = items.length;
  const matches = items.filter(item => itemHasQobuzLink(item)).length;
  const shown = items.filter(item => item.dataset.qobuzChartVisible !== 'false').length;
  return {
    total,
    matches,
    shown,
    hidden: total - shown,
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeScrollTo(view, x, y) {
  if (typeof view?.scrollTo !== 'function') {
    return false;
  }

  if (/\bnotImplemented\b/.test(String(view.scrollTo))) {
    return false;
  }

  try {
    view.scrollTo(x, y);
    return true;
  } catch {
    // Some environments (like JSDOM) expose scrollTo but do not implement it.
    return false;
  }
}

function safeScrollItemIntoView(item) {
  if (typeof item?.scrollIntoView !== 'function') {
    return false;
  }

  if (/\bnotImplemented\b/.test(String(item.scrollIntoView))) {
    return false;
  }

  try {
    item.scrollIntoView({
      block: 'end',
      inline: 'nearest',
      behavior: 'auto',
    });
    return true;
  } catch {
    try {
      item.scrollIntoView();
      return true;
    } catch {
      return false;
    }
  }
}

function addStyles(doc = document) {
  if (doc.getElementById(STYLE_ID)) {
    return;
  }

  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    [${STATUS_ATTR}] {
      position: fixed;
      left: max(16px, env(safe-area-inset-left));
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 2147483647;
      padding: 12px 16px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 999px;
      background: rgba(14, 18, 24, 0.9);
      color: #f5f7fa;
      font: 600 14px/1.2 system-ui, sans-serif;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
      backdrop-filter: blur(14px);
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
    }

    [${STATUS_ATTR}]:hover {
      transform: translateY(-1px);
      box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
    }

    [${STATUS_ATTR}][data-enabled="false"] {
      background: rgba(69, 77, 90, 0.92);
      opacity: 0.92;
    }
  `;

  doc.head.append(style);
}

function ensureStatusElement(doc = document) {
  const existing = doc.querySelector(`[${STATUS_ATTR}]`);
  if (existing) {
    return existing;
  }

  const status = doc.createElement('button');
  status.type = 'button';
  status.setAttribute(STATUS_ATTR, '');
  doc.body.append(status);
  return status;
}

function hideItem(item) {
  item.dataset.qobuzChartVisible = 'false';
  item.toggleAttribute(FILTERED_ATTR, true);
  item.style.setProperty('display', 'none', 'important');
}

function showItem(item) {
  item.dataset.qobuzChartVisible = 'true';
  item.removeAttribute(FILTERED_ATTR);
  item.style.removeProperty('display');
}

export function readToggleState(view = window) {
  try {
    const stored = view.localStorage.getItem(TOGGLE_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export function writeToggleState(enabled, view = window) {
  try {
    view.localStorage.setItem(TOGGLE_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage failures; the toggle still works for the current page view.
  }
}

export function applyQobuzFilter(doc = document, enabled = true) {
  const items = getChartItems(doc);
  for (const item of items) {
    if (!enabled || itemHasQobuzLink(item)) {
      showItem(item);
      continue;
    }

    hideItem(item);
  }

  const summary = summarizeItems(items);
  const status = ensureStatusElement(doc);
  status.dataset.enabled = String(enabled);
  status.textContent = formatStatusText(summary, enabled);
  status.hidden = summary.total === 0;
  return summary;
}

function showAllItems(doc = document) {
  for (const item of getChartItems(doc)) {
    showItem(item);
  }
}

function mutationTouchesChart(mutation) {
  const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
  const ElementImpl = mutation.target?.ownerDocument?.defaultView?.Element;
  return nodes.some(node => {
    if (!ElementImpl || !(node instanceof ElementImpl)) {
      return false;
    }

    return Boolean(
      node.matches(CHART_CONTAINER_SELECTOR) ||
      node.matches(CHART_ITEM_SELECTOR) ||
      node.querySelector(CHART_CONTAINER_SELECTOR) ||
      node.querySelector(CHART_ITEM_SELECTOR),
    );
  });
}

function updateStatus(doc, summary, enabled) {
  const status = ensureStatusElement(doc);
  status.dataset.enabled = String(enabled);
  status.textContent = formatStatusText(summary, enabled);
  status.hidden = summary.total === 0;
  return status;
}

function getChartItemScanKey(item, index = 0) {
  if (!item) {
    return `missing-${index}`;
  }

  const href = item.querySelector('a[href]')?.getAttribute('href');
  if (href) {
    return href;
  }

  const itemId = item.id ? `#${item.id}` : '';
  const label = normalizeWhitespace(
    item.querySelector('.page_charts_section_charts_item_title, .page_charts_section_charts_item_link')?.textContent ??
      item.textContent ??
      '',
  );

  return `${itemId}|${label || `item-${index}`}`;
}

function buildScanSnapshot(items, summary) {
  const lastIndex = items.length - 1;
  return `${summary.total}|${summary.matches}|${getChartItemScanKey(items[lastIndex], lastIndex)}`;
}

function pickNextScanTarget(items, visitedTargetKeys) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const key = getChartItemScanKey(items[index], index);
    if (!visitedTargetKeys.has(key)) {
      return {
        item: items[index],
        key,
      };
    }
  }

  if (!items.length) {
    return null;
  }

  const index = items.length - 1;
  return {
    item: items[index],
    key: getChartItemScanKey(items[index], index),
  };
}

export async function scanChartItemsForQobuz({
  doc = document,
  view = window,
  shouldCancel = () => false,
  settleMs = SCAN_SETTLE_MS,
  maxSteps = SCAN_MAX_STEPS,
} = {}) {
  const scrollingElement = doc.scrollingElement ?? doc.documentElement ?? doc.body;
  const startX = view.scrollX ?? 0;
  const startY = view.scrollY ?? 0;

  let stableSteps = 0;
  let previousSnapshot = '';
  const visitedTargetKeys = new Set();

  showAllItems(doc);

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      if (shouldCancel()) {
        break;
      }

      const items = getChartItems(doc);
      const summary = {
        ...summarizeItems(items),
        scanning: true,
      };

      const target = pickNextScanTarget(items, visitedTargetKeys);
      if (!target) {
        return {
          ...summary,
          scanning: false,
        };
      }

      visitedTargetKeys.add(target.key);

      const maxScrollTop = Math.max(0, (scrollingElement.scrollHeight || 0) - (view.innerHeight || 0));
      if (!safeScrollItemIntoView(target.item)) {
        safeScrollTo(view, startX, maxScrollTop);
      }

      await wait(settleMs);
      showAllItems(doc);

      const nextItems = getChartItems(doc);
      const nextSummary = summarizeItems(nextItems);
      const nextSnapshot = buildScanSnapshot(nextItems, nextSummary);

      if (nextSnapshot === previousSnapshot) {
        stableSteps += 1;
      } else {
        stableSteps = 0;
      }

      previousSnapshot = nextSnapshot;

      if (stableSteps >= SCAN_STABLE_STEPS) {
        return {
          ...nextSummary,
          scanning: false,
        };
      }
    }
  } finally {
    safeScrollTo(view, startX, startY);
  }

  return {
    ...summarizeItems(getChartItems(doc)),
    scanning: false,
  };
}

export function initQobuzChartFilter({
  doc = document,
  locationObject = window.location,
} = {}) {
  if (!isSupportedChartPath(locationObject?.pathname ?? '')) {
    return null;
  }

  addStyles(doc);
  const view = doc.defaultView ?? window;
  const MutationObserverImpl = view.MutationObserver ?? MutationObserver;
  let enabled = readToggleState(view);
  let runId = 0;
  let scanPromise = null;
  let pendingRefresh = false;

  const refresh = () => {
    if (scanPromise) {
      pendingRefresh = true;
      return;
    }

    const activeRun = ++runId;
    const currentPromise = (async () => {
      if (!enabled) {
        applyQobuzFilter(doc, false);
        return;
      }

      const initialSummary = {
        ...summarizeItems(getChartItems(doc)),
        scanning: true,
      };
      updateStatus(doc, initialSummary, true);

      await scanChartItemsForQobuz({
        doc,
        view,
        shouldCancel: () => activeRun !== runId || !enabled,
      });

      if (activeRun !== runId) {
        return;
      }

      applyQobuzFilter(doc, enabled);
    })().finally(() => {
      if (scanPromise === currentPromise) {
        scanPromise = null;
      }

      if (pendingRefresh) {
        pendingRefresh = false;
        refresh();
      }
    });
    scanPromise = currentPromise;
  };

  const status = ensureStatusElement(doc);
  if (!status.dataset.boundClick) {
    status.dataset.boundClick = 'true';
    status.addEventListener('click', () => {
      enabled = !enabled;
      writeToggleState(enabled, view);
      runId += 1;
      showAllItems(doc);
      if (!enabled) {
        applyQobuzFilter(doc, false);
      }
      refresh();
    });
  }

  const observer = new MutationObserverImpl(mutations => {
    const shouldRefresh = mutations.some(mutation => mutation.type === 'childList' && mutationTouchesChart(mutation));
    if (shouldRefresh) {
      refresh();
    }
  });

  observer.observe(doc.body, { childList: true, subtree: true });
  view.addEventListener('popstate', refresh);
  refresh();
  return observer;
}
