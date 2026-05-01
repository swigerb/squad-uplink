import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Image support logic tests.
 *
 * Tests the image handling pipeline being ported from upstream v0.6.1:
 *   - addImageFiles callback: file reading, base64 extraction, state management
 *   - sendPrompt with attachments: building WS payload, clearing pending images
 *   - Image removal from pending list
 *   - Message visibility filter including image-only messages
 *   - History replay: mapping attachments → data URIs
 *
 * These test the algorithms; component-level tests (paste, drag/drop, thumbnails)
 * will be added after InputBar and ChatMessageList changes land.
 */

// ── Types (from upstream porting plan §1.1-1.5) ────────────────────────────

interface PendingImage {
	data: string;       // base64 (no prefix)
	mimeType: string;   // e.g. "image/png"
	name: string;       // display name
}

interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	images?: string[];   // data: URIs
	toolSummary?: Array<{ toolName: string; display: string; completed: boolean }>;
}

interface Attachment {
	type: 'blob';
	data: string;
	mimeType: string;
	displayName?: string;
}

// ── Extracted logic (mirrors upstream App.tsx:2400-2442) ────────────────────

/**
 * Processes a list of Files, filtering to images and extracting base64.
 * This is the sync-testable version of the addImageFiles callback.
 * In the real component, FileReader is async; here we simulate the output.
 */
function processImageFile(file: { name: string; type: string }, dataUrl: string): PendingImage | null {
	if (!file.type.startsWith('image/')) return null;
	const base64 = dataUrl.split(',')[1];
	const name = file.name || `image-${Date.now()}.${file.type.split('/')[1]}`;
	return { data: base64, mimeType: file.type, name };
}

/**
 * Determines if the send button should be enabled.
 * Upstream: allow send when text OR images are present.
 */
function canSend(
	text: string,
	pendingImages: PendingImage[],
	connectionState: 'connected' | 'connecting' | 'disconnected',
	draftSession: boolean,
): boolean {
	const hasContent = text.trim().length > 0 || pendingImages.length > 0;
	const hasConnection = connectionState === 'connected' || draftSession;
	return hasContent && hasConnection;
}

/**
 * Builds the WS prompt payload including attachments.
 * Mirrors upstream App.tsx:2416-2442.
 */
function buildPromptPayload(
	text: string,
	pendingImages: PendingImage[],
): { type: 'prompt'; content: string; attachments?: Attachment[] } {
	const attachments = pendingImages.length > 0
		? pendingImages.map(img => ({
			type: 'blob' as const,
			data: img.data,
			mimeType: img.mimeType,
			displayName: img.name,
		}))
		: undefined;
	return { type: 'prompt', content: text, attachments };
}

/**
 * Builds the images array for a user message from pending images.
 * Mirrors how user messages store attached images as data URIs.
 */
function buildMessageImages(pendingImages: PendingImage[]): string[] | undefined {
	if (pendingImages.length === 0) return undefined;
	return pendingImages.map(img => `data:${img.mimeType};base64,${img.data}`);
}

/**
 * Removes an image from the pending list by index.
 */
function removeImage(images: PendingImage[], index: number): PendingImage[] {
	return images.filter((_, i) => i !== index);
}

/**
 * Updated visibility filter — includes image-only messages.
 * Upstream: messages.filter(m => m.content.trim() || m.toolSummary?.length || m.images?.length)
 */
function isMessageVisible(msg: Message): boolean {
	return !!(msg.content.trim() || msg.toolSummary?.length || msg.images?.length);
}

/**
 * History replay: converts raw attachment data to data URIs for display.
 * Mirrors upstream session.ts:358-360.
 */
