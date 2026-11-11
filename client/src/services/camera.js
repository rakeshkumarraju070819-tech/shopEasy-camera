// Thin wrappers around getUserMedia. Video only, never audio, and nothing is recorded:
// the stream is only ever attached to a <video> element on the camera test page.

export const cameraSupported = () => Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * Check camera permission status using Permissions API
 * Returns: 'granted' | 'denied' | 'prompt' | 'unsupported'
 */
export async function checkCameraPermission() {
  try {
    // Permissions API is not universally supported
    if (!navigator.permissions || !navigator.permissions.query) {
      console.log('[Camera] Permissions API not supported');
      return 'prompt'; // Assume we can ask
    }

    const result = await navigator.permissions.query({ name: 'camera' });
    console.log('[Camera] Permission status:', result.state);
    return result.state; // 'granted', 'denied', or 'prompt'
  } catch (err) {
    // Safari and some browsers don't support camera permission query
    console.warn('[Camera] Permission query failed:', err.message);
    return 'prompt'; // Assume we can try
  }
}

/**
 * Check geolocation permission status
 * Returns: 'granted' | 'denied' | 'prompt' | 'unsupported'
 */
export async function checkGeolocationPermission() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) {
      console.log('[GPS] Permissions API not supported');
      return 'prompt';
    }

    const result = await navigator.permissions.query({ name: 'geolocation' });
    console.log('[GPS] Permission status:', result.state);
    return result.state;
  } catch (err) {
    console.warn('[GPS] Permission query failed:', err.message);
    return 'prompt';
  }
}

/** Maps a getUserMedia error to the permission result we report. */
export function classifyCameraError(err) {
  if (err?.name === 'Unsupported') return 'unsupported';
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(err?.name)) return 'denied';
  if (['NotFoundError', 'DevicesNotFoundError'].includes(err?.name)) return 'notfound';
  if (['NotReadableError', 'TrackStartError'].includes(err?.name)) return 'busy';
  return 'error'; // general camera error
}

export async function requestCameraStream() {
  if (!cameraSupported()) {
    throw Object.assign(new Error('Camera not supported'), { name: 'Unsupported' });
  }

  // Attempt 1: prefer front/user-facing camera with ideal constraint (safe for desktop & mobile)
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch (err) {
    // If overconstrained, fall back to basic video stream (any available camera)
    if (
      err?.name === 'OverconstrainedError' ||
      err?.name === 'ConstraintNotSatisfiedError' ||
      err?.name === 'TypeError'
    ) {
      console.warn('[camera] Ideal constraint failed, falling back to basic video', err);
      return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    throw err;
  }
}

export const stopStream = (stream) => stream?.getTracks().forEach((t) => t.stop());

/**
 * Triggers the genuine browser permission prompt, then IMMEDIATELY releases the camera.
 * Returns 'granted' | 'denied' | 'error' | 'unsupported'.
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
