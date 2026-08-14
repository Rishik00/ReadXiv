import axios from 'axios';

const SESSION_KEY = 'readxiv-analytics-session-id';
const SLOW_API_REQUEST_MS = 1000;
let axiosInstrumentationReady = false;

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function sanitizeError(error) {
  if (!error) return { message: 'Unknown error' };
  return {
    name: error.name || error.constructor?.name || 'Error',
    message: error.message || String(error),
    stack: error.stack ? String(error.stack).slice(0, 4000) : null,
    code: error.code || null,
    status: error.response?.status || null,
    statusText: error.response?.statusText || null,
    url: error.config?.url || null,
    method: error.config?.method || null,
  };
}

function cleanProperties(properties = {}) {
  const cleaned = {};
  for (const [key, value] of Object.entries(properties || {})) {
    if (value === undefined) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

export function getInstrumentationSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next = createId();
    sessionStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return createId();
  }
}

function captureLocal(eventName, payload) {
  if (String(payload?.metadata?.url || '').includes('/api/instrumentation')) return;
  axios
    .post('/api/instrumentation/events', payload)
    .catch(() => {
      // Instrumentation should never interrupt reading.
    });
}

export function captureEvent(eventName, properties = {}) {
  const props = cleanProperties({
    ...properties,
    sessionId: getInstrumentationSessionId(),
    isElectron: Boolean(window.electron?.isElectron),
    appMode: window.electron?.isElectron ? 'electron' : 'web',
  });

  captureLocal(eventName, {
    eventName,
    route: props.route || null,
    paperId: props.paperId || props.paper_id || null,
    paperTitle: props.paperTitle || props.paper_title || null,
    sessionId: props.sessionId,
    metadata: props,
  });
}

export function capturePageView(route, metadata = {}) {
  if (!route || route === 'canvas') return;
  captureEvent('page_view', { route, ...metadata });
}

export function captureAction(action, metadata = {}) {
  captureEvent('ui_action', { action, route: metadata.route, ...metadata });
}

export function captureTiming(eventName, durationMs, metadata = {}) {
  if (!Number.isFinite(durationMs)) return;
  captureEvent(eventName, {
    ...metadata,
    durationMs: Number(durationMs.toFixed(1)),
  });
}

export function captureAppError(error, metadata = {}) {
  captureEvent('app_error', {
    ...metadata,
    error: sanitizeError(error),
  });
}

export function setupGlobalErrorInstrumentation() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    captureAppError(event.error || new Error(event.message), {
      route: window.__readxivCurrentRoute || null,
      source: 'window.error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    captureAppError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)), {
      route: window.__readxivCurrentRoute || null,
      source: 'unhandledrejection',
    });
  });
}

export function setupAxiosInstrumentation() {
  if (axiosInstrumentationReady) return;
  axiosInstrumentationReady = true;

  axios.interceptors.request.use((config) => {
    config.metadata = {
      ...(config.metadata || {}),
      readxivStartedAt: now(),
    };
    return config;
  });

  axios.interceptors.response.use(
    (response) => {
      const startedAt = response.config?.metadata?.readxivStartedAt;
      const durationMs = startedAt ? now() - startedAt : null;
      const url = response.config?.url || '';
      // Routine API calls happen on nearly every keypress and page change. Recording
      // each one turns telemetry into a constant stream of database writes, which can
      // stall the local server. Keep the useful signal: requests slow enough to affect
      // the user experience, while errors are still recorded below.
      if (durationMs != null && durationMs >= SLOW_API_REQUEST_MS && !url.includes('/api/instrumentation')) {
        captureTiming('api_latency', durationMs, {
          route: window.__readxivCurrentRoute || null,
          url,
          method: response.config?.method || 'get',
          status: response.status,
        });
      }
      return response;
    },
    (error) => {
      const startedAt = error.config?.metadata?.readxivStartedAt;
      const durationMs = startedAt ? now() - startedAt : null;
      const url = error.config?.url || '';
      if (!url.includes('/api/instrumentation')) {
        captureEvent('api_error', {
          route: window.__readxivCurrentRoute || null,
          url,
          method: error.config?.method || null,
          durationMs: durationMs == null ? null : Number(durationMs.toFixed(1)),
          error: sanitizeError(error),
        });
      }
      return Promise.reject(error);
    }
  );
}

export function markCurrentRoute(route) {
  if (typeof window !== 'undefined') {
    window.__readxivCurrentRoute = route;
  }
}

export function startTimer() {
  return now();
}

export function elapsedSince(startedAt) {
  return now() - startedAt;
}