function mapHistoryAttachments(
	attachments?: Array<{ type: string; data: string; mimeType?: string }>,
): string[] | undefined {
	if (!attachments || attachments.length === 0) return undefined;
	const images = attachments
		.filter(a => a.type === 'blob' && a.data)
		.map(a => `data:${a.mimeType ?? 'image/png'};base64,${a.data}`);
	return images.length > 0 ? images : undefined;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Image support: processImageFile', () => {
	it('extracts base64 from a PNG data URL', () => {
		const file = { name: 'screenshot.png', type: 'image/png' };
		const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
		const result = processImageFile(file, dataUrl);
		expect(result).toEqual({
			data: 'iVBORw0KGgoAAAANSUhEUg==',
			mimeType: 'image/png',
			name: 'screenshot.png',
		});
	});

	it('extracts base64 from a JPEG data URL', () => {
		const file = { name: 'photo.jpg', type: 'image/jpeg' };
		const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
		const result = processImageFile(file, dataUrl);
		expect(result).toEqual({
			data: '/9j/4AAQSkZJRg==',
			mimeType: 'image/jpeg',
			name: 'photo.jpg',
		});
	});

	it('rejects non-image files', () => {
		const file = { name: 'document.pdf', type: 'application/pdf' };
		expect(processImageFile(file, 'data:application/pdf;base64,abc')).toBeNull();
	});

	it('rejects text files', () => {
		const file = { name: 'readme.txt', type: 'text/plain' };
		expect(processImageFile(file, 'data:text/plain;base64,abc')).toBeNull();
	});

	it('accepts GIF images', () => {
		const file = { name: 'animation.gif', type: 'image/gif' };
		const result = processImageFile(file, 'data:image/gif;base64,R0lGODlh');
		expect(result).not.toBeNull();
		expect(result!.mimeType).toBe('image/gif');
	});

	it('accepts WebP images', () => {
		const file = { name: 'modern.webp', type: 'image/webp' };
		const result = processImageFile(file, 'data:image/webp;base64,UklGR');
		expect(result).not.toBeNull();
		expect(result!.mimeType).toBe('image/webp');
	});

	it('generates fallback name when file.name is empty', () => {
		const file = { name: '', type: 'image/png' };
		const result = processImageFile(file, 'data:image/png;base64,abc');
		expect(result).not.toBeNull();
		expect(result!.name).toMatch(/^image-\d+\.png$/);
	});
});

describe('Image support: canSend', () => {
	const png: PendingImage = { data: 'abc', mimeType: 'image/png', name: 'test.png' };

	it('enabled with text only, connected', () => {
		expect(canSend('hello', [], 'connected', false)).toBe(true);
	});

	it('enabled with images only, connected', () => {
		expect(canSend('', [png], 'connected', false)).toBe(true);
	});

	it('enabled with both text and images', () => {
		expect(canSend('look at this', [png], 'connected', false)).toBe(true);
	});

	it('disabled with nothing, connected', () => {
		expect(canSend('', [], 'connected', false)).toBe(false);
	});

	it('disabled with whitespace-only text, no images', () => {
		expect(canSend('   ', [], 'connected', false)).toBe(false);
	});

	it('disabled when disconnected, even with content', () => {
		expect(canSend('hello', [], 'disconnected', false)).toBe(false);
	});

	it('enabled in draft mode even when disconnected', () => {
		expect(canSend('hello', [], 'disconnected', true)).toBe(true);
	});

	it('enabled with images in draft mode', () => {
		expect(canSend('', [png], 'disconnected', true)).toBe(true);
	});

	it('disabled with connecting state and no draft', () => {
		expect(canSend('hello', [], 'connecting', false)).toBe(false);
	});
});

