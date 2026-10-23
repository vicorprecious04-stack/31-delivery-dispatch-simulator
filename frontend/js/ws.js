export function connectWebSocket(onEvent) {
  let socket, stopped = false, delay = 800;
  const connect = () => {
    if (stopped) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.onopen = () => { delay = 800; };
    socket.onmessage = e => { try { onEvent(JSON.parse(e.data)); } catch {} };
    socket.onclose = () => { if (!stopped) { setTimeout(connect, delay); delay = Math.min(delay * 1.8, 15000); } };
    socket.onerror = () => socket.close();
  };
  connect();
  return () => { stopped = true; socket?.close(); };
}
