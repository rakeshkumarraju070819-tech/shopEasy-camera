import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createSession, endSessionKeepalive, patchStatus, sendConsent } from '../services/visitorService';

/**
 * Tracks the visitor's answer to the optional camera-demo notification.
 *  decision: null (not asked yet) | 'accepted' | 'declined'   ← CONSENT (our notification)
 * The browser's own permission result is a separate thing and is only reported via reportPermission().
 * Backend calls are best-effort: a failed request never blocks shopping.
 */
const ConsentContext = createContext(null);
const KEY = 'camshield.session';

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

export function ConsentProvider({ children }) {
  const [state, setState] = useState(read);
  const [reopened, setReopened] = useState(false);
  const ref = useRef(state);
  ref.current = state;

  const persist = useCallback((next) => {
    ref.current = next;
    setState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  }, []);

  // Make sure a session exists (created only after the visitor has seen the disclosure and chosen).
  const ensureSession = useCallback(async () => {
    const cur = ref.current;
    if (cur.visitorId && cur.token) return cur;
    const { visitorId, sessionToken } = await createSession();
    return persist({ ...ref.current, visitorId, token: sessionToken });
  }, [persist]);

  const choose = useCallback(async (decision) => {
    persist({ ...ref.current, decision });
    setReopened(false);
    try {
      const s = await ensureSession();
      await sendConsent(s.visitorId, s.token, decision);
    } catch (err) {
      console.warn('[CamShield] Could not sync consent choice:', err.message);
    }
  }, [ensureSession, persist]);

  const reportPermission = useCallback(async (result) => {
    const { visitorId, token } = ref.current;
    if (!visitorId) return;
    try { await patchStatus(visitorId, token, { cameraPermission: result }); }
    catch (err) { console.warn('[CamShield] Could not sync permission result:', err.message); }
  }, []);

  const reportCameraActive = useCallback(async (active) => {
    const { visitorId, token } = ref.current;
    if (!visitorId) return;
    try { await patchStatus(visitorId, token, { cameraActive: active }); }
    catch (err) { console.warn('[CamShield] Could not sync camera state:', err.message); }
  }, []);

  // Resume an existing session on load; mark it ended when the tab closes.
  useEffect(() => {
    const { visitorId, token } = ref.current;
    if (visitorId) patchStatus(visitorId, token, { sessionStatus: 'active' }).catch(() => {});
    const onHide = () => { const s = ref.current; if (s.visitorId) endSessionKeepalive(s.visitorId, s.token); };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // needsChoice is intentionally false — the live-sharing consent flow is
  // now handled entirely by LiveShareContext / LiveShareConsentModal.
  // ConsentContext remains for backend session tracking only.
  const value = useMemo(() => ({
    decision: state.decision || null,
    visitorId: state.visitorId || null,
    token: state.token || null,
    needsChoice: false,
    reopen: () => setReopened(true),
    dismissReopen: () => setReopened(false),
    choose, reportPermission, reportCameraActive,
    ensureSession
  }), [state.decision, state.visitorId, state.token, choose, reportPermission, reportCameraActive, ensureSession]);

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export const useConsent = () => useContext(ConsentContext);
