/**
 * Robust camera capture and error classification service.
 * Mobile-compatible: works on Android Chrome, desktop Chrome, iOS Safari, etc.
 * Audio is strictly false, and video is never recorded.
 */

export const isSecureContext = () => {
  if (typeof window === 'undefined') return true;
  return Boolean(window.isSecureContext);
};

export const cameraSupported = () => {
  if (typeof navigator === 'undefined') return false;
  return Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
};

/**
 * Checks camera permission using the browser Permissions API if supported.
 * Returns 'granted' | 'denied' | 'prompt' | 'unsupported'.
 */
export async function checkBrowserPermission() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unsupported';
  }
  try {
    const status = await navigator.permissions.query({ name: 'camera' });
    return status?.state || 'prompt';
  } catch {
    // Some browsers reject { name: 'camera' }
    return 'unsupported';
  }
}

/**
 * Checks if a MediaStream is active and currently producing live frames.
 */
export function isStreamActive(stream) {
  if (!stream || !stream.active) return false;
  const tracks = typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks() : [];
  return tracks.length > 0 && tracks.some((t) => t.readyState === 'live');
}

/**
 * Cleanly stops all tracks on a MediaStream to release hardware locks.
 */
export function stopStream(stream) {
  if (!stream) return;
  try {
    const tracks = typeof stream.getTracks === 'function' ? stream.getTracks() : [];
    tracks.forEach((track) => {
      try {
        track.stop();
      } catch {
        /* best effort */
      }
    });
  } catch {
    /* ignore */
  }
}

/**
 * Classifies a getUserMedia error or exception into an accurate, user-friendly key.
 * Handled categories:
 *  - 'denied'         (NotAllowedError, PermissionDeniedError)
 *  - 'notfound'       (NotFoundError, DevicesNotFoundError)
 *  - 'busy'           (NotReadableError, TrackStartError)
 *  - 'overconstrained'(OverconstrainedError, ConstraintNotSatisfiedError)
 *  - 'security'       (SecurityError, Insecure HTTP context)
 *  - 'unsupported'    (Unsupported API)
 *  - 'network'        (Backend communication / Axios error)
 *  - 'error'          (Generic / unexpected)
 */
export function classifyCameraError(err) {
  if (!err) return 'error';
  const name = err.name || '';
  const msg = (err.message || '').toLowerCase();

  // Insecure context or unsupported APIs
  if (name === 'Unsupported' || msg.includes('not supported') || msg.includes('secure context')) {
    return 'unsupported';
  }

  // NotAllowedError: permission dismissed, denied or blocked by browser/OS
  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    msg.includes('permission denied') ||
    msg.includes('permission dismissed')
  ) {
    return 'denied';
  }

  // NotFoundError: no camera device found
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    msg.includes('not found') ||
    msg.includes('no device') ||
    msg.includes('no camera')
  ) {
    return 'notfound';
  }

  // NotReadableError: device is busy or OS/hardware locked by another app
  if (
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    msg.includes('could not start') ||
    msg.includes('device in use') ||
    msg.includes('concurrent') ||
    msg.includes('busy')
  ) {
    return 'busy';
  }

  // OverconstrainedError: constraints cannot be satisfied
  if (
    name === 'OverconstrainedError' ||
    name === 'ConstraintNotSatisfiedError' ||
    msg.includes('overconstrained') ||
    msg.includes('constraint')
  ) {
    return 'overconstrained';
  }

  // SecurityError: iframe permission policy or security restriction
  if (name === 'SecurityError' || msg.includes('security') || msg.includes('insecure')) {
    return 'security';
  }

  // Network/Server issue during consent or session handshake
  if (name === 'AxiosError' || err.isAxiosError || msg.includes('network') || msg.includes('timeout')) {
    return 'network';
  }

  return 'error';
}

/**
 * Requests camera video stream with mobile-compatible constraints and robust fallback.
 * Checks if existingStream is already active to prevent duplicate hardware locks.
 *
 * @param {MediaStream|null} existingStream - Previous stream to reuse or replace.
 * @returns {Promise<MediaStream>}
 */
export async function requestCameraStream(existingStream = null) {
  // Check if existing stream is already active and live
  if (isStreamActive(existingStream)) {
    return existingStream;
  }

  // Clean up any stale previous stream before requesting a new one
  if (existingStream) {
    stopStream(existingStream);
  }

  // Validate security context and mediaDevices availability
  if (!isSecureContext()) {
    throw Object.assign(
      new Error('Camera sharing requires a secure HTTPS connection or localhost.'),
      { name: 'SecurityError' }
    );
  }

  if (!cameraSupported()) {
    throw Object.assign(
      new Error('Camera is not supported on this browser or platform.'),
      { name: 'Unsupported' }
    );
  }

  // Attempt 1: Mobile-friendly user-facing camera constraint
  const preferredConstraints = {
    video: { facingMode: 'user' },
    audio: false
  };

  try {
    return await navigator.mediaDevices.getUserMedia(preferredConstraints);
  } catch (err) {
    console.warn('[camera] Preferred constraint { facingMode: "user" } failed:', err?.name, err?.message);

    // If constraint failed or was rejected, retry with basic video: true
    const retryableErrors = [
      'OverconstrainedError',
      'ConstraintNotSatisfiedError',
      'TypeError',
      'NotReadableError'
    ];

    if (retryableErrors.includes(err?.name)) {
      try {
        console.log('[camera] Retrying with basic { video: true, audio: false } constraint...');
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (fallbackErr) {
        console.warn('[camera] Fallback constraint { video: true } also failed:', fallbackErr?.name, fallbackErr?.message);
        throw fallbackErr;
      }
    }

    // Permission denied, not found, or security errors should not retry silently
    throw err;
  }
}

/**
 * Triggers the genuine browser permission prompt, then IMMEDIATELY releases the camera.
 * Returns 'granted' | 'denied' | 'notfound' | 'busy' | 'security' | 'unsupported' | 'error'.
 */
export async function probeCameraPermission() {
  try {
    const stream = await requestCameraStream();
    stopStream(stream);
    return 'granted';
  } catch (err) {
    return classifyCameraError(err);
  }
}
