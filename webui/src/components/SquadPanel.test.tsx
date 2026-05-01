import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock react-markdown to avoid remark plugin issues in jsdom
vi.mock('react-markdown', () => ({
	default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock('remark-gfm', () => ({ default: () => {} }));
vi.mock('remark-breaks', () => ({ default: () => {} }));

import { SquadPanel } from '../components/SquadPanel';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Helper: create a successful JSON response
function jsonResponse(data: unknown, ok = true) {
	return Promise.resolve({
		ok,
		status: ok ? 200 : 500,
		json: () => Promise.resolve(data),
	});
}

describe('SquadPanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Clear cookies
		document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 GMT';

		// Default: all API calls succeed with content
		mockFetch.mockImplementation((url: string) => {
			if (url.includes('/api/squad/team'))
				return jsonResponse({ content: '# Team Info' });
			if (url.includes('/api/squad/decisions'))
				return jsonResponse({ content: '# Decisions' });
			if (url.includes('/api/squad/files'))
				return jsonResponse({ files: [{ name: 'team.md', path: 'team.md', size: 100, lastModified: '2026-01-01' }] });
			if (url.includes('/api/squad/file'))
				return jsonResponse({ content: '# File Content' });
			return jsonResponse({}, false);
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('renders nothing when open is false', () => {
		const { container } = render(
			<SquadPanel open={false} onClose={vi.fn()} />
		);
		expect(container.innerHTML).toBe('');
	});

	it('renders the panel header when open', async () => {
		render(<SquadPanel open={true} onClose={vi.fn()} />);
		expect(screen.getByText('Squad Info')).toBeInTheDocument();
	});

	it('has proper accessibility attributes', () => {
		render(<SquadPanel open={true} onClose={vi.fn()} />);
		const dialog = screen.getByRole('dialog');
		expect(dialog).toHaveAttribute('aria-modal', 'true');
		expect(dialog).toHaveAttribute('aria-labelledby', 'squad-panel-title');
	});

	it('fetches data when opened', async () => {
		render(<SquadPanel open={true} onClose={vi.fn()} />);

		await waitFor(() => {
			expect(mockFetch).toHaveBeenCalled();
		});

		// Should have fetched team, decisions, and files
		const urls = mockFetch.mock.calls.map((c: unknown[]) => c[0] as string);
		expect(urls.some((u: string) => u.includes('/api/squad/team'))).toBe(true);
		expect(urls.some((u: string) => u.includes('/api/squad/decisions'))).toBe(true);
		expect(urls.some((u: string) => u.includes('/api/squad/files'))).toBe(true);
	});

	it('displays three tabs: Team, Decisions, Files', () => {
		render(<SquadPanel open={true} onClose={vi.fn()} />);
		expect(screen.getByText('Team')).toBeInTheDocument();
		expect(screen.getByText('Decisions')).toBeInTheDocument();
		expect(screen.getByText('Files')).toBeInTheDocument();
	});

	it('calls onClose when backdrop is clicked', () => {
		const onClose = vi.fn();
		render(<SquadPanel open={true} onClose={onClose} />);
		const dialog = screen.getByRole('dialog');
		fireEvent.click(dialog);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('calls onClose when X button is clicked', () => {
		const onClose = vi.fn();
		render(<SquadPanel open={true} onClose={onClose} />);
		// Find the close button (contains an SVG)
		const buttons = screen.getAllByRole('button');
		const closeBtn = buttons.find(b => b.querySelector('svg'));
		expect(closeBtn).toBeDefined();
		fireEvent.click(closeBtn!);
		expect(onClose).toHaveBeenCalled();
	});

	it('shows error message when fetch fails', async () => {
		mockFetch.mockRejectedValue(new Error('Network error'));

		render(<SquadPanel open={true} onClose={vi.fn()} />);

		await waitFor(() => {
			expect(screen.getByText('Network error')).toBeInTheDocument();
		});
	});

	it('shows "No .squad/ files found" when files list is empty', async () => {
		mockFetch.mockImplementation((url: string) => {
			if (url.includes('/api/squad/team'))
				return jsonResponse({ content: '# Team' });
			if (url.includes('/api/squad/decisions'))
				return jsonResponse({ content: '# Decisions' });
			if (url.includes('/api/squad/files'))
				return jsonResponse({ files: [] });
			return jsonResponse({}, false);
		});

		render(<SquadPanel open={true} onClose={vi.fn()} />);

		// Switch to Files tab
		fireEvent.click(screen.getByText('Files'));

		await waitFor(() => {
			expect(screen.getByText('No .squad/ files found')).toBeInTheDocument();
		});
	});

	it('switches between tabs', async () => {
		render(<SquadPanel open={true} onClose={vi.fn()} />);

		// Click Decisions tab
		fireEvent.click(screen.getByText('Decisions'));
		// Click Files tab
		fireEvent.click(screen.getByText('Files'));
		// Click Team tab
		fireEvent.click(screen.getByText('Team'));

		// All tab buttons should exist
		expect(screen.getByText('Team')).toBeInTheDocument();
		expect(screen.getByText('Decisions')).toBeInTheDocument();
		expect(screen.getByText('Files')).toBeInTheDocument();
	});

	it('handles non-ok responses gracefully', async () => {
		mockFetch.mockImplementation(() => jsonResponse({}, false));

		render(<SquadPanel open={true} onClose={vi.fn()} />);

		// Should not crash — panel should still render
		await waitFor(() => {
			expect(screen.getByText('Squad Info')).toBeInTheDocument();
		});
	});
});
