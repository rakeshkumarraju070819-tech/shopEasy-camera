// Thin wrappers around getUserMedia. Video only, never audio, and nothing is recorded:
// the stream is only ever attached to a <video> element on the camera test page.

export const cameraSupported = () => Boolean(navigator.mediaDevices?.getUserMedia);

/** Maps a getUserMedia error to the permission result we report. */
export function classifyCameraError(err) {
  if (err?.name === 'Unsupported') return 'unsupported';
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(err?.name)) return 'denied';
  return 'error'; // no camera, camera busy, etc.
}

export function requestCameraStream() {
  if (!cameraSupported()) return Promise.reject(Object.assign(new Error('Camera not supported'), { name: 'Unsupported' }));
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
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