describe('Image support: buildPromptPayload', () => {
	it('builds text-only payload with no attachments', () => {
		const payload = buildPromptPayload('hello world', []);
		expect(payload).toEqual({ type: 'prompt', content: 'hello world' });
		expect(payload.attachments).toBeUndefined();
	});

	it('builds payload with images as blob attachments', () => {
		const images: PendingImage[] = [
			{ data: 'abc123', mimeType: 'image/png', name: 'screen.png' },
		];
		const payload = buildPromptPayload('check this', images);
		expect(payload.attachments).toHaveLength(1);
		expect(payload.attachments![0]).toEqual({
			type: 'blob',
			data: 'abc123',
			mimeType: 'image/png',
			displayName: 'screen.png',
		});
	});

	it('builds payload with multiple images', () => {
		const images: PendingImage[] = [
			{ data: 'a', mimeType: 'image/png', name: 'a.png' },
			{ data: 'b', mimeType: 'image/jpeg', name: 'b.jpg' },
			{ data: 'c', mimeType: 'image/gif', name: 'c.gif' },
		];
		const payload = buildPromptPayload('', images);
		expect(payload.content).toBe('');
		expect(payload.attachments).toHaveLength(3);
	});

	it('builds image-only payload (empty text)', () => {
		const images: PendingImage[] = [
			{ data: 'xyz', mimeType: 'image/png', name: 'diagram.png' },
		];
		const payload = buildPromptPayload('', images);
		expect(payload.content).toBe('');
		expect(payload.attachments).toHaveLength(1);
	});
});

describe('Image support: buildMessageImages', () => {
	it('returns undefined for no images', () => {
		expect(buildMessageImages([])).toBeUndefined();
	});

	it('converts pending images to data URIs', () => {
		const images: PendingImage[] = [
			{ data: 'abc123', mimeType: 'image/png', name: 'test.png' },
		];
		const result = buildMessageImages(images);
		expect(result).toEqual(['data:image/png;base64,abc123']);
	});

	it('handles multiple images with different MIME types', () => {
		const images: PendingImage[] = [
			{ data: 'a', mimeType: 'image/png', name: 'a.png' },
			{ data: 'b', mimeType: 'image/jpeg', name: 'b.jpg' },
		];
		const result = buildMessageImages(images);
		expect(result).toEqual([
			'data:image/png;base64,a',
			'data:image/jpeg;base64,b',
		]);
	});
});

describe('Image support: removeImage', () => {
	const images: PendingImage[] = [
		{ data: 'a', mimeType: 'image/png', name: 'first.png' },
		{ data: 'b', mimeType: 'image/jpeg', name: 'second.jpg' },
		{ data: 'c', mimeType: 'image/gif', name: 'third.gif' },
	];

	it('removes image at index 0', () => {
		const result = removeImage(images, 0);
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe('second.jpg');
	});

	it('removes image at middle index', () => {
		const result = removeImage(images, 1);
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe('first.png');
		expect(result[1].name).toBe('third.gif');
	});

	it('removes image at last index', () => {
		const result = removeImage(images, 2);
		expect(result).toHaveLength(2);
		expect(result[1].name).toBe('second.jpg');
	});

	it('returns empty array when removing only image', () => {
		const single = [{ data: 'a', mimeType: 'image/png', name: 'only.png' }];
		expect(removeImage(single, 0)).toHaveLength(0);
	});

	it('does not mutate original array', () => {
		const original = [...images];
		removeImage(images, 1);
		expect(images).toEqual(original);
	});
});

describe('Image support: isMessageVisible', () => {
	it('visible: message with text content', () => {
		expect(isMessageVisible({ id: '1', role: 'user', content: 'hello' })).toBe(true);
	});

	it('visible: message with images only', () => {
		expect(isMessageVisible({
			id: '2', role: 'user', content: '',
			images: ['data:image/png;base64,abc'],
		})).toBe(true);
	});

	it('visible: message with toolSummary only', () => {
		expect(isMessageVisible({
			id: '3', role: 'assistant', content: '',
			toolSummary: [{ toolName: 'read_file', display: 'src/main.ts', completed: true }],
		})).toBe(true);
	});

	it('visible: message with text and images', () => {
		expect(isMessageVisible({
			id: '4', role: 'user', content: 'look at this',
			images: ['data:image/png;base64,abc'],
		})).toBe(true);
	});

	it('hidden: message with empty content and no images/tools', () => {
		expect(isMessageVisible({ id: '5', role: 'assistant', content: '' })).toBe(false);
	});

	it('hidden: message with whitespace-only content', () => {
		expect(isMessageVisible({ id: '6', role: 'assistant', content: '   ' })).toBe(false);
	});

	it('visible: message with tab/newline content', () => {
		expect(isMessageVisible({ id: '7', role: 'user', content: '\thello\n' })).toBe(true);
	});
});

