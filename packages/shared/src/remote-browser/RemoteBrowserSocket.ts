import { Session } from '@supabase/supabase-js';
import { Socket, io } from 'socket.io-client';
import { getDockerFriendlyUrl } from '~shared/env/environment';
import { ALogger } from '~shared/logging/ALogger';

export type RemoteBrowserSocketAuth = { userSession: Session | null; useServiceRole?: boolean };
export type RemoteBrowserSocketEventConfig = { remoteBrowserSessionId: string; event: string; data?: object };

export class RemoteBrowserSocket {
  public static getSocketServerUrl(): string {
    const wsOriginRaw = process.env.NEXT_PUBLIC_WS_ORIGIN;
    if (!wsOriginRaw) {
      throw new Error(
        'WebSocket origin not configured. Please set the NEXT_PUBLIC_WS_ORIGIN environment variable in your .env.local file (e.g., NEXT_PUBLIC_WS_ORIGIN=ws://localhost:3001).'
      );
    }

    const wsOrigin = getDockerFriendlyUrl(wsOriginRaw);
    if (!wsOrigin) {
      throw new Error(
        `Invalid WebSocket origin: ${wsOriginRaw}. Ensure NEXT_PUBLIC_WS_ORIGIN is a valid WebSocket URL (e.g., ws://localhost:3001).`
      );
    }

    return wsOrigin;
  }

  public static getSocketConnection(auth: RemoteBrowserSocketAuth): Socket {
    const url = RemoteBrowserSocket.getSocketServerUrl();

    const socketAuth = {} as Record<string, string>;
    if (auth.useServiceRole) {
      const serviceToken = process.env.BROWSERLESS_SERVICE_ROLE_TOKEN;
      if (!serviceToken) throw new Error('Service role token is not set');
      socketAuth.serviceToken = serviceToken;
    } else {
      const token = auth.userSession?.access_token;
      if (token) socketAuth.token = token;
    }

    return io(url, { transports: ['websocket'], auth: socketAuth });
  }

  public static async genAttachToBrowserSession(config: {
    keepAlive?: boolean;
    remoteBrowserSessionId: string;
    resumeOnly?: boolean;
    session?: Session | null;
    useServiceRole?: boolean;
  }): Promise<{ success: boolean; socket: Socket }> {
    const { remoteBrowserSessionId, resumeOnly, keepAlive, session, useServiceRole } = config;
    const socket = RemoteBrowserSocket.getSocketConnection({ userSession: session ?? null, useServiceRole });
    ALogger.info({ context: 'Received socket', sessionId: remoteBrowserSessionId });
    const success = await new Promise<boolean>((resolve, reject) => {
      socket.on('browser-session', () => {
        ALogger.info({ context: 'Browser session found', remoteBrowserSessionId });
        resolve(true);
      });
      socket.on('browser-session-not-found', () => {
        ALogger.warn({ context: 'Browser session not found', remoteBrowserSessionId });
        resolve(false);
      });
      socket.on('connect_error', (error) => {
        ALogger.error({ context: 'Socket connection error:', remoteBrowserSessionId, error });
        reject(error);
      });
      socket.on('error', (error) => ALogger.error({ context: 'WebSocket Error:', remoteBrowserSessionId, error }));
      socket.on('disconnect', (reason: string) =>
        ALogger.info({ context: 'WebSocket Disconnected:', remoteBrowserSessionId, reason }),
      );
      socket.on('connect', () => {
        ALogger.info({ context: 'Connected to WebSocket server', sessionId: remoteBrowserSessionId });
        socket.emit('connect-browser', { sessionId: remoteBrowserSessionId, resumeOnly, keepAlive });
      });
    });
    return { success, socket };
  }

  public static killBrowserSession(auth: RemoteBrowserSocketAuth, remoteBrowserSessionId: string): void {
    this.emitEvent(auth, { remoteBrowserSessionId: remoteBrowserSessionId, event: 'close-browser' });
  }

  public static killAllBrowserSessions(auth: RemoteBrowserSocketAuth): void {
    const socket = this.getSocketConnection(auth);
    socket.emit('close-all-sessions');
    ALogger.info({ context: 'Request sent to kill all browser sessions' });
  }

  public static emitEvent(auth: RemoteBrowserSocketAuth, config: RemoteBrowserSocketEventConfig): void {
    const socket = this.getSocketConnection(auth);
    socket.emit(config.event, { sessionId: config.remoteBrowserSessionId, ...config.data });
  }

  public static startScreencast(auth: RemoteBrowserSocketAuth, remoteBrowserSessionId: string): void {
    const emitBrowserEvent = (event: string, data?: object) =>
      this.emitEvent(auth, { remoteBrowserSessionId: remoteBrowserSessionId, event, data });

    emitBrowserEvent('get-tabs'); // tabs will be handled by the RemoteBrowserContainer
    emitBrowserEvent('start-screencast');

    ALogger.info({ context: 'Screencast started', remoteBrowserSessionId });
  }

  public static stopScreencast(auth: RemoteBrowserSocketAuth, remoteBrowserSessionId: string): void {
    this.emitEvent(auth, { remoteBrowserSessionId: remoteBrowserSessionId, event: 'stop-screencast' });
  }
}
