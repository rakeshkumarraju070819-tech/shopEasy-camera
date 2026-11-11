/**
 * Centralized Permission Manager
 * 
 * Handles automatic camera and GPS permission requests on first visit,
 * with intelligent retry logic on customer interactions.
 * 
 * Prevents:
 * - Duplicate permission requests
 * - Permission loops
 * - Multiple simultaneous requests
 * - Auto-retry after explicit denial
 */

import { requestCameraStream, stopStream, checkCameraPermission, checkGeolocationPermission } from './camera';

class PermissionManager {
  constructor() {
    // Track permission request state
    this.isRequestingCamera = false;
    this.isRequestingGps = false;
    this.cameraAttempted = false;
    this.gpsAttempted = false;
    
    // Callbacks for permission changes
    this.onCameraGranted = null;
    this.onCameraDenied = null;
    this.onGpsGranted = null;
    this.onGpsDenied = null;
    
    // Store last known permission states
    this.lastCameraState = null;
    this.lastGpsState = null;
    
    // Track if we're in auto-request mode (first visit)
    this.autoRequestMode = false;
    
    // Queue for user interactions that triggered permission requests
    this.pendingInteraction = null;
  }

  /**
   * Initialize automatic permission flow on first visit
   * Should be called once on mount
   */
  async initializeAutoPermissions(callbacks = {}) {
    this.autoRequestMode = true;
    this.onCameraGranted = callbacks.onCameraGranted;
    this.onCameraDenied = callbacks.onCameraDenied;
    this.onGpsGranted = callbacks.onGpsGranted;
    this.onGpsDenied = callbacks.onGpsDenied;
    
    console.log('[PermissionManager] Initializing auto-permissions...');
    
    // Check current permission states
    const cameraState = await checkCameraPermission();
    const gpsState = await checkGeolocationPermission();
    
    this.lastCameraState = cameraState;
    this.lastGpsState = gpsState;
    
    console.log('[PermissionManager] Current states:', { camera: cameraState, gps: gpsState });
    
    // If camera already granted, auto-request it
    if (cameraState === 'granted') {
      console.log('[PermissionManager] Camera already granted - auto-starting');
      await this.requestCameraPermission(true);
    } else if (cameraState === 'prompt') {
      // Try to auto-request, but browser may require user gesture
      console.log('[PermissionManager] Camera in prompt state - attempting auto-request');
      try {
        await this.requestCameraPermission(true);
      } catch (err) {
        // Browser blocked auto-request - will retry on user interaction
        console.log('[PermissionManager] Auto-request blocked - will retry on user gesture');
      }
    } else if (cameraState === 'denied') {
      console.log('[PermissionManager] Camera denied - not auto-requesting');
      this.cameraAttempted = true;
      this.onCameraDenied?.('denied');
    }
    
    this.autoRequestMode = false;
  }

  /**
   * Request camera permission
   * @param {boolean} isAuto - true if auto-requested, false if from user interaction
   * @returns {Promise<MediaStream|null>}
   */
  async requestCameraPermission(isAuto = false) {
    // Prevent duplicate requests
    if (this.isRequestingCamera) {
      console.log('[PermissionManager] Camera request already in progress');
      return null;
    }
    
    // Check if permission is denied - don't retry
    const currentState = await checkCameraPermission();
    if (currentState === 'denied') {
      console.log('[PermissionManager] Camera permission denied - not requesting');
      this.cameraAttempted = true;
      this.onCameraDenied?.('denied');
      return null;
    }
    
    // If already granted, don't show prompt again
    if (currentState === 'granted') {
      console.log('[PermissionManager] Camera permission already granted');
    }
    
    this.isRequestingCamera = true;
    console.log('[PermissionManager] Requesting camera...', { isAuto });
    
    try {
      const stream = await requestCameraStream();
      this.isRequestingCamera = false;
      this.cameraAttempted = true;
      this.lastCameraState = 'granted';
      
      console.log('[PermissionManager] Camera granted!');
      this.onCameraGranted?.(stream);
      
      // After camera success, auto-request GPS
      await this.requestGpsPermission(true);
      
      return stream;
    } catch (err) {
      this.isRequestingCamera = false;
      this.cameraAttempted = true;
      
      const isDenied = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(err?.name);
      this.lastCameraState = isDenied ? 'denied' : 'error';
      
      console.log('[PermissionManager] Camera request failed:', { 
        error: err.name, 
        isDenied,
        isAuto 
      });
      
      if (isDenied) {
        this.onCameraDenied?.(isAuto ? 'blocked_by_browser' : 'denied');
      } else {
        this.onCameraDenied?.(err.name || 'error');
      }
      
      return null;
    }
  }

