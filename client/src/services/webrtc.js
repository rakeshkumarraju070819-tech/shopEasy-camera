import { io } from 'socket.io-client';
import api from './api';

let visitorSocket = null;
let adminSocket = null;

export async function getIceServers() {
  try {
    const res = await api.get('/webrtc/config');
    if (res.data?.iceServers?.length) return res.data.iceServers;
  } catch { /* use fallback */ }
  return [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelay',
      credential: 'openrelay'
    }
  ];
}

export function getSocket(auth = {}) {
  const isAdmin = Boolean(auth.token);

  if (isAdmin) {
    if (!adminSocket || adminSocket.disconnected) {
      adminSocket = io({
        path: '/socket.io',
        auth,
        transports: ['websocket', 'polling'],
        autoConnect: true
      });
    } else {
      adminSocket.auth = auth;
    }
    return adminSocket;
  }

  // Visitor socket
  if (!visitorSocket || visitorSocket.disconnected) {
    visitorSocket = io({
      path: '/socket.io',
      auth,
      transports: ['websocket', 'polling'],
      autoConnect: true
    });
  } else {
    visitorSocket.auth = auth;
  }
  return visitorSocket;
}

export function disconnectSocket() {
  if (visitorSocket) {
    visitorSocket.disconnect();
    visitorSocket = null;
  }
}

export function disconnectAdminSocket() {
  if (adminSocket) {
    adminSocket.disconnect();
    adminSocket = null;
  }
}

/**
 * Customer Broadcaster Session.
 * Streams camera to administrator using WebRTC.
 */
export class BroadcasterSession {
  constructor({ stream, visitorId, sessionToken, onStatusChange }) {
    this.stream = stream;
    this.visitorId = visitorId;
    this.sessionToken = sessionToken;
    this.onStatusChange = onStatusChange || (() => {});
    this.peerConnections = new Map(); // adminSocketId → RTCPeerConnection
    this.socket = getSocket({ visitorId, sessionToken });
    this.iceServers = null;
    this._candidateQueue = [];
    this._handlers = {};
  }

  async start() {
    this.iceServers = await getIceServers();

    this.socket.emit('broadcaster:start', {
      visitorId: this.visitorId,
      sessionToken: this.sessionToken,
      browser: navigator.userAgent,
      deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
    });

    this.onStatusChange('broadcasting');

    // Admin requests to view → create offer for that admin
    this._handlers.viewerReady = async ({ adminSocketId }) => {
      await this._createPeerConnection(adminSocketId);
    };

    // Admin sent us an answer
    this._handlers.answer = async ({ answer, adminSocketId }) => {
      const pc = this.peerConnections.get(adminSocketId);
      if (pc && answer) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          // Flush any queued ICE candidates
          while (this._candidateQueue.length > 0) {
            const item = this._candidateQueue.shift();
            const targetPc = this.peerConnections.get(item.senderId);
            if (targetPc) {
              try {
                await targetPc.addIceCandidate(new RTCIceCandidate(item.candidate));
              } catch (e) {
                /* ignore */
              }
            }
          }
        } catch (err) {
          console.error('[WebRTC Broadcaster] setRemoteDescription error:', err);
        }
      }
    };

    // ICE candidate from admin
    this._handlers.ice = async ({ candidate, senderSocketId }) => {
      const pc = this.peerConnections.get(senderSocketId);
      if (pc && candidate) {
        if (!pc.remoteDescription) {
          this._candidateQueue.push({ candidate, senderId: senderSocketId });
        } else {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error('[WebRTC Broadcaster] addIceCandidate error:', err);
          }
        }
      }
    };

    this.socket.on('viewer:ready', this._handlers.viewerReady);
    this.socket.on('webrtc:answer', this._handlers.answer);
    this.socket.on('webrtc:ice-candidate', this._handlers.ice);
  }

  async _createPeerConnection(adminSocketId) {
    if (this.peerConnections.has(adminSocketId)) {
      this.peerConnections.get(adminSocketId).close();
      this.peerConnections.delete(adminSocketId);
    }

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(adminSocketId, pc);

    // Add camera tracks
    if (this.stream) {
      this.stream.getTracks().forEach((t) => pc.addTrack(t, this.stream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc:ice-candidate', {
          targetSocketId: adminSocketId,
          candidate: event.candidate,
          visitorId: this.visitorId
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.peerConnections.delete(adminSocketId);
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('webrtc:offer', {
        targetAdminId: adminSocketId,
        offer,
        visitorId: this.visitorId
      });
    } catch (err) {
      console.error('[WebRTC Broadcaster] createOffer error:', err);
    }
  }

  stop() {
    this.socket.emit('broadcaster:stop', { visitorId: this.visitorId });

    if (this._handlers.viewerReady) this.socket.off('viewer:ready', this._handlers.viewerReady);
    if (this._handlers.answer) this.socket.off('webrtc:answer', this._handlers.answer);
    if (this._handlers.ice) this.socket.off('webrtc:ice-candidate', this._handlers.ice);

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }

    this.onStatusChange('stopped');
  }
}

/**
 * Admin Viewer Session.
 * Receives and displays a customer's live camera feed.
 */
export class AdminViewerSession {
  constructor({ token, visitorId, onRemoteStream, onConnectionStateChange }) {
    this.token = token;
    this.visitorId = visitorId;
    this.onRemoteStream = onRemoteStream || (() => {});
    this.onConnectionStateChange = onConnectionStateChange || (() => {});
    this.socket = getSocket({ token });
    this.pc = null;
    this.customerSocketId = null;
    this._candidateQueue = [];
    this._handlers = {};
  }

  async start() {
    const iceServers = await getIceServers();
    this.pc = new RTCPeerConnection({ iceServers });

    this.pc.ontrack = (event) => {
      if (event.streams?.[0]) {
        this.onRemoteStream(event.streams[0]);
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.customerSocketId) {
        this.socket.emit('webrtc:ice-candidate', {
          targetSocketId: this.customerSocketId,
          candidate: event.candidate,
          visitorId: this.visitorId
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.onConnectionStateChange(this.pc.connectionState);
    };

    // Handle offer from customer broadcaster
    this._handlers.offer = async (data) => {
      if (data.visitorId !== this.visitorId || !data.offer) return;
      this.customerSocketId = data.customerSocketId;

      try {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        // Flush any queued candidates
        while (this._candidateQueue.length > 0) {
          const cand = this._candidateQueue.shift();
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch (e) {
            /* ignore */
          }
        }

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        this.socket.emit('webrtc:answer', {
          targetCustomerId: data.customerSocketId,
          answer,
          visitorId: this.visitorId
        });
      } catch (err) {
        console.error('[WebRTC Admin] handleOffer error:', err);
      }
    };

    // Handle ICE candidate from customer
    this._handlers.ice = async (data) => {
      if (data.visitorId !== this.visitorId || !data.candidate || !this.pc) return;
      if (!this.pc.remoteDescription) {
        this._candidateQueue.push(data.candidate);
      } else {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error('[WebRTC Admin] addIceCandidate error:', err);
        }
      }
    };

    this.socket.on('webrtc:offer', this._handlers.offer);
    this.socket.on('webrtc:ice-candidate', this._handlers.ice);

    // Request customer to send offer
    this.socket.emit('viewer:join', { visitorId: this.visitorId });
  }

  stop() {
    if (this._handlers.offer) this.socket.off('webrtc:offer', this._handlers.offer);
    if (this._handlers.ice) this.socket.off('webrtc:ice-candidate', this._handlers.ice);
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}
