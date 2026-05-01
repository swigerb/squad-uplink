import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyToClipboard, copyRichToClipboard } from '../utils/clipboard';

describe('clipboard utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('copyToClipboard', () => {
		it('uses navigator.clipboard.writeText when available', async () => {
			const result = await copyToClipboard('hello');
			expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
			expect(result).toBe(true);
		});

		it('falls back to execCommand when clipboard API throws', async () => {
			vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'));

			const result = await copyToClipboard('fallback text');
			expect(document.execCommand).toHaveBeenCalledWith('copy');
			expect(result).toBe(true);
		});

		it('handles empty string', async () => {
			const result = await copyToClipboard('');
			expect(navigator.clipboard.writeText).toHaveBeenCalledWith('');
			expect(result).toBe(true);
		});
	});

	describe('copyRichToClipboard', () => {
		it('uses clipboard.write with HTML and plain text blobs', async () => {
			// Mock ClipboardItem globally for this test
			(globalThis as Record<string, unknown>).ClipboardItem = class {
				constructor(public items: Record<string, Blob>) {}
			};
			const result = await copyRichToClipboard('<b>bold</b>', 'bold');
			expect(navigator.clipboard.write).toHaveBeenCalledTimes(1);
			expect(result).toBe(true);
		});

		it('falls back to plain text when clipboard.write fails', async () => {
			(globalThis as Record<string, unknown>).ClipboardItem = class {
				constructor(public items: Record<string, Blob>) {}
			};
			vi.spyOn(navigator.clipboard, 'write').mockRejectedValueOnce(new Error('denied'));

			const result = await copyRichToClipboard('<b>bold</b>', 'bold');
			// Should have fallen back to writeText
			expect(navigator.clipboard.writeText).toHaveBeenCalledWith('bold');
			expect(result).toBe(true);
		});
	});
});
