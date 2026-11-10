import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyCameraError, requestCameraStream, stopStream } from '../services/camera';

/**
 * status: idle | requesting | active | stopped | denied | error | unsupported
 * Every exit path (Stop button, route change, tab close, browser revoking access) stops all tracks.
 */
export default function useCamera({ onPermission, onActive } = {}) {
  const [status, setStatus] = useState('idle');
  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const reqRef = useRef(0);
  const cb = useRef({});
  cb.current = { onPermission, onActive };

  const stop = useCallback(() => {
    reqRef.current += 1; // cancels any request still waiting on the browser prompt
    const hadStream = Boolean(streamRef.current);
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus((s) => (s === 'active' || s === 'requesting' ? 'stopped' : s));
    if (hadStream) cb.current.onActive?.(false);
  }, []);

  const start = useCallback(async () => {
    const id = ++reqRef.current;
    setStatus('requesting');
    try {
      const stream = await requestCameraStream(streamRef.current);
      if (id !== reqRef.current) { stopStream(stream); return; }
      streamRef.current = stream;
      stream.getVideoTracks().forEach((t) =>
        t.addEventListener('ended', () => { if (streamRef.current === stream) stop(); })
      );
      cb.current.onPermission?.('granted');
      setStatus('active');
      cb.current.onActive?.(true);
    } catch (err) {
      if (id !== reqRef.current) return;
      const result = classifyCameraError(err);
      setStatus(result);
      cb.current.onPermission?.(result);
    }
  }, [stop]);

  useEffect(() => {
    if (status === 'active' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.muted = true;
      videoRef.current.play?.().catch(() => {});
    }
  }, [status]);

  useEffect(() => {
    window.addEventListener('pagehide', stop);
    return () => { window.removeEventListener('pagehide', stop); stop(); };
  }, [stop]);

  return { status, start, stop, videoRef };
}