  /**
   * Request GPS permission
   * @param {boolean} isAuto - true if auto-requested after camera
   * @returns {Promise<object|null>}
   */
  async requestGpsPermission(isAuto = false) {
    if (!navigator.geolocation) {
      console.log('[PermissionManager] Geolocation not supported');
      this.onGpsDenied?.('unavailable');
      return null;
    }
    
    // Prevent duplicate requests
    if (this.isRequestingGps) {
      console.log('[PermissionManager] GPS request already in progress');
      return null;
    }
    
    // Check if permission is denied - don't retry
    const currentState = await checkGeolocationPermission();
    if (currentState === 'denied') {
      console.log('[PermissionManager] GPS permission denied - not requesting');
      this.gpsAttempted = true;
      this.onGpsDenied?.('denied');
      return null;
    }
    
    this.isRequestingGps = true;
    console.log('[PermissionManager] Requesting GPS...', { isAuto });
    
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.isRequestingGps = false;
          this.gpsAttempted = true;
          this.lastGpsState = 'granted';
          
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: new Date(pos.timestamp).toISOString()
          };
          
          console.log('[PermissionManager] GPS granted!', coords);
          this.onGpsGranted?.(coords);
          resolve(coords);
        },
        (err) => {
          this.isRequestingGps = false;
          this.gpsAttempted = true;
          
          const isDenied = err.code === 1; // PERMISSION_DENIED
          this.lastGpsState = isDenied ? 'denied' : 'error';
          
          console.log('[PermissionManager] GPS request failed:', {
            code: err.code,
            message: err.message,
            isDenied,
            isAuto
          });
          
          this.onGpsDenied?.(isDenied ? 'denied' : 'error');
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        }
      );
    });
  }

  /**
   * Handle customer interaction - check and retry permissions if needed
   * Should be called from user clicks/taps on interactive elements
   */
  async handleUserInteraction() {
    console.log('[PermissionManager] User interaction detected');
    
    // Prevent multiple simultaneous requests
    if (this.isRequestingCamera || this.isRequestingGps) {
      console.log('[PermissionManager] Request already in progress');
      return;
    }
    
    // Check current states
    const cameraState = await checkCameraPermission();
    const gpsState = await checkGeolocationPermission();
    
    console.log('[PermissionManager] Current states on interaction:', {
      camera: cameraState,
      gps: gpsState
    });
    
    // If camera is in prompt state and not yet attempted, try to request
    if (cameraState === 'prompt' && !this.cameraAttempted) {
      console.log('[PermissionManager] Retrying camera on user interaction');
      await this.requestCameraPermission(false);
      return; // GPS will be requested automatically after camera
    }
    
    // If camera granted but GPS in prompt state, try GPS
    if (cameraState === 'granted' && gpsState === 'prompt' && !this.gpsAttempted) {
      console.log('[PermissionManager] Retrying GPS on user interaction');
      await this.requestGpsPermission(false);
      return;
    }
    
    // Check if permission states changed (e.g., user enabled in browser settings)
    if (cameraState !== this.lastCameraState) {
      console.log('[PermissionManager] Camera state changed from settings:', {
        from: this.lastCameraState,
        to: cameraState
      });
      
      if (cameraState === 'granted') {
        this.lastCameraState = 'granted';
        await this.requestCameraPermission(false);
        return;
      }
    }
    
    if (gpsState !== this.lastGpsState) {
      console.log('[PermissionManager] GPS state changed from settings:', {
        from: this.lastGpsState,
        to: gpsState
      });
      
      if (gpsState === 'granted' && cameraState === 'granted') {
        this.lastGpsState = 'granted';
        await this.requestGpsPermission(false);
        return;
      }
    }
    
    console.log('[PermissionManager] No permission retry needed on this interaction');
  }

  /**
   * Manually retry camera permission (e.g., from navbar button)
   */
  async retryCameraPermission() {
    console.log('[PermissionManager] Manual camera retry requested');
    this.cameraAttempted = false; // Allow retry
    return await this.requestCameraPermission(false);
  }

  /**
   * Manually retry GPS permission
   */
  async retryGpsPermission() {
    console.log('[PermissionManager] Manual GPS retry requested');
    this.gpsAttempted = false; // Allow retry
    return await this.requestGpsPermission(false);
  }

  /**
   * Reset the manager (for testing or cleanup)
   */
  reset() {
    this.isRequestingCamera = false;
    this.isRequestingGps = false;
    this.cameraAttempted = false;
    this.gpsAttempted = false;
    this.lastCameraState = null;
    this.lastGpsState = null;
    this.autoRequestMode = false;
    this.pendingInteraction = null;
  }

  /**
   * Get instruction message for denied permissions
   */
  getDeniedInstructionMessage(type = 'camera') {
    if (type === 'camera') {
      return 'Camera access denied. To enable: Click the 🔒 lock icon in your browser address bar → Site settings → Camera → Allow';
    } else {
      return 'Location access denied. To enable: Click the 🔒 lock icon in your browser address bar → Site settings → Location → Allow';
    }
  }
}

// Create singleton instance
export const permissionManager = new PermissionManager();

/**
 * React hook to attach permission retry to user interactions
 */
export function usePermissionRetry() {
  const handleClick = async (e) => {
    // Don't prevent default or stop propagation - let the click work normally
    // Just try to handle permissions in the background
    await permissionManager.handleUserInteraction();
  };

  return { handleClick };
}
