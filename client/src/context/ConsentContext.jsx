import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createSession, patchStatus, sendConsent } from '../services/visitorService';

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

  const sessionPromiseRef = useRef(null);

  const persist = useCallback((next) => {
    ref.current = next;
    setState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  }, []);

  // Make sure a session exists. Uses a promise cache so concurrent callers
  // (ConsentProvider's own effect AND LiveShareProvider) never create two
  // separate sessions.
  const ensureSession = useCallback(async () => {
    const cur = ref.current;
    if (cur.visitorId && cur.token) return cur;
    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    sessionPromiseRef.current = (async () => {
      const { visitorId, sessionToken } = await createSession();
      return persist({ ...ref.current, visitorId, token: sessionToken });
    })();

    return sessionPromiseRef.current;
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

  // Create session immediately on first visit, then resume on subsequent loads.
  // Do NOT mark the session as "ended" on pagehide — only stop active sharing.
  // The session stays "active" so it can recover when the visitor returns.
  useEffect(() => {
    const init = async () => {
      const { visitorId, token } = ref.current;
      if (visitorId) {
        // Resume existing session
        patchStatus(visitorId, token, { sessionStatus: 'active' }).catch(() => {});
      } else {
        // New visitor - create session immediately
        try {
          await ensureSession();
        } catch (err) {
          console.warn('[CamShield] Could not create visitor session:', err.message);
        }
      }
    };
    init();

    // On pagehide, stop active sharing but do NOT mark the session as ended.
    // The session remains "active" in the database for recovery.
    const onHide = () => {
      const s = ref.current;
      if (s.visitorId && s.token) {
        // Best-effort: stop camera/GPS sharing but keep session active
        patchStatus(s.visitorId, s.token, {
          cameraActive: false,
          sharingLive: false,
          gpsSharing: false
        }).catch(() => {});
      }
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [persist, ensureSession]);

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
