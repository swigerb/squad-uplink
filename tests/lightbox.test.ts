import { describe, it, expect } from 'vitest';

/**
 * Lightbox state management tests.
 *
 * The Lightbox component (planned: webui/src/components/Lightbox.tsx) is a
 * fullscreen image viewer overlay. It's driven by a single piece of state:
 *   lightboxImage: string | null
 *
 * These tests validate the state transitions and the component contract.
 * Component-level rendering tests will be added once the component lands.
 *
 * Upstream reference: App.tsx:3209-3216
 */

// ── State management (mirrors App.tsx lightbox state) ──────────────────────

interface LightboxState {
	image: string | null;
}

function openLightbox(state: LightboxState, src: string): LightboxState {
	return { image: src };
}

function closeLightbox(_state: LightboxState): LightboxState {
	return { image: null };
}

function isLightboxOpen(state: LightboxState): boolean {
	return state.image !== null;
}

// ── Lightbox component contract ────────────────────────────────────────────

/**
 * Describes the expected behavior of click targets in the Lightbox overlay:
 *   - Clicking the backdrop (overlay div) → closes lightbox
 *   - Clicking the image itself → does NOT close (stopPropagation)
 *
 * We test this as a state machine since the actual DOM behavior
 * will be verified in component tests.
 */
interface ClickEvent {
	target: 'backdrop' | 'image';
}

function handleLightboxClick(state: LightboxState, event: ClickEvent): LightboxState {
	if (event.target === 'backdrop') {
		return closeLightbox(state);
	}
	// Image click: stopPropagation — don't close
	return state;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Lightbox state management', () => {
	describe('openLightbox', () => {
		it('sets image source', () => {
			const state = openLightbox({ image: null }, 'data:image/png;base64,abc');
			expect(state.image).toBe('data:image/png;base64,abc');
		});

		it('replaces existing image', () => {
			const state = openLightbox({ image: 'data:image/png;base64,old' }, 'data:image/jpeg;base64,new');
			expect(state.image).toBe('data:image/jpeg;base64,new');
		});
	});

	describe('closeLightbox', () => {
		it('clears image to null', () => {
			const state = closeLightbox({ image: 'data:image/png;base64,abc' });
			expect(state.image).toBeNull();
		});

		it('is idempotent when already closed', () => {
			const state = closeLightbox({ image: null });
			expect(state.image).toBeNull();
		});
	});

	describe('isLightboxOpen', () => {
		it('returns false when image is null', () => {
			expect(isLightboxOpen({ image: null })).toBe(false);
		});

		it('returns true when image is set', () => {
			expect(isLightboxOpen({ image: 'data:image/png;base64,abc' })).toBe(true);
		});
	});

	describe('click handling', () => {
		const openState: LightboxState = { image: 'data:image/png;base64,abc' };

		it('clicking backdrop closes lightbox', () => {
			const result = handleLightboxClick(openState, { target: 'backdrop' });
			expect(result.image).toBeNull();
		});

		it('clicking image does NOT close lightbox', () => {
			const result = handleLightboxClick(openState, { target: 'image' });
			expect(result.image).toBe('data:image/png;base64,abc');
		});
	});

	describe('lifecycle', () => {
		it('open → close → open works correctly', () => {
			let state: LightboxState = { image: null };
			expect(isLightboxOpen(state)).toBe(false);

			state = openLightbox(state, 'data:image/png;base64,first');
			expect(isLightboxOpen(state)).toBe(true);

			state = closeLightbox(state);
			expect(isLightboxOpen(state)).toBe(false);

			state = openLightbox(state, 'data:image/jpeg;base64,second');
			expect(state.image).toBe('data:image/jpeg;base64,second');
		});

		it('image click in message → lightbox opens', () => {
			// Simulates the flow: user clicks image in ChatMessageList → onImageClick → setLightboxImage
			let lightboxState: LightboxState = { image: null };

			const onImageClick = (src: string) => {
				lightboxState = openLightbox(lightboxState, src);
			};

			// User clicks an image in the chat
			onImageClick('data:image/png;base64,screenshot');
			expect(isLightboxOpen(lightboxState)).toBe(true);
			expect(lightboxState.image).toBe('data:image/png;base64,screenshot');

			// User clicks backdrop to close
			lightboxState = handleLightboxClick(lightboxState, { target: 'backdrop' });
			expect(isLightboxOpen(lightboxState)).toBe(false);
		});
	});
});
