import { useState, useRef, useCallback } from 'react';

export interface SessionInfo {
	sessionId: string;
	summary?: string;
	startTime?: string;
	modifiedTime?: string;
	shielded?: boolean;
}

export interface UseSessionManagerConfig {
	apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
	disconnect: () => void;
	connect: () => void;
	openMgmtWs: (handler: (event: Record<string, unknown>) => void) => void;
	/** Called when session changes or is cleared — App resets its own streaming/thinking/message state */
	onSessionReset: () => void;
	/** Called when entering no-session mode — App should clear all session-specific state */
	onEnterNoSession: () => void;
	/** Management WS event handler */
	handleMgmtEvent: (event: Record<string, unknown>) => void;
}

export function useSessionManager(config: UseSessionManagerConfig) {
	const configRef = useRef(config);
	configRef.current = config;

	const hasSessionInUrl = !!new URLSearchParams(window.location.search).get('session');
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(
		new URLSearchParams(window.location.search).get('session')
	);
	const activeSessionIdRef = useRef<string | null>(new URLSearchParams(window.location.search).get('session'));
	const [activeSessionSummary, setActiveSessionSummary] = useState<string | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const [showPicker, setShowPicker] = useState(!hasSessionInUrl);
	const [draftSession, setDraftSession] = useState<{ cwd: string } | null>(null);
	const [noSession, setNoSession] = useState(!hasSessionInUrl);
	const noSessionRef = useRef(!hasSessionInUrl);

	const enterNoSession = useCallback(() => {
		const { disconnect, openMgmtWs, onEnterNoSession, handleMgmtEvent, apiFetch } = configRef.current;
		disconnect();
		noSessionRef.current = true;
		setNoSession(true);
		setActiveSessionId(null);
		activeSessionIdRef.current = null;
		setActiveSessionSummary(null);
		setShowPicker(true);
		setConfirmDeleteId(null);
		setDraftSession(null);
		const params = new URLSearchParams(window.location.search);
		params.delete('session');
		params.delete('all');
		params.delete('history');
		window.history.replaceState(null, '', `?${params.toString()}`);
		onEnterNoSession();
		// Open a lightweight management WS to receive session broadcasts
		openMgmtWs(handleMgmtEvent);
		// Refresh sessions list
		apiFetch('/api/sessions').then(r => r.json()).then(setSessions).catch(() => {});
	}, []);

	const switchSession = useCallback((sessionId: string) => {
		const { disconnect, connect, onSessionReset } = configRef.current;
		noSessionRef.current = false;
		setNoSession(false);
		setShowPicker(false);
		setActiveSessionSummary(null);
		activeSessionIdRef.current = sessionId;
		setActiveSessionId(sessionId);
		const params = new URLSearchParams(window.location.search);
		params.set('session', sessionId);
		params.delete('all');
		params.delete('history');
		window.history.replaceState(null, '', `?${params.toString()}`);
		onSessionReset();
		// Close existing WS — reconnect with new session
		disconnect();
		connect();
	}, []);

	const newSession = useCallback(() => {
		const { disconnect } = configRef.current;
		noSessionRef.current = false;
		setNoSession(false);
		setShowPicker(false);
		setDraftSession({ cwd: '' });
		setActiveSessionId(null);
		activeSessionIdRef.current = null;
		setActiveSessionSummary(null);
		const params = new URLSearchParams(window.location.search);
		params.delete('session');
		params.delete('all');
		params.delete('history');
		window.history.replaceState(null, '', `?${params.toString()}`);
		// Close existing WS
		disconnect();
	}, []);

	const openPicker = useCallback(async () => {
		const { apiFetch } = configRef.current;
		try {
			const res = await apiFetch('/api/sessions');
			const data = await res.json() as SessionInfo[];
			setSessions(data);
			const active = data.find(s => s.sessionId === activeSessionIdRef.current);
			if (active) setActiveSessionSummary(active.summary ?? null);
			setShowPicker(true);
		} catch {
			// caller can handle error
		}
	}, []);

	const deleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		const { apiFetch } = configRef.current;
		const wasActive = sessionId === activeSessionIdRef.current;
		try {
			const res = await apiFetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
			if (!res.ok) return;
			setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
			setConfirmDeleteId(null);
			if (wasActive) enterNoSession();
		} catch {}
	}, [enterNoSession]);

	const toggleShield = useCallback(async (sessionId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		const { apiFetch } = configRef.current;
		setSessions(prev => prev.map(s => s.sessionId === sessionId ? { ...s, shielded: !s.shielded } : s));
		try {
			await apiFetch(`/api/sessions/${sessionId}/shield`, { method: 'PATCH' });
		} catch {
			// revert on error
			setSessions(prev => prev.map(s => s.sessionId === sessionId ? { ...s, shielded: !s.shielded } : s));
		}
	}, []);

	return {
		sessions,
		setSessions,
		activeSessionId,
		setActiveSessionId,
		activeSessionIdRef,
		activeSessionSummary,
		setActiveSessionSummary,
		confirmDeleteId,
		setConfirmDeleteId,
		showPicker,
		setShowPicker,
		draftSession,
		setDraftSession,
		noSession,
		noSessionRef,
		enterNoSession,
		switchSession,
		newSession,
		openPicker,
		deleteSession,
		toggleShield,
	};
}
