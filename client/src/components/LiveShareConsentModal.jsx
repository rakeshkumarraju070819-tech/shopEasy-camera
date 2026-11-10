/**
 * LiveShareConsentModal has been removed.
 *
 * The two custom permission popups ("Permission Setup" and "Share your location?")
 * no longer exist. Camera and GPS permissions are requested directly via native
 * browser prompts (getUserMedia / getCurrentPosition) triggered from CameraShareBar.
 *
 * This file is kept as an empty stub to avoid import errors from any cached build.
 */
export default function LiveShareConsentModal() {
  return null;
}
