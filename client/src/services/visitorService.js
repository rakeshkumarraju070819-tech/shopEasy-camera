import api, { API_BASE } from './api';

const tokenHeader = (token) => ({ headers: { 'x-session-token': token } });

export const createSession = () => api.post('/visitors/session').then((r) => r.data);
export const sendConsent = (visitorId, token, decision) =>
  api.post('/visitors/consent', { visitorId, decision }, tokenHeader(token)).then((r) => r.data);
export const patchStatus = (visitorId, token, body) =>
  api.patch(`/visitors/${visitorId}/status`, body, tokenHeader(token)).then((r) => r.data);

/** Used while the page is closing – axios requests can be cancelled, fetch+keepalive is not. */
export const endSessionKeepalive = (visitorId, token) => {
  try {
    fetch(`${API_BASE}/visitors/${visitorId}/status`, {
      method: 'PATCH', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'x-session-token': token },
      body: JSON.stringify({ sessionStatus: 'ended' })
    });
  } catch { /* best effort */ }
};
