import { io, type Socket } from "socket.io-client";

/**
 * Socket.IO connection to the (unchanged) backend. Mirrors the existing usage:
 * connect to the API origin (or same origin behind the reverse proxy), then
 * join/leave named rooms (e.g. `contest:<id>`). Verdict and scoreboard events
 * are emitted by the backend exactly as before.
 */
export function createSocket(): Socket {
  const url =
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return io(url, { transports: ["websocket", "polling"], autoConnect: true });
}

export function joinRoom(socket: Socket, room: string): void {
  socket.emit("join", room);
}

// Ack'd variant — resolves only once the server has actually processed the
// join (socket.join() called), not just once the emit has been sent. Use this
// when something after the join (e.g. submitting a job) could complete fast
// enough to race a fire-and-forget join.
export function joinRoomAck(socket: Socket, room: string): Promise<void> {
  return new Promise((resolve) => {
    socket.emit("join", room, () => resolve());
  });
}

export function leaveRoom(socket: Socket, room: string): void {
  socket.emit("leave", room);
}
