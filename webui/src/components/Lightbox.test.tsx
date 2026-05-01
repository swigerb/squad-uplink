import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Lightbox } from '../components/Lightbox';

describe('Lightbox', () => {
	const defaultProps = {
		src: 'https://example.com/image.png',
		onClose: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders the image with the given src', () => {
		render(<Lightbox {...defaultProps} />);
		const img = screen.getByAltText('Full size');
		expect(img).toBeInTheDocument();
		expect(img).toHaveAttribute('src', 'https://example.com/image.png');
	});

	it('renders with proper alt text', () => {
		render(<Lightbox {...defaultProps} />);
		expect(screen.getByAltText('Full size')).toBeInTheDocument();
	});

	it('calls onClose when backdrop is clicked', () => {
		const { container } = render(<Lightbox {...defaultProps} />);
		const backdrop = container.firstElementChild!;
		fireEvent.click(backdrop);
		expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
	});

	it('does NOT call onClose when image is clicked', () => {
		render(<Lightbox {...defaultProps} />);
		const img = screen.getByAltText('Full size');
		fireEvent.click(img);
		expect(defaultProps.onClose).not.toHaveBeenCalled();
	});

	it('applies full-screen overlay styling', () => {
		const { container } = render(<Lightbox {...defaultProps} />);
		const backdrop = container.firstElementChild as HTMLElement;
		expect(backdrop.className).toContain('fixed');
		expect(backdrop.className).toContain('inset-0');
	});

	it('constrains image to viewport dimensions', () => {
		render(<Lightbox {...defaultProps} />);
		const img = screen.getByAltText('Full size') as HTMLElement;
		expect(img.style.maxWidth).toBe('95vw');
		expect(img.style.maxHeight).toBe('90vh');
	});
});
