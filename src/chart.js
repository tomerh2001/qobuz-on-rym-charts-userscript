export const CHART_ITEM_SELECTOR = '.page_charts_section_charts_item.object_release, .page_charts_section_charts_item';

const CHART_CONTAINER_SELECTOR = '#page_charts_section_charts, .page_charts_section_charts';
const SUPPORTED_LINK_SELECTOR = 'a[href*="qobuz.com"], a[href*="tidal.com"]';
const FILTERED_ATTR = 'data-qobuz-chart-filtered';
const STATUS_ATTR = 'data-qobuz-chart-filter-status';
const STYLE_ID = 'qobuz-on-rym-charts-style';
const TOGGLE_STORAGE_KEY = 'qobuz-on-rym-charts-enabled';
const SCAN_STEP_RATIO = 0.85;
const SCAN_MIN_STEP_PX = 480;
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

export function itemHasSupportedLink(item) {
  return Boolean(item?.querySelector?.(SUPPORTED_LINK_SELECTOR));
}

export function formatStatusText(summary, enabled) {
  if (summary.scanning) {
    return `Qobuz/Tidal only: scanning... (${summary.matches} matches in ${summary.total})`;
  }

  if (enabled) {
    return `Qobuz/Tidal only: ON (${summary.shown} shown, ${summary.hidden} hidden)`;
  }

  return `Qobuz/Tidal only: OFF (${summary.matches} match${summary.matches === 1 ? '' : 'es'})`;
}

function summarizeItems(items) {
  const total = items.length;
  const matches = items.filter(item => itemHasSupportedLink(item)).length;
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
    return;
  }

  if (/\bnotImplemented\b/.test(String(view.scrollTo))) {
    return;
  }

  try {
    view.scrollTo(x, y);
  } catch {
    // Some environments (like JSDOM) expose scrollTo but do not implement it.
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
    if (!enabled || itemHasSupportedLink(item)) {
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
  const ElementImpl = mutation.target?.ownerDocument?.defaultView?.Element;
  const target = mutation.target;
  if (ElementImpl && target instanceof ElementImpl && target.closest(CHART_CONTAINER_SELECTOR)) {
    return true;
  }

  const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
  return nodes.some(node => {
    if (!ElementImpl || !(node instanceof ElementImpl)) {
      return false;
    }

    return Boolean(
      node.closest(CHART_CONTAINER_SELECTOR) ||
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
  const stepSize = Math.max(SCAN_MIN_STEP_PX, Math.round((view.innerHeight || 0) * SCAN_STEP_RATIO));

  let targetY = 0;
  let stableSteps = 0;
  let lastTotal = -1;
  let lastMatches = -1;
  let lastMaxScrollTop = -1;

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

      const maxScrollTop = Math.max(0, (scrollingElement.scrollHeight || 0) - (view.innerHeight || 0));
      if (
        summary.total === lastTotal &&
        summary.matches === lastMatches &&
        maxScrollTop === lastMaxScrollTop &&
        targetY >= maxScrollTop
      ) {
        stableSteps += 1;
      } else {
        stableSteps = 0;
      }

      if (stableSteps >= SCAN_STABLE_STEPS) {
        return {
          ...summary,
          scanning: false,
        };
      }

      lastTotal = summary.total;
      lastMatches = summary.matches;
      lastMaxScrollTop = maxScrollTop;

      targetY = Math.min(maxScrollTop, targetY + stepSize);
      safeScrollTo(view, startX, targetY);
      await wait(settleMs);
      showAllItems(doc);
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
  let pagePath = locationObject?.pathname ?? view.location?.pathname ?? '';
  let enabled = readToggleState(view);
  let runId = 0;
  let scanPromise = null;
  let pendingRefresh = false;
  let hasScannedPage = false;
  let chartDirty = true;

  const refresh = (reason = 'manual') => {
    const currentPath = locationObject?.pathname ?? view.location?.pathname ?? '';
    if (currentPath !== pagePath) {
      pagePath = currentPath;
      hasScannedPage = false;
      chartDirty = true;
    }

    if (scanPromise) {
      if (reason !== 'observer') {
        pendingRefresh = true;
      }
      return;
    }

    const activeRun = ++runId;
    const currentPromise = (async () => {
      if (!enabled) {
        applyQobuzFilter(doc, false);
        return;
      }

      if (hasScannedPage && !chartDirty) {
        applyQobuzFilter(doc, true);
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

      hasScannedPage = true;
      chartDirty = false;
      applyQobuzFilter(doc, enabled);
    })().finally(() => {
      if (scanPromise === currentPromise) {
        scanPromise = null;
      }

      if (pendingRefresh) {
        pendingRefresh = false;
        refresh('pending');
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
        return;
      }
      refresh('toggle');
    });
  }

  const observer = new MutationObserverImpl(mutations => {
    const shouldRefresh = mutations.some(mutation => mutation.type === 'childList' && mutationTouchesChart(mutation));
    if (shouldRefresh) {
      chartDirty = true;
      refresh('observer');
    }
  });

  observer.observe(doc.body, { childList: true, subtree: true });
  view.addEventListener('popstate', () => {
    chartDirty = true;
    hasScannedPage = false;
    refresh('popstate');
  });
  refresh('initial');
  return observer;
}
