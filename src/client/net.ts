import { DEFAULT_PORT } from '../shared/constants.ts';
import type { ClientMessage, ServerMessage } from '../shared/net.ts';
import type { GameState } from './state.ts';

export class Connection {
  private socket: WebSocket | null = null;
  private queue: ClientMessage[] = [];
  connected = false;
  onOpen?: () => void;
  onClose?: (reason: string) => void;

  constructor(private readonly state: GameState) {}

  connect(username: string): void {
    const isDev = location.port === '5173' || location.port === '' || location.protocol === 'file:';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = isDev ? `${proto}//${location.hostname || 'localhost'}:${DEFAULT_PORT}` : `${proto}//${location.host}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.connected = true;
      this.send({ t: 'login', name: username });
      for (const msg of this.queue) socket.send(JSON.stringify(msg));
      this.queue.length = 0;
      this.onOpen?.();
    };
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      this.state.handle(msg, performance.now());
    };
    socket.onclose = () => {
      this.connected = false;
      this.onClose?.('Connection to the server was lost.');
    };
    socket.onerror = () => {
      if (!this.connected) this.onClose?.('Could not reach the game server. Is it running?');
    };
  }

  send(msg: ClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
    else this.queue.push(msg);
  }

  close(): void {
    this.socket?.close();
  }
}
