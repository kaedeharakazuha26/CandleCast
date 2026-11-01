import { useEffect } from "react";
import { getSocket } from "../services/realtime";
import { useTerminal } from "../store/terminal";

/** Tracks the shared Socket.IO connection for the header indicator on every page. */
export function useRealtimeStatus() {
  const setLive = useTerminal((s) => s.setLive);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setLive(true);
    const onDisconnect = () => setLive(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setLive(socket.connected);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [setLive]);
}
