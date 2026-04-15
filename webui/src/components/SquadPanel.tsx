import { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { ComponentProps } from 'react';

const mdComponents: ComponentProps<typeof Markdown>['components'] = {
	p: ({ children }) => (
		<p style={{ marginTop: '0.6em', marginBottom: '0.6em' }}>{children}</p>
	),
	pre: ({ children }) => (
		<div className="code-scroll" style={{ margin: '0.5em 0' }}>
			<pre style={{ margin: 0 }}>{children}</pre>
		</div>
	),
	table: ({ children }) => (
		<div className="code-scroll" style={{ margin: '0.5em 0' }}>
			<table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>{children}</table>
		</div>
	),
	th: ({ children }) => (
		<th style={{ textAlign: 'left', background: 'var(--subtle-bg)', fontWeight: 600 }}>{children}</th>
	),
	a: ({ href, children }) => (
		<a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent)' }}>{children}</a>
	),
};

interface SquadFileInfo {
	name: string;
	path: string;
	size: number;
	lastModified: string;
}

function getToken(): string | null {
	const match = document.cookie.match(/(?:^|; )token=([^;]*)/);
	return match ? decodeURIComponent(match[1]) : null;
}

const apiFetch = (url: string, init?: RequestInit) => {
	const t = getToken();
	const headers = { ...(init?.headers ?? {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
	return fetch(url, { ...init, headers });
};

export function SquadPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
	const [activeTab, setActiveTab] = useState<'team' | 'decisions' | 'files'>('team');
	const [teamContent, setTeamContent] = useState<string | null>(null);
	const [decisionsContent, setDecisionsContent] = useState<string | null>(null);
	const [files, setFiles] = useState<SquadFileInfo[]>([]);
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		
		const fetchData = async () => {
			setLoading(true);
			setError(null);
			try {
				const [teamRes, decisionsRes, filesRes] = await Promise.all([
					apiFetch('/api/squad/team'),
					apiFetch('/api/squad/decisions'),
					apiFetch('/api/squad/files'),
				]);

				if (teamRes.ok) {
					const data = await teamRes.json();
					setTeamContent(data.content || '_No team.md found_');
				} else {
					setTeamContent('_Team information not available_');
				}

				if (decisionsRes.ok) {
					const data = await decisionsRes.json();
					setDecisionsContent(data.content || '_No decisions.md found_');
				} else {
					setDecisionsContent('_Decisions log not available_');
				}

				if (filesRes.ok) {
					const data = await filesRes.json();
					setFiles(data.files || []);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to fetch Squad data');
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, [open]);

	const handleFileClick = async (filePath: string) => {
		setSelectedFile(filePath);
		setSelectedFileContent(null);
		setLoading(true);
		setError(null);
		try {
			const res = await apiFetch(`/api/squad/file?path=${encodeURIComponent(filePath)}`);
			if (res.ok) {
				const data = await res.json();
				setSelectedFileContent(data.content || '_Empty file_');
			} else {
				setSelectedFileContent('_Failed to load file_');
			}
		} catch (err) {
			setSelectedFileContent(`_Error: ${err instanceof Error ? err.message : 'Unknown error'}_`);
		} finally {
			setLoading(false);
		}
	};

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-start justify-end px-4 pt-14 pb-4"
			onClick={onClose}
			style={{ background: 'rgba(0, 0, 0, 0.5)' }}
		>
			<div
				className="relative max-w-2xl w-full max-h-full overflow-hidden rounded-xl shadow-2xl"
				style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
					<h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Squad Info</h2>
					<button
						type="button"
						onClick={onClose}
						className="rounded p-1 opacity-70 hover:opacity-100"
						style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer' }}
					>
						<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
							<path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
						</svg>
					</button>
				</div>

				{/* Tabs */}
				<div className="flex px-4 pt-3 gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
					{(['team', 'decisions', 'files'] as const).map(tab => (
						<button
							key={tab}
							type="button"
							onClick={() => {
								setActiveTab(tab);
								setSelectedFile(null);
								setSelectedFileContent(null);
							}}
							className="px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors"
							style={{
								background: activeTab === tab ? 'var(--bg)' : 'transparent',
								border: 'none',
								borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
								color: activeTab === tab ? 'var(--text)' : 'var(--text-muted)',
								cursor: 'pointer',
							}}
						>
							{tab.charAt(0).toUpperCase() + tab.slice(1)}
						</button>
					))}
				</div>

				{/* Content */}
				<div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
					{loading && !teamContent && !decisionsContent && (
						<div className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>
							Loading...
						</div>
					)}
					
					{error && (
						<div className="px-4 py-4 m-4 rounded-lg" style={{ background: 'var(--error-tint)', color: 'var(--error)', border: '1px solid var(--error)' }}>
							{error}
						</div>
					)}

					{/* Team Tab */}
					{activeTab === 'team' && teamContent && (
						<div className="px-4 py-4">
							<Markdown
								className="prose prose-sm max-w-none"
								remarkPlugins={[remarkGfm, remarkBreaks]}
								components={mdComponents}
							>
								{teamContent}
							</Markdown>
						</div>
					)}

					{/* Decisions Tab */}
					{activeTab === 'decisions' && decisionsContent && (
						<div className="px-4 py-4">
							<Markdown
								className="prose prose-sm max-w-none"
								remarkPlugins={[remarkGfm, remarkBreaks]}
								components={mdComponents}
							>
								{decisionsContent}
							</Markdown>
						</div>
					)}

					{/* Files Tab */}
					{activeTab === 'files' && (
						<div className="flex h-full">
							{/* File List */}
							<div className="w-1/3 overflow-y-auto" style={{ borderRight: '1px solid var(--border)' }}>
								{files.length === 0 ? (
									<div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
										No .squad/ files found
									</div>
								) : (
									<div className="py-2">
										{files.map(file => (
											<button
												key={file.path}
												type="button"
												onClick={() => handleFileClick(file.path)}
												className="w-full text-left px-4 py-2 text-sm transition-colors"
												style={{
													background: selectedFile === file.path ? 'var(--subtle-bg)' : 'transparent',
													border: 'none',
													color: selectedFile === file.path ? 'var(--text)' : 'var(--text-muted)',
													cursor: 'pointer',
												}}
											>
												<div className="font-mono truncate">{file.path}</div>
												<div className="text-xs opacity-70">
													{(file.size / 1024).toFixed(1)} KB
												</div>
											</button>
										))}
									</div>
								)}
							</div>

							{/* File Content */}
							<div className="flex-1 overflow-y-auto px-4 py-4">
								{!selectedFile ? (
									<div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
										Select a file to view
									</div>
								) : loading ? (
									<div className="text-center py-8 text-sm" style={{ color: 'var(--text-muted)' }}>
										Loading...
									</div>
								) : selectedFileContent ? (
									<Markdown
										className="prose prose-sm max-w-none"
										remarkPlugins={[remarkGfm, remarkBreaks]}
										components={mdComponents}
									>
										{selectedFileContent}
									</Markdown>
								) : null}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
