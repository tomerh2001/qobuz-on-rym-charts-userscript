export const CHART_ITEM_SELECTOR = '.page_charts_section_charts_item.object_release, .page_charts_section_charts_item';

const CHART_CONTAINER_SELECTOR = '#page_charts_section_charts, .page_charts_section_charts';
const FILTERED_ATTR = 'data-qobuz-chart-filtered';
const CONTROLS_ATTR = 'data-qobuz-chart-filter-controls';
const PANEL_ATTR = 'data-qobuz-chart-filter-panel';
const STATUS_ATTR = 'data-qobuz-chart-filter-status';
const BUTTON_ATTR = 'data-qobuz-chart-filter-button';
const STYLE_ID = 'qobuz-on-rym-charts-style';
const FILTER_MODE_STORAGE_KEY = 'qobuz-on-rym-charts-mode';
const SCAN_STEP_RATIO = 0.85;
const SCAN_MIN_STEP_PX = 480;
const SCAN_SETTLE_MS = 150;
const SCAN_MAX_STEPS = 30;
const SCAN_STABLE_STEPS = 2;
const CONTROL_FRAME_MIN_HEIGHT_PX = 112;

const FILTER_MODES = {
  off: 'off',
  qobuz: 'qobuz',
  tidal: 'tidal',
};

const PROVIDER_LINK_SELECTORS = {
  qobuz: 'a[href*="qobuz.com"]',
  tidal: 'a[href*="tidal.com"]',
};

