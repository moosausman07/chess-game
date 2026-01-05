type ServerMessage = any;

type ConnectionState = "connecting" | "open" | "closed";
type StateListener = (state: ConnectionState) => void;
type MessageListener = (msg: ServerMessage) => void;

const WS_PATH = "/ws";

function getWebSocketUrl() {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl) return envUrl;

  const envPath = (import.meta.env as { VITE_WS_PATH?: string }).VITE_WS_PATH;
  const path = envPath || WS_PATH;

  const devDefault = import.meta.env.DEV
    ? `ws://localhost:3001${path}`
    : undefined;

  if (typeof window === "undefined") {
    return devDefault || `ws://localhost:3001${path}`;
  }

  if (devDefault) return devDefault;

  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = path;
  return url.toString();
}

export class WebSocketService {
  private static instance: WebSocketService;
  private socket: WebSocket | null = null;
  private state: ConnectionState = "closed";
  private stateListeners = new Set<StateListener>();
  private messageListeners = new Map<string, Set<MessageListener>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  connect(): void {
    if (this.socket) return;
    if (typeof window === "undefined") return;

    this.setState("connecting");
    const url = getWebSocketUrl();
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState("open");
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.routeMessage(message);
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    this.socket.onerror = () => {
      this.setState("closed");
    };

    this.socket.onclose = () => {
      this.socket = null;
      this.setState("closed");
      this.attemptReconnect();
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    setTimeout(() => this.connect(), delay);
  }

  private routeMessage(message: ServerMessage): void {
    if (message.gameId) {
      // Route game-specific messages to game listeners
      const listeners = this.messageListeners.get(message.gameId);
      listeners?.forEach((listener) => listener(message));
    } else {
      // Route global messages to global listeners
      const listeners = this.messageListeners.get("__global__");
      listeners?.forEach((listener) => listener(message));
    }
  }

  subscribe(key: string, listener: MessageListener): void {
    if (!this.messageListeners.has(key)) {
      this.messageListeners.set(key, new Set());
    }
    this.messageListeners.get(key)!.add(listener);
  }

  unsubscribe(key: string, listener: MessageListener): void {
    const listeners = this.messageListeners.get(key);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.messageListeners.delete(key);
      }
    }
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  send(message: unknown): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateListeners.forEach((listener) => listener(newState));
    }
  }
}
