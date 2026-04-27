import { useState, useRef, useCallback, useEffect } from 'react';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'no_token';

export interface UseWebSocketConfig {
	/** Return current auth token or null */
	getToken: () => string | null;
	/** Ref tracking whether we're in no-session mode */
	noSessionRef: React.MutableRefObject<boolean>;
	/** Initial connection state */
	initialState?: ConnectionState;
	/** Called when WS connection opens successfully */
	onConnected?: () => void;
	/** Called for each parsed WS event (pong handled internally) */
	onEvent: (event: Record<string, unknown>) => void;
	/** Called when connection drops — App should clear streaming/thinking UI */
	onDisconnected?: () => void;
	/** Called when 3 consecutive fast failures indicate an invalid token */
	onAuthFailed?: () => void;
}

export function useWebSocket(config: UseWebSocketConfig) {
	// Keep config in a ref so WS callbacks always read the latest version
	const configRef = useRef(config);
	configRef.current = config;

	const [connectionState, setConnectionState] = useState<ConnectionState>(
		config.initialState ?? 'disconnected'
	);
	const [connectingSecs, setConnectingSecs] = useState(0);

	const wsRef = useRef<WebSocket | null>(null);
	const mgmtWsRef = useRef<WebSocket | null>(null);
	const heartbeatRef = useRef<{ interval: ReturnType<typeof setInterval>; timeout: ReturnType<typeof setTimeout> | null } | null>(null);
	const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const lastConnectTime = useRef(0);
	const fastFailCount = useRef(0);

	const stopHeartbeat = () => {
		if (heartbeatRef.current) {
			clearInterval(heartbeatRef.current.interval);
			if (heartbeatRef.current.timeout) clearTimeout(heartbeatRef.current.timeout);
			heartbeatRef.current = null;
		}
	};

	const connect = useCallback(() => {
		const token = configRef.current.getToken();
		if (!token) { setConnectionState('no_token'); return; }
		if (configRef.current.noSessionRef.current) return;

		// Close management WS before opening a session WS (they're mutually exclusive).
		if (mgmtWsRef.current) {
			mgmtWsRef.current.onmessage = null;
			mgmtWsRef.current.onerror = null;
			mgmtWsRef.current.close();
			mgmtWsRef.current = null;
		}

		// Kill any existing connection before creating a new one.
		lastConnectTime.current = Date.now();
		setConnectionState('connecting');
		const prev = wsRef.current;
		if (prev) {
			if (prev.readyState !== WebSocket.CLOSED) prev.close();
			prev.onopen = null;
			prev.onmessage = null;
			prev.onerror = null;
			prev.onclose = null;
		}

		const sessionId = new URLSearchParams(window.location.search).get('session');
		const sessionParam = sessionId ? `&session=${sessionId}` : '';
		const historyParam = new URLSearchParams(window.location.search).get('history');
		const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
		const wsUrl = `${wsProto}://${window.location.host}?token=${token}${sessionParam}${historyParam ? `&history=${historyParam}` : ''}`;
		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;
		let hadMsg = false;

		ws.onopen = () => {
			fastFailCount.current = 0;
			setConnectionState('connected');
			// Start application-level heartbeat (browser WS API doesn't expose protocol pings)
			stopHeartbeat();
			const hb = { interval: setInterval(() => {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send('{"type":"ping"}');
					hb.timeout = setTimeout(() => {
						// No pong received — connection is stale
						ws.close();
					}, 5000);
				}
			}, 30_000), timeout: null as ReturnType<typeof setTimeout> | null };
			heartbeatRef.current = hb;
			configRef.current.onConnected?.();
		};

		ws.onmessage = (e) => {
			hadMsg = true;
			fastFailCount.current = 0;
			try {
				const event = JSON.parse(e.data as string) as Record<string, unknown>;
				if (event.type === 'pong') {
					// Heartbeat response — clear the stale-connection timeout
					if (heartbeatRef.current?.timeout) { clearTimeout(heartbeatRef.current.timeout); heartbeatRef.current.timeout = null; }
					return;
				}
				configRef.current.onEvent(event);
			} catch {}
		};

		ws.onclose = (e) => {
			// Ignore close events from replaced connections
			if (wsRef.current !== ws) return;
			stopHeartbeat();
			setConnectionState('disconnected');
			configRef.current.onDisconnected?.();
			if (e.code === 4404) return; // session not found — handled above, don't retry
			// Detect auth failure: fast close with no messages received suggests a bad token.
			if (!hadMsg && Date.now() - lastConnectTime.current < 5000) {
				fastFailCount.current += 1;
				if (fastFailCount.current >= 3) {
					fastFailCount.current = 0;
					setConnectionState('no_token');
					configRef.current.onAuthFailed?.();
					return; // stop retrying — token is invalid
				}
			} else {
				fastFailCount.current = 0; // reset on non-fast failures
			}
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
			reconnectTimer.current = setTimeout(() => connect(), 2000);
		};

		ws.onerror = () => ws.close();
	}, []);

	const sendMessage = useCallback((msg: object | string) => {
		const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
		wsRef.current?.send(data);
	}, []);

	const openMgmtWs = useCallback((onEvent: (event: Record<string, unknown>) => void) => {
		const token = configRef.current.getToken();
		if (!token) return;
		// Close any existing mgmt WS before opening a new one
		if (mgmtWsRef.current) { mgmtWsRef.current.onerror = null; mgmtWsRef.current.close(); }
		const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
		const mgmtWs = new WebSocket(`${proto}://${window.location.host}?token=${token}&management=1`);
		mgmtWs.onmessage = (e) => {
			try {
				const event = JSON.parse(e.data as string) as Record<string, unknown>;
				onEvent(event);
			} catch {}
		};
		mgmtWs.onerror = () => mgmtWs.close();
		mgmtWsRef.current = mgmtWs;
	}, []);

	const closeMgmtWs = useCallback(() => {
		if (mgmtWsRef.current) {
			mgmtWsRef.current.onmessage = null;
			mgmtWsRef.current.onerror = null;
			mgmtWsRef.current.close();
			mgmtWsRef.current = null;
		}
	}, []);

	const disconnect = useCallback(() => {
		const ws = wsRef.current;
		if (ws) {
			ws.onopen = null;
			ws.onmessage = null;
			ws.onerror = null;
			ws.onclose = null;
			ws.close();
		}
		wsRef.current = null;
		if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
		stopHeartbeat();
		setConnectionState('disconnected');
	}, []);

	// Count seconds since entering 'connecting' state
	useEffect(() => {
		if (connectionState !== 'connecting') { setConnectingSecs(0); return; }
		const start = Date.now();
		setConnectingSecs(1);
		const t = setInterval(() => setConnectingSecs(Math.floor((Date.now() - start) / 1000) + 1), 1000);
		return () => clearInterval(t);
	}, [connectionState]);

	// Reconnect when page becomes visible/focused after being backgrounded.
	useEffect(() => {
		const checkConnection = () => {
			if (Date.now() - lastConnectTime.current < 1500) return;
			const ws = wsRef.current;
			if (!ws) return;
			if (ws.readyState === WebSocket.OPEN) {
				// Connection looks alive — send a ping to verify
				ws.send('{"type":"ping"}');
				if (heartbeatRef.current) {
					if (heartbeatRef.current.timeout) clearTimeout(heartbeatRef.current.timeout);
					heartbeatRef.current.timeout = setTimeout(() => ws.close(), 5000);
				}
				return;
			}
			if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
			if (ws.readyState === WebSocket.CONNECTING) ws.close();
			connect();
		};
		const onVisibility = () => { if (document.visibilityState === 'visible') checkConnection(); };
		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('focus', checkConnection);
		window.addEventListener('pageshow', checkConnection);
		// Retry every 2s if still not connected
		const retryInterval = setInterval(() => {
			const state = wsRef.current?.readyState;
			if (state !== WebSocket.OPEN && state !== WebSocket.CONNECTING) connect();
		}, 2000);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('focus', checkConnection);
			window.removeEventListener('pageshow', checkConnection);
			clearInterval(retryInterval);
		};
	}, [connect]);

	return {
		connectionState,
		connectingSecs,
		wsRef,
		mgmtWsRef,
		connect,
		sendMessage,
		openMgmtWs,
		closeMgmtWs,
		disconnect,
	};
}