function normalizeWhitespace(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function getProviderLabel(provider) {
  return provider === FILTER_MODES.tidal ? 'Tidal' : 'Qobuz';
}

function normalizeFilterMode(value) {
  return Object.values(FILTER_MODES).includes(value) ? value : FILTER_MODES.qobuz;
}

function getControls(doc = document) {
  const frame = doc.querySelector(`iframe[${CONTROLS_ATTR}]`);
  if (!frame?.contentDocument) {
    return null;
  }

  const frameDoc = frame.contentDocument;
  return {
    controls: frame,
    frame,
    frameDoc,
    panel: frameDoc.querySelector(`[${PANEL_ATTR}]`),
    status: frameDoc.querySelector(`[${STATUS_ATTR}]`),
    buttons: [...frameDoc.querySelectorAll(`[${BUTTON_ATTR}]`)],
  };
}

function itemMatchesMode(item, mode) {
  return mode === FILTER_MODES.off || itemHasProviderLink(item, mode);
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

export function itemHasProviderLink(item, provider) {
  const selector = PROVIDER_LINK_SELECTORS[provider];
  if (!selector) {
    return false;
  }

  return Boolean(item?.querySelector?.(selector));
}

export function itemHasSupportedLink(item) {
  return Object.keys(PROVIDER_LINK_SELECTORS).some(provider => itemHasProviderLink(item, provider));
}

export function formatStatusText(summary, mode) {
  if (summary.scanning) {
    return `Scanning chart... (${summary.qobuzMatches} Qobuz, ${summary.tidalMatches} Tidal, ${summary.total} total)`;
  }

  if (mode === FILTER_MODES.off) {
    return `Filter off (${summary.qobuzMatches} Qobuz, ${summary.tidalMatches} Tidal)`;
  }

  return `${getProviderLabel(mode)} only: ON (${summary.shown} shown, ${summary.hidden} hidden)`;
}

function summarizeItems(items) {
  const total = items.length;
  const qobuzMatches = items.filter(item => itemHasProviderLink(item, FILTER_MODES.qobuz)).length;
  const tidalMatches = items.filter(item => itemHasProviderLink(item, FILTER_MODES.tidal)).length;
  const shown = items.filter(item => item.dataset.qobuzChartVisible !== 'false').length;

  return {
    total,
    qobuzMatches,
    tidalMatches,
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
  const style = doc.getElementById(STYLE_ID) ?? doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    iframe[${CONTROLS_ATTR}] {
      position: fixed;
      left: max(16px, env(safe-area-inset-left));
      bottom: max(16px, env(safe-area-inset-bottom));
      z-index: 2147483647;
      width: min(320px, calc(100vw - 32px));
      height: ${CONTROL_FRAME_MIN_HEIGHT_PX}px;
      border: 0;
      padding: 0;
      margin: 0;
      overflow: hidden;
      background: transparent;
      color-scheme: normal;
    }
  `;

  if (!style.isConnected) {
    doc.head.append(style);
  }
}

function removeLegacyStatusElements(doc = document) {
  for (const element of doc.querySelectorAll(`[${STATUS_ATTR}], [${CONTROLS_ATTR}]`)) {
    element.remove();
  }
}

function ensureControls(doc = document) {
  const existing = getControls(doc);
  if (existing) {
    return existing;
  }

  const frame = doc.createElement('iframe');
  frame.setAttribute(CONTROLS_ATTR, '');
  frame.setAttribute('title', 'Qobuz and Tidal chart filters');
  frame.setAttribute('scrolling', 'no');
  frame.setAttribute('tabindex', '-1');
  frame.src = 'about:blank';
  doc.body.append(frame);

  const frameDoc = frame.contentDocument;
  if (!frameDoc) {
    return null;
  }

  frameDoc.open();
  frameDoc.write('<!doctype html><html><head></head><body></body></html>');
  frameDoc.close();

  const innerStyle = frameDoc.createElement('style');
  innerStyle.textContent = `
    html, body {
      margin: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
    }

    body {
      font: 600 14px/1.2 system-ui, sans-serif;
    }

    [${PANEL_ATTR}] {
      display: grid;
      gap: 10px;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 18px;
      background: rgba(14, 18, 24, 0.9);
      color: #f5f7fa;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.24);
      backdrop-filter: blur(14px);
    }

    [data-qobuz-chart-filter-button-row] {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    [${BUTTON_ATTR}] {
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      background: rgba(69, 77, 90, 0.92);
      color: inherit;
      padding: 10px 12px;
      font: inherit;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease, opacity 120ms ease;
    }

    [${BUTTON_ATTR}]:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
    }

    [${BUTTON_ATTR}][aria-pressed="true"] {
      background: linear-gradient(135deg, rgba(80, 178, 255, 0.95), rgba(24, 119, 242, 0.95));
      border-color: rgba(255, 255, 255, 0.28);
    }

    [${STATUS_ATTR}] {
      color: rgba(245, 247, 250, 0.88);
      font-size: 13px;
      line-height: 1.35;
    }
  `;
  frameDoc.head.append(innerStyle);

  const panel = frameDoc.createElement('section');
  panel.setAttribute(PANEL_ATTR, '');

  const buttonRow = frameDoc.createElement('div');
  buttonRow.dataset.qobuzChartFilterButtonRow = 'true';

  for (const provider of [FILTER_MODES.qobuz, FILTER_MODES.tidal]) {
    const button = frameDoc.createElement('button');
    button.type = 'button';
    button.setAttribute(BUTTON_ATTR, provider);
    button.dataset.mode = provider;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = getProviderLabel(provider);
    buttonRow.append(button);
  }

  const status = frameDoc.createElement('div');
  status.setAttribute(STATUS_ATTR, '');
  panel.append(buttonRow, status);
  frameDoc.body.append(panel);
  return getControls(doc);
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

export function readFilterMode(view = window) {
  try {
    const stored = view.localStorage.getItem(FILTER_MODE_STORAGE_KEY);
    return stored === null ? FILTER_MODES.qobuz : normalizeFilterMode(stored);
  } catch {
    return FILTER_MODES.qobuz;
  }
}

export function writeFilterMode(mode, view = window) {
  try {
    view.localStorage.setItem(FILTER_MODE_STORAGE_KEY, normalizeFilterMode(mode));
  } catch {
    // Ignore storage failures; the controls still work for the current page view.
  }
}

function updateControls(doc, summary, mode) {
  const controlParts = ensureControls(doc);
  if (!controlParts) {
    return null;
  }

  const { controls, panel, status, buttons, frameDoc } = controlParts;
  status.textContent = formatStatusText(summary, mode);
  controls.hidden = summary.total === 0;

  for (const button of buttons) {
    const isActive = button.dataset.mode === mode;
    button.setAttribute('aria-pressed', String(isActive));
  }

  const measuredHeight = Math.max(
    CONTROL_FRAME_MIN_HEIGHT_PX,
    panel?.scrollHeight ?? 0,
    frameDoc.body?.scrollHeight ?? 0,
    frameDoc.documentElement?.scrollHeight ?? 0,
  );
  controls.style.height = `${measuredHeight}px`;
  return controls;
}

export function applyProviderFilter(doc = document, mode = FILTER_MODES.qobuz) {
  const normalizedMode = normalizeFilterMode(mode);
  const items = getChartItems(doc);

  for (const item of items) {
    if (itemMatchesMode(item, normalizedMode)) {
      showItem(item);
      continue;
    }

    hideItem(item);
  }

  const summary = summarizeItems(items);
  updateControls(doc, summary, normalizedMode);
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

export async function scanChartItemsForProviders({
  doc = document,
  view = window,
  shouldCancel = () => false,
  settleMs = SCAN_SETTLE_MS,
  maxSteps = SCAN_MAX_STEPS,
  mode = FILTER_MODES.qobuz,
} = {}) {
  const scrollingElement = doc.scrollingElement ?? doc.documentElement ?? doc.body;
  const startX = view.scrollX ?? 0;
  const startY = view.scrollY ?? 0;
  const stepSize = Math.max(SCAN_MIN_STEP_PX, Math.round((view.innerHeight || 0) * SCAN_STEP_RATIO));

  let targetY = 0;
  let stableSteps = 0;
  let lastTotal = -1;
  let lastQobuzMatches = -1;
  let lastTidalMatches = -1;
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
      updateControls(doc, summary, mode);

      const maxScrollTop = Math.max(0, (scrollingElement.scrollHeight || 0) - (view.innerHeight || 0));
      if (
        summary.total === lastTotal &&
        summary.qobuzMatches === lastQobuzMatches &&
        summary.tidalMatches === lastTidalMatches &&
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
      lastQobuzMatches = summary.qobuzMatches;
      lastTidalMatches = summary.tidalMatches;
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

export function initChartProviderFilter({
  doc = document,
  locationObject = window.location,
} = {}) {
  if (!isSupportedChartPath(locationObject?.pathname ?? '')) {
    return null;
  }

  addStyles(doc);
  removeLegacyStatusElements(doc);
  const view = doc.defaultView ?? window;
  const MutationObserverImpl = view.MutationObserver ?? MutationObserver;
  let pagePath = locationObject?.pathname ?? view.location?.pathname ?? '';
  let mode = readFilterMode(view);
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
      if (mode === FILTER_MODES.off) {
        applyProviderFilter(doc, FILTER_MODES.off);
        return;
      }

      if (hasScannedPage && !chartDirty) {
        applyProviderFilter(doc, mode);
        return;
      }

      updateControls(
        doc,
        {
          ...summarizeItems(getChartItems(doc)),
          scanning: true,
        },
        mode,
      );

      await scanChartItemsForProviders({
        doc,
        view,
        mode,
        shouldCancel: () => activeRun !== runId || mode === FILTER_MODES.off,
      });

      if (activeRun !== runId) {
        return;
      }

      hasScannedPage = true;
      chartDirty = false;
      applyProviderFilter(doc, mode);
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

  const controlParts = ensureControls(doc);
  if (!controlParts) {
    return null;
  }

  const { buttons } = controlParts;
  for (const button of buttons) {
    if (button.dataset.boundClick) {
      continue;
    }

    button.dataset.boundClick = 'true';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();

      const nextMode = button.dataset.mode ?? FILTER_MODES.qobuz;
      mode = mode === nextMode ? FILTER_MODES.off : normalizeFilterMode(nextMode);
      writeFilterMode(mode, view);
      runId += 1;
      showAllItems(doc);

      if (mode === FILTER_MODES.off) {
        applyProviderFilter(doc, FILTER_MODES.off);
        return;
      }

      if (hasScannedPage && !chartDirty) {
        applyProviderFilter(doc, mode);
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
