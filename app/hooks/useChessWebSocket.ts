import { useCallback, useEffect, useRef, useState } from "react";
import { WebSocketService } from "../services/websocket";

type UseChessWebSocketOptions = {
  onMessage?: (message: any) => void;
  autoJoinGameId?: string;
  playerName?: string;
};

export function useChessWebSocket(options?: UseChessWebSocketOptions) {
  const [connectionState, setConnectionState] = useState<
    "connecting" | "open" | "closed"
  >("closed");
  const wsService = useRef(WebSocketService.getInstance());
  const autoJoinedRef = useRef<string | null>(null);

  // Initialize connection on first mount
  useEffect(() => {
    wsService.current.connect();
  }, []);

  // Subscribe to connection state changes
  useEffect(() => {
    const unsubscribe = wsService.current.onStateChange((state) => {
      setConnectionState(state);
    });
    setConnectionState(wsService.current.getState());
    return unsubscribe;
  }, []);

  // Subscribe to messages
  useEffect(() => {
    const onMessage = options?.onMessage;
    if (!onMessage) return;

    const key = options.autoJoinGameId || "__global__";
    wsService.current.subscribe(key, onMessage);

    return () => {
      wsService.current.unsubscribe(key, onMessage);
    };
  }, [options?.onMessage, options?.autoJoinGameId]);

  // Handle auto-join
  useEffect(() => {
    if (
      connectionState !== "open" ||
      !options?.autoJoinGameId
    ) {
      return;
    }

    // Only auto-join if different game
    if (autoJoinedRef.current === options.autoJoinGameId) {
      return;
    }

    autoJoinedRef.current = options.autoJoinGameId;
    wsService.current.send({
      type: "join",
      gameId: options.autoJoinGameId,
      playerName: options.playerName || undefined,
    });
  }, [options?.autoJoinGameId, options?.playerName, connectionState]);

  const send = useCallback((payload: unknown) => {
    return wsService.current.send(payload);
  }, []);

  return {
    ws: null, // Deprecated, kept for compatibility
    connectionState,
    send,
  };
}
