import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../services/webrtc';
import { useAuth } from '../context/AuthContext';

/**
 * Returns the number of currently-active live streams.
 * Used by the Admin sidebar badge.
 */
export function useLiveSessionCount() {
  const { token } = useAuth();
  const [count, setCount] = useState(0);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket({ token });
    socketRef.current = socket;

    const onActiveStreams = (streams) => setCount(Array.isArray(streams) ? streams.length : 0);
    const onAvailable = () => setCount((n) => n + 1);
    const onStopped = () => setCount((n) => Math.max(0, n - 1));

    socket.on('admin:active-streams', onActiveStreams);
    socket.on('stream:available', onAvailable);
    socket.on('stream:stopped', onStopped);

    return () => {
      socket.off('admin:active-streams', onActiveStreams);
      socket.off('stream:available', onAvailable);
      socket.off('stream:stopped', onStopped);
    };
  }, [token]);

  return count;
}

