import { useState, useCallback } from 'react';

export interface GuidesModalProps {
	open: boolean;
	onClose: () => void;
	apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
	onApplyGuide: (guideId: string) => Promise<void>;
	onLoadPrompts: (guideId: string) => Promise<void>;
	onError: (msg: string) => void;
	onNotify: (msg: string) => void;
}

interface GuideInfo {
	id: string;
	name: string;
	hasGuide?: boolean;
	hasPrompts?: boolean;
}

interface ViewingGuide {
	id: string;
	guideContent?: string;
	promptsContent?: string;
	guideFilePath?: string;
	promptsFilePath?: string;
	filePath?: string;
	activeTab?: 'guide' | 'prompts';
}

interface EditingGuide {
	id: string;
	content: string;
	isPrompts?: boolean;
}

interface ExampleInfo {
	id: string;
	hasGuide: boolean;
	hasPrompts: boolean;
}

interface ImportItem {
	name: string;
	hasGuide: boolean;
	hasPrompts: boolean;
	guideContent: string;
	promptsContent: string;
	selected: boolean;
}

export function GuidesModal({
	open,
	onClose,
	apiFetch,
	onApplyGuide,
	onLoadPrompts,
	onError,
	onNotify,
}: GuidesModalProps) {
	const [guides, setGuides] = useState<GuideInfo[]>([]);
	const [viewingGuide, setViewingGuide] = useState<ViewingGuide | null>(null);
	const [editingGuide, setEditingGuide] = useState<EditingGuide | null>(null);
	const [editingName, setEditingName] = useState<string | null>(null);
	const [confirmDeleteGuide, setConfirmDeleteGuide] = useState<string | null>(null);
	const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
	const [showNewGuide, setShowNewGuide] = useState(false);
	const [confirmOverwrite, setConfirmOverwrite] = useState(false);
	const [examples, setExamples] = useState<ExampleInfo[]>([]);
	const [selectedExample, setSelectedExample] = useState('');
	const [examplePreview, setExamplePreview] = useState<{ guide: string; prompts: string } | null>(null);
	const [newGuideCheck, setNewGuideCheck] = useState(true);
	const [newPromptsCheck, setNewPromptsCheck] = useState(true);
	const [previewTab, setPreviewTab] = useState<'guide' | 'prompts'>('guide');
	const [newGuideName, setNewGuideName] = useState('');
	const [recentlyAdded, setRecentlyAdded] = useState<Set<string>>(new Set());
	const [lastViewedGuide, setLastViewedGuide] = useState<string | null>(null);
	const [importUrl, setImportUrl] = useState('');
	const [importLoading, setImportLoading] = useState(false);
	const [importError, setImportError] = useState<string | null>(null);
	const [importItems, setImportItems] = useState<ImportItem[]>([]);
	const [importPreviewItem, setImportPreviewItem] = useState<string | null>(null);

	const hasUnsavedEdits = () => !!editingGuide || (showNewGuide && examplePreview && (examplePreview.guide || examplePreview.prompts));
	const guardDiscard = (action: () => void) => {
		if (hasUnsavedEdits()) { setPendingDiscard(() => action); } else { action(); }
	};

	const doAddGuide = useCallback(async () => {
		if (!newGuideName || !examplePreview) return;
		try {
			if (newGuideCheck && examplePreview.guide) {
				await apiFetch('/api/guides', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: newGuideName, content: examplePreview.guide }),
				});
			}
			if (newPromptsCheck && examplePreview.prompts) {
				await apiFetch('/api/prompts', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: newGuideName, content: examplePreview.prompts }),
				});
			}
			setShowNewGuide(false);
			setConfirmOverwrite(false);
			setRecentlyAdded(new Set([newGuideName]));
			setTimeout(() => setRecentlyAdded(new Set()), 3000);
			apiFetch('/api/guides').then(r => r.json()).then(setGuides).catch(() => {});
		} catch (e) {
			onError(`Failed to create: ${e}`);
		}
	}, [newGuideName, examplePreview, newGuideCheck, newPromptsCheck, apiFetch, onError]);

	// Load guides when modal opens
	const handleOpen = useCallback(() => {
		apiFetch('/api/guides').then(r => r.json()).then(setGuides).catch(() => {});
	}, [apiFetch]);

	// Trigger load on open
	if (open && guides.length === 0) handleOpen();

	if (!open) return null;

	const closeAll = () => guardDiscard(() => {
		setViewingGuide(null);
		setConfirmDeleteGuide(null);
		setEditingGuide(null);
		setEditingName(null);
		setShowNewGuide(false);
		setPendingDiscard(null);
		onClose();
	});

	return (
		<div
			className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-14 pb-4"
			style={{ background: 'var(--overlay)' }}
			onClick={closeAll}
			role="dialog"
			aria-modal="true"
			aria-labelledby="guides-modal-title"
		>
			<div
				className={`w-full rounded-2xl p-4 transition-all duration-200 ${viewingGuide || showNewGuide ? 'max-w-2xl' : 'max-w-md'}`}
				style={{ background: 'var(--surface)', border: '1px solid var(--border)', height: viewingGuide || showNewGuide ? 'calc(100vh - 6rem)' : undefined, maxHeight: 'calc(100vh - 6rem)', display: 'flex', flexDirection: 'column' as const }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="mb-3 flex items-center justify-between">
					<h2 id="guides-modal-title" className="font-semibold">Guides and Prompts</h2>
					{!viewingGuide && !showNewGuide && (
						<button
							type="button"
							className="rounded-lg px-3 py-1.5 text-sm font-medium"
							style={{ background: 'var(--primary)', color: 'white' }}
							onClick={() => {
								setShowNewGuide(true);
								setSelectedExample('');
								setExamplePreview({ guide: '# my-new-guide\n\n', prompts: '# my-new-guide Prompts\n\n## Example Prompt\nDescribe what you want here\n' });
								setNewGuideName('');
								setNewGuideCheck(true);
								setNewPromptsCheck(true);
								apiFetch('/api/examples').then(r => r.json()).then(setExamples).catch(() => {});
							}}
						>+ New</button>
					)}
				</div>
				{showNewGuide ? (
					<div>
						<div className="mb-3">
							<label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Start from</label>
							<select
								className="w-full rounded-lg px-3 py-2 text-sm"
								style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
								value={selectedExample}
								onChange={async (e) => {
									const id = e.target.value;
									setSelectedExample(id);
									setImportItems([]);
									setImportPreviewItem(null);
									setImportError(null);
									setImportUrl('');
									if (id === '__import__') {
										setExamplePreview(null);
										setNewGuideName('');
										return;
									}
									if (!id) {
										setExamplePreview({ guide: '# my-new-guide\n\n', prompts: '# my-new-guide Prompts\n\n## Example Prompt\nDescribe what you want here\n' });
										setNewGuideName('');
										setNewGuideCheck(true);
										setNewPromptsCheck(true);
										return;
									}
									setNewGuideName(id);
									try {
										const [gRes, pRes] = await Promise.all([
											apiFetch(`/api/examples/${encodeURIComponent(id)}`).then(r => r.json()),
											apiFetch(`/api/examples/${encodeURIComponent(id)}/prompts`).then(r => r.json()),
										]);
										setExamplePreview({ guide: gRes.content ?? '', prompts: pRes.content ?? '' });
										const ex = examples.find(e2 => e2.id === id);
										setNewGuideCheck(!!ex?.hasGuide);
										setNewPromptsCheck(!!ex?.hasPrompts);
									} catch { setExamplePreview(null); }
								}}
							>
								<option value="">Blank (start from scratch)</option>
								<option value="__import__">Import from URL...</option>
								<option disabled>───────────</option>
								{examples.map(ex => (
									<option key={ex.id} value={ex.id}>{ex.id}</option>
								))}
							</select>
						</div>

						{selectedExample === '__import__' ? (
							<div>
								<div className="mb-3">
									<label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Gist URL</label>
									<div className="flex gap-2">
										<input
											type="text"
											className="flex-1 rounded-lg px-3 py-2 text-sm"
											style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
											placeholder="https://gist.github.com/user/abc123"
											value={importUrl}
											onChange={(e) => setImportUrl(e.target.value)}
										/>
										<button
											type="button"
											className="rounded-lg px-3 py-1.5 text-xs font-medium"
											style={{ background: 'var(--primary)', color: 'white', opacity: importUrl && !importLoading ? 1 : 0.5 }}
											disabled={!importUrl || importLoading}
											onClick={async () => {
												setImportLoading(true);
												setImportError(null);
												setImportItems([]);
												setImportPreviewItem(null);
												try {
													const res = await apiFetch('/api/guides/import-preview', {
														method: 'POST',
														headers: { 'Content-Type': 'application/json' },
														body: JSON.stringify({ url: importUrl }),
													});
													const data = await res.json() as { items?: Array<{ name: string; hasGuide: boolean; hasPrompts: boolean; guideContent: string; promptsContent: string }>; error?: string };
													if (data.error) { setImportError(data.error); }
													else if (!data.items?.length) { setImportError('No guide/prompt files found. Files must be named like: name_guide.md / name_prompts.md'); }
													else {
														const items = data.items.map(it => ({ ...it, selected: true }));
														setImportItems(items);
														if (items.length === 1) setImportPreviewItem(items[0].name);
													}
												} catch (e) { setImportError(String(e)); }
												setImportLoading(false);
											}}
										>{importLoading ? 'Loading...' : 'Load'}</button>
									</div>
									{importError && <div className="mt-1 text-xs" style={{ color: 'var(--error)' }}>{importError}</div>}
								</div>

								{importItems.length > 0 && (
									<div className="mb-3">
										<div className="chat-scroll rounded-lg" style={{ overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)' }}>
											{importItems.map((item, i) => (
												<div key={item.name}>
													<div
														className="flex items-center gap-2 px-3 py-2"
														style={{ borderBottom: (importPreviewItem === item.name || i < importItems.length - 1) ? '1px solid var(--border)' : 'none', background: importPreviewItem === item.name ? 'var(--surface)' : 'transparent' }}
													>
														<input type="checkbox" checked={item.selected} onChange={() => setImportItems(prev => prev.map((it, j) => j === i ? { ...it, selected: !it.selected } : it))} />
														<button type="button" className="flex-1 text-left text-sm" style={{ color: 'var(--text)' }} onClick={() => setImportPreviewItem(importPreviewItem === item.name ? null : item.name)}>{item.name}</button>
														<span className="text-xs" style={{ color: 'var(--text-muted)' }}>{[item.hasGuide && 'guide', item.hasPrompts && 'prompts'].filter(Boolean).join(' + ')}</span>
													</div>
													{importPreviewItem === item.name && (
														<div className="px-3 pb-2">
															<div className="flex mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
																<button type="button" className="px-3 py-1 text-xs font-medium" style={{ color: previewTab === 'guide' ? 'var(--text)' : 'var(--text-muted)', borderBottom: previewTab === 'guide' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }} onClick={() => setPreviewTab('guide')}>Guide</button>
																<button type="button" className="px-3 py-1 text-xs font-medium" style={{ color: previewTab === 'prompts' ? 'var(--text)' : 'var(--text-muted)', borderBottom: previewTab === 'prompts' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }} onClick={() => setPreviewTab('prompts')}>Prompts</button>
															</div>
															<pre className="chat-scroll whitespace-pre-wrap text-xs p-2 rounded" style={{ background: 'var(--surface)', color: 'var(--text-muted)', height: `calc(100vh - ${importItems.length > 1 ? '30' : '26'}rem)`, overflow: 'auto' }}>
																{previewTab === 'guide' ? (item.guideContent || '(no guide)') : (item.promptsContent || '(no prompts)')}
															</pre>
														</div>
													)}
												</div>
											))}
										</div>
									</div>
								)}

								<div className="flex gap-2 justify-end">
									<button type="button" className="rounded-lg px-3 py-1.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => setShowNewGuide(false)}>Cancel</button>
									{importItems.some(it => it.selected) && (
										<button
											type="button"
											className="rounded-lg px-3 py-1.5 text-xs font-medium"
											style={{ background: 'var(--primary)', color: 'white' }}
											onClick={async () => {
												const selected = importItems.filter(it => it.selected);
												const gistMatch = importUrl.match(/gist\.github\.com\/[\w-]+\/([a-f0-9]+)/);
												try {
													await apiFetch('/api/guides/import', {
														method: 'POST',
														headers: { 'Content-Type': 'application/json' },
														body: JSON.stringify({
															gistId: gistMatch?.[1] ?? 'unknown',
															url: importUrl,
															items: selected.map(it => ({ name: it.name, guideContent: it.guideContent || undefined, promptsContent: it.promptsContent || undefined })),
														}),
													});
													setShowNewGuide(false);
													setRecentlyAdded(new Set(selected.map(it => it.name)));
													setTimeout(() => setRecentlyAdded(new Set()), 3000);
													apiFetch('/api/guides').then(r => r.json()).then(setGuides).catch(() => {});
												} catch (e) {
													setImportError(`Import failed: ${e}`);
												}
											}}
										>Add to Portal ({importItems.filter(it => it.selected).length})</button>
									)}
								</div>
							</div>
						) : (
						<>
						{/* Name input */}
						<div className="mb-3">
							<label className="mb-1 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Name</label>
							<input
								type="text"
								className="w-full rounded-lg px-3 py-2 text-sm"
								style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
								placeholder="my-guide-name"
								value={newGuideName}
								onChange={(e) => setNewGuideName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '-'))}
							/>
						</div>

						{examplePreview && (
							<div className="mb-3">
								<div className="flex mb-2" style={{ borderBottom: '1px solid var(--border)' }}>
									<button type="button" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium" style={{ color: previewTab === 'guide' ? 'var(--text)' : 'var(--text-muted)', borderBottom: previewTab === 'guide' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }} onClick={() => setPreviewTab('guide')}>
										<input type="checkbox" checked={newGuideCheck} onChange={(e) => { e.stopPropagation(); setNewGuideCheck(e.target.checked); }} style={{ marginRight: 2 }} />
										Guide
									</button>
									<button type="button" className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium" style={{ color: previewTab === 'prompts' ? 'var(--text)' : 'var(--text-muted)', borderBottom: previewTab === 'prompts' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }} onClick={() => setPreviewTab('prompts')}>
										<input type="checkbox" checked={newPromptsCheck} onChange={(e) => { e.stopPropagation(); setNewPromptsCheck(e.target.checked); }} style={{ marginRight: 2 }} />
										Prompts
									</button>
								</div>
								<div className="chat-scroll rounded-lg p-3" style={{ height: 'calc(100vh - 26rem)', overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex' }}>
									<textarea
										className="w-full flex-1 resize-none bg-transparent text-xs outline-none"
										style={{ fontFamily: 'monospace', color: 'var(--text)' }}
										value={previewTab === 'guide' ? examplePreview.guide : examplePreview.prompts}
										onChange={(e) => {
											if (previewTab === 'guide') {
												setExamplePreview({ ...examplePreview, guide: e.target.value });
											} else {
												setExamplePreview({ ...examplePreview, prompts: e.target.value });
											}
										}}
										placeholder={previewTab === 'guide' ? '# My Guide\n\nWrite your guide here...' : '# My Prompts\n\n## First Prompt\nDescribe what you want here'}
									/>
								</div>
							</div>
						)}

						<div className="flex gap-2 justify-end">
							<button type="button" className="rounded-lg px-3 py-1.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => setShowNewGuide(false)}>Cancel</button>
							<button
								type="button"
								className="rounded-lg px-3 py-1.5 text-xs font-medium"
								style={{ background: 'var(--primary)', color: 'white', opacity: newGuideName && (newGuideCheck || newPromptsCheck) ? 1 : 0.5 }}
								disabled={!newGuideName || (!newGuideCheck && !newPromptsCheck)}
								onClick={() => {
									if (!newGuideName) return;
									const existing = guides.find(g => g.id === newGuideName);
									if (existing) {
										setConfirmOverwrite(true);
									} else {
										doAddGuide();
									}
								}}
							>Add</button>
						</div>
						{confirmOverwrite && (
							<div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--warning-tint)', border: '1px solid var(--warning)' }}>
								<span className="flex-1 text-xs" style={{ color: 'var(--warning)' }}>"{newGuideName}" already exists. Overwrite?</span>
								<button type="button" className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--warning)', color: '#111' }} onClick={() => { setConfirmOverwrite(false); doAddGuide(); }}>Overwrite</button>
								<button type="button" className="rounded px-2 py-0.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => setConfirmOverwrite(false)}>Cancel</button>
							</div>
						)}
						</>
						)}
					</div>
				) : viewingGuide ? (
					<div>
						<div className="mb-2 flex items-center justify-between">
							{editingGuide || editingName !== null ? (
								<input
									type="text"
									className="font-semibold text-sm bg-transparent outline-none border-b"
									style={{ color: 'var(--text)', borderColor: 'var(--primary)', minWidth: 150 }}
									value={editingName ?? viewingGuide.id}
									onChange={(e) => setEditingName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '-'))}
								/>
							) : (
								<h3 className="font-semibold text-sm">{viewingGuide.id}</h3>
							)}
							<div className="flex gap-1">
								{!editingGuide && (
									<button className="rounded px-2 py-1 text-xs font-medium" style={{ background: 'var(--primary)', color: 'white' }} onClick={async () => {
										const vi = viewingGuide;
										setViewingGuide(null);
										onClose();
										if (vi.guideContent) await onApplyGuide(vi.id);
										if (vi.promptsContent) await onLoadPrompts(vi.id);
									}} type="button">Apply</button>
								)}
								<button className="rounded px-2 py-1 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => {
									if (editingGuide) {
										setEditingGuide(null);
										setEditingName(null);
									} else {
										const tab = viewingGuide.activeTab ?? 'guide';
										const content = tab === 'guide' ? viewingGuide.guideContent : viewingGuide.promptsContent;
										setEditingGuide({ id: viewingGuide.id, content: content ?? '', isPrompts: tab === 'prompts' });
										setEditingName(viewingGuide.id);
									}
								}} type="button">{editingGuide ? 'Cancel Edit' : 'Edit'}</button>
								{editingGuide && (
									<button className="rounded px-2 py-1 text-xs font-medium" style={{ background: 'var(--success)', color: '#111' }} onClick={async () => {
										try {
											const newName = editingName ?? editingGuide.id;
											const renamed = newName !== viewingGuide.id;
											if (renamed) {
												await apiFetch('/api/guides/rename', {
													method: 'POST',
													headers: { 'Content-Type': 'application/json' },
													body: JSON.stringify({ oldId: viewingGuide.id, newId: newName }),
												});
											}
											const endpoint = editingGuide.isPrompts ? '/api/prompts' : '/api/guides';
											await apiFetch(endpoint, {
												method: 'POST',
												headers: { 'Content-Type': 'application/json' },
												body: JSON.stringify({ id: newName, content: editingGuide.content }),
											});
											const tab = viewingGuide.activeTab ?? 'guide';
											const updated = { ...viewingGuide, id: newName };
											if (tab === 'guide' && !editingGuide.isPrompts) {
												updated.guideContent = editingGuide.content;
											} else if (tab === 'prompts' && editingGuide.isPrompts) {
												updated.promptsContent = editingGuide.content;
											}
											setViewingGuide(updated);
											setEditingGuide(null);
											setEditingName(null);
											apiFetch('/api/guides').then(r => r.json()).then(setGuides).catch(() => {});
										} catch (e) {
											onError(`Failed to save: ${e}`);
										}
									}} type="button">Save</button>
								)}
								<button className="rounded px-2 py-1 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => guardDiscard(() => { setLastViewedGuide(viewingGuide.id); setViewingGuide(null); setEditingGuide(null); setEditingName(null); setPendingDiscard(null); })} type="button">Back</button>
							</div>
						</div>
						{(() => {
							const tab = viewingGuide.activeTab ?? 'guide';
							const fp = tab === 'guide' ? viewingGuide.guideFilePath : viewingGuide.promptsFilePath;
							let displayPath = fp ?? (viewingGuide.guideFilePath || viewingGuide.promptsFilePath
								? ((tab === 'guide' ? viewingGuide.promptsFilePath : viewingGuide.guideFilePath) ?? '').replace(/([/\\])(guides|prompts)([/\\])/, `$1${tab === 'guide' ? 'guides' : 'prompts'}$3`)
								: '');
							if (displayPath && editingName && editingName !== viewingGuide.id) {
								displayPath = displayPath.replace(/[/\\][^/\\]+\.md$/, (m) => m.charAt(0) + editingName + '.md');
							}
							const exists = !!(tab === 'guide' ? viewingGuide.guideFilePath : viewingGuide.promptsFilePath);
							return displayPath ? (
								<div className="mb-2 flex items-center gap-1 rounded px-2 py-1" style={{ background: 'var(--bg)' }}>
									<div className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs" style={{ color: 'var(--text-muted)', opacity: exists ? 1 : 0.5 }}>
										{displayPath}
									</div>
								</div>
							) : null;
						})()}
						{/* Discard warning */}
						{pendingDiscard && (
							<div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--warning-tint)', border: '1px solid var(--warning)' }}>
								<span className="flex-1 text-xs" style={{ color: 'var(--warning)' }}>You have unsaved changes.</span>
								<button type="button" className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--warning)', color: '#111' }} onClick={() => { const action = pendingDiscard; setPendingDiscard(null); action(); }}>Discard</button>
								<button type="button" className="rounded px-2 py-0.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={() => setPendingDiscard(null)}>Keep Editing</button>
							</div>
						)}
						{/* Guide / Prompts tabs */}
						<div className="flex mb-2" style={{ borderBottom: '1px solid var(--border)' }}>
							<button type="button" className="px-3 py-1.5 text-xs font-medium"
								style={{ color: (viewingGuide.activeTab ?? 'guide') === 'guide' ? 'var(--text)' : 'var(--text-muted)', borderBottom: (viewingGuide.activeTab ?? 'guide') === 'guide' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1, opacity: viewingGuide.guideContent ? 1 : 0.4 }}
								onClick={() => guardDiscard(() => { setViewingGuide({ ...viewingGuide, activeTab: 'guide' }); setEditingGuide(null); setPendingDiscard(null); })}
							>Guide</button>
							<button type="button" className="px-3 py-1.5 text-xs font-medium"
								style={{ color: viewingGuide.activeTab === 'prompts' ? 'var(--text)' : 'var(--text-muted)', borderBottom: viewingGuide.activeTab === 'prompts' ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1, opacity: viewingGuide.promptsContent ? 1 : 0.4 }}
								onClick={() => guardDiscard(() => { setViewingGuide({ ...viewingGuide, activeTab: 'prompts' }); setEditingGuide(null); setPendingDiscard(null); })}
							>Prompts</button>
						</div>
						<div className="chat-scroll rounded-lg p-3" style={{ height: editingGuide ? 'calc(100vh - 20rem)' : undefined, maxHeight: 'calc(100vh - 20rem)', overflowY: 'auto', background: 'var(--bg)', border: '1px solid var(--border)', display: editingGuide ? 'flex' : undefined }}>
							{editingGuide ? (
								<textarea
									className="w-full flex-1 resize-none bg-transparent text-xs outline-none"
									style={{ fontFamily: 'monospace', color: 'var(--text)' }}
									value={editingGuide.content}
									onChange={(e) => setEditingGuide({ ...editingGuide, content: e.target.value })}
									placeholder={editingGuide.isPrompts
										? '# Prompts\n\n## My first prompt\nDescribe what you want Copilot to do\n\n## Another prompt\nEach ## heading becomes a selectable prompt'
										: '# Guide Title\n\nWrite instructions for Copilot here.\n\n## Section\nUse sections to organize your guide.'}
								/>
							) : (
								<pre className="text-xs whitespace-pre-wrap break-words" style={{ fontFamily: 'monospace', color: 'var(--text)', opacity: ((viewingGuide.activeTab ?? 'guide') === 'guide' ? viewingGuide.guideContent : viewingGuide.promptsContent) ? 1 : 0.4 }}>
									{((viewingGuide.activeTab ?? 'guide') === 'guide' ? viewingGuide.guideContent : viewingGuide.promptsContent) || ((viewingGuide.activeTab ?? 'guide') === 'prompts' ? 'No prompts file. Click Edit to create one.\n\nFormat: use ## headings for prompt labels,\ntext below becomes the prompt content.' : 'No guide file. Click Edit to create one.')}
								</pre>
							)}
						</div>
					</div>
				) : guides.length === 0 ? (
					<div className="py-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
						No guides found. Add .md files to data/guides/
					</div>
				) : (
					<div className="chat-scroll" style={{ maxHeight: 'calc(100vh - 12rem)', overflowY: 'auto' }}>
						{guides.map(inst => (
							<button
								key={inst.id}
								type="button"
								className="mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors duration-1000"
								style={{ background: recentlyAdded.has(inst.id) || lastViewedGuide === inst.id ? 'var(--primary-tint)' : 'var(--bg)', border: `1px solid ${recentlyAdded.has(inst.id) || lastViewedGuide === inst.id ? 'var(--primary)' : 'var(--border)'}`, minHeight: '2.75rem' }}
								onClick={async () => {
									setLastViewedGuide(null);
									try {
										const [gRes, pRaw] = await Promise.all([
											inst.hasGuide ? apiFetch(`/api/guides/${encodeURIComponent(inst.id)}`).then(r => r.json()) : Promise.resolve(null),
											inst.hasPrompts ? apiFetch(`/api/guides/${encodeURIComponent(inst.id)}/prompts`).then(r => r.json()) : Promise.resolve(null),
										]);
										const promptsContent = pRaw?.prompts?.map((p: { label: string; text: string }) => `## ${p.label}\n${p.text}`).join('\n\n') ?? '';
										setViewingGuide({
											id: inst.id,
											guideContent: gRes?.content ?? '',
											promptsContent,
											guideFilePath: gRes?.filePath,
											promptsFilePath: pRaw?.filePath,
											activeTab: inst.hasGuide ? 'guide' : 'prompts',
										});
									} catch {}
								}}
							>
								<svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" style={{ color: 'var(--text-muted)' }}>
									<rect x="5" y="2" width="14" height="20" rx="2" />
									<path d="M8 8c1-2 2.5 2 3.5 0s2.5 2 3.5 0" />
									<path d="M8 13c1-2 2.5 2 3.5 0s2.5 2 3.5 0" />
								</svg>
								<span className="flex-1">{inst.name}</span>
								{confirmDeleteGuide === inst.id ? (
									<span className="flex items-center gap-1" style={{ minHeight: '1.75rem' }} onClick={e => e.stopPropagation()}>
										<button className="rounded px-2 py-0.5 text-xs" style={{ background: 'var(--error)', color: 'white' }} onClick={async (e) => {
											e.stopPropagation();
											await apiFetch(`/api/guides/${encodeURIComponent(inst.id)}`, { method: 'DELETE' });
											setGuides(prev => prev.filter(i => i.id !== inst.id));
											setConfirmDeleteGuide(null);
										}} type="button">Delete</button>
										<button className="rounded px-2 py-0.5 text-xs" style={{ border: '1px solid var(--border)' }} onClick={(e) => { e.stopPropagation(); setConfirmDeleteGuide(null); }} type="button">Cancel</button>
									</span>
								) : (
									<span className="flex gap-0.5 shrink-0" style={{ minHeight: '1.75rem' }} onClick={e => e.stopPropagation()}>
										<span className="rounded p-1.5" style={{ opacity: inst.hasGuide ? 0.7 : 0.2 }} title={inst.hasGuide ? 'Has guide' : 'No guide'}>
											<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
												<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
												<circle cx="12" cy="12" r="3" />
											</svg>
										</span>
										<span className="rounded p-1.5" style={{ opacity: inst.hasPrompts ? 0.7 : 0.2 }} title={inst.hasPrompts ? 'Has prompts' : 'No prompts'}>
											<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
												<path d="M3 15a2 2 0 0 0 2 2h12l4 4V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
												<path d="M8 9h8M8 13h5" />
											</svg>
										</span>
										<button className="rounded p-1.5" style={{ opacity: 0.7 }} onClick={(e) => { e.stopPropagation(); setConfirmDeleteGuide(inst.id); }} type="button" title="Delete">
											<svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
												<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
											</svg>
										</button>
									</span>
								)}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
