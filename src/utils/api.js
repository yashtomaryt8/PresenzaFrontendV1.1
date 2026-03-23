const BASE = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace(/\/$/, '') + '/api'
  : '/api';

function arr(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  return [];
}

async function req(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.error || j.detail || j.message || msg; } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

export const api = {
  // Health / ping
  health:           ()          => req('/health/'),
  ping:             ()          => req('/ping/'),

  // Users
  users:            ()          => req('/users/').then(arr),
  userDetail:       (id)        => req(`/users/${id}/`),
  deleteUser:       (id)        => req(`/users/${id}/`, { method: 'DELETE' }),
  userThumbnail:    (id)        => req(`/users/${id}/thumbnail/`),
  addPhotos:        (id, form)  => req(`/users/${id}/photos/`, { method: 'POST', body: form }),

  // Registration
  register:         (form)      => req('/register/', { method: 'POST', body: form }),
  checkDuplicate:   (form)      => req('/check-duplicate/', { method: 'POST', body: form }),

  // Scanning
  scan:             (form)      => req('/scan/', { method: 'POST', body: form }),

  // Logs
  logs:             (p = {})    => req('/logs/?' + new URLSearchParams(p).toString()).then(arr),
  logSnapshot:      (id)        => req(`/logs/${id}/snapshot/`),
  sessions:         (p = {})    => req('/sessions/?' + new URLSearchParams(p).toString()).then(arr),

  // SSE — returns raw EventSource URL (caller uses new EventSource(url))
  logsSSEUrl:       ()          => `${BASE}/logs/stream/`,

  // Analytics
  analytics:        ()          => req('/analytics/'),
  exportCSV:        (date)      => req(`/export/?date=${date}`),

  // AI
  aiInsight: (mode, prompt = '') =>
    req('/ai-insight/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, prompt }),
    }),
  semanticQuery: (query, mode = 'groq') =>
    req('/semantic-query/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, mode }),
    }),

  // Settings
  getPrivacy:       ()          => req('/privacy/'),
  setPrivacy:       (enable)    => req('/privacy/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enable }),
  }),
  getModels:        ()          => req('/models/'),

  // Utility
  resetPresence:    ()          => req('/reset-presence/', { method: 'POST' }),
};
