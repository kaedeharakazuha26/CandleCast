import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** One shared Socket.IO connection for market ticks and alerts. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io("/", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 8000,
    });
  }
  return socket;
}