describe('Image support: mapHistoryAttachments', () => {
	it('returns undefined for no attachments', () => {
		expect(mapHistoryAttachments(undefined)).toBeUndefined();
		expect(mapHistoryAttachments([])).toBeUndefined();
	});

	it('converts blob attachments to data URIs', () => {
		const attachments = [
			{ type: 'blob', data: 'abc123', mimeType: 'image/png' },
		];
		const result = mapHistoryAttachments(attachments);
		expect(result).toEqual(['data:image/png;base64,abc123']);
	});

	it('defaults to image/png when mimeType is missing', () => {
		const attachments = [
			{ type: 'blob', data: 'abc123' },
		];
		const result = mapHistoryAttachments(attachments);
		expect(result).toEqual(['data:image/png;base64,abc123']);
	});

	it('filters out non-blob attachment types', () => {
		const attachments = [
			{ type: 'text', data: 'hello' },
			{ type: 'blob', data: 'abc', mimeType: 'image/png' },
		];
		const result = mapHistoryAttachments(attachments);
		expect(result).toEqual(['data:image/png;base64,abc']);
	});

	it('filters out blob attachments with empty data', () => {
		const attachments = [
			{ type: 'blob', data: '', mimeType: 'image/png' },
			{ type: 'blob', data: 'valid', mimeType: 'image/jpeg' },
		];
		const result = mapHistoryAttachments(attachments);
		expect(result).toEqual(['data:image/jpeg;base64,valid']);
	});

	it('returns undefined when all attachments are filtered out', () => {
		const attachments = [
			{ type: 'text', data: 'hello' },
			{ type: 'blob', data: '' },
		];
		expect(mapHistoryAttachments(attachments)).toBeUndefined();
	});

	it('handles multiple valid attachments', () => {
		const attachments = [
			{ type: 'blob', data: 'a', mimeType: 'image/png' },
			{ type: 'blob', data: 'b', mimeType: 'image/jpeg' },
		];
		const result = mapHistoryAttachments(attachments);
		expect(result).toHaveLength(2);
	});
});

describe('Image support: end-to-end flow simulation', () => {
	it('simulates: paste image → send → message has images → clear pending', () => {
		// 1. User pastes an image
		const pastedFile = { name: 'clipboard.png', type: 'image/png' };
		const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
		const processed = processImageFile(pastedFile, dataUrl);
		expect(processed).not.toBeNull();

		let pendingImages: PendingImage[] = [processed!];

		// 2. Can send with image, no text
		expect(canSend('', pendingImages, 'connected', false)).toBe(true);

		// 3. Build message
		const images = buildMessageImages(pendingImages);
		expect(images).toEqual(['data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==']);

		// 4. Build WS payload
		const payload = buildPromptPayload('', pendingImages);
		expect(payload.attachments).toHaveLength(1);

		// 5. Clear pending after send
		pendingImages = [];
		expect(canSend('', pendingImages, 'connected', false)).toBe(false);
	});

	it('simulates: add 3 images → remove middle → send with text', () => {
		let pending: PendingImage[] = [
			{ data: 'a', mimeType: 'image/png', name: 'first.png' },
			{ data: 'b', mimeType: 'image/jpeg', name: 'second.jpg' },
			{ data: 'c', mimeType: 'image/gif', name: 'third.gif' },
		];

		// Remove middle image
		pending = removeImage(pending, 1);
		expect(pending).toHaveLength(2);
		expect(pending.map(p => p.name)).toEqual(['first.png', 'third.gif']);

		// Build payload with text + remaining images
		const payload = buildPromptPayload('check these diagrams', pending);
		expect(payload.content).toBe('check these diagrams');
		expect(payload.attachments).toHaveLength(2);

		// Message images
		const images = buildMessageImages(pending);
		expect(images).toHaveLength(2);
	});
});
