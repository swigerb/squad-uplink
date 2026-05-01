import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContextUsageBar, type ContextUsage } from '../components/ContextUsageBar';

describe('ContextUsageBar', () => {
	const defaultUsage: ContextUsage = {
		tokenLimit: 128000,
		currentTokens: 64000,
		systemTokens: 10000,
		conversationTokens: 44000,
		toolDefinitionsTokens: 10000,
	};

	it('renders the percentage display', () => {
		render(<ContextUsageBar contextUsage={defaultUsage} />);
		expect(screen.getByText('Context: 50%')).toBeInTheDocument();
	});

	it('renders token counts in k format', () => {
		render(<ContextUsageBar contextUsage={defaultUsage} />);
		expect(screen.getByText('64k / 128k')).toBeInTheDocument();
	});

	it('shows system token breakdown', () => {
		render(<ContextUsageBar contextUsage={defaultUsage} />);
		// systemTotal = 10000 + 10000 = 20000 → 16% of 128000
		expect(screen.getByText(/System 16%/)).toBeInTheDocument();
		expect(screen.getByText(/20k/)).toBeInTheDocument();
	});

	it('shows conversation token breakdown', () => {
		render(<ContextUsageBar contextUsage={defaultUsage} />);
		// conversationTokens = 44000 → 34% of 128000
		expect(screen.getByText(/Messages 34%/)).toBeInTheDocument();
		expect(screen.getByText(/44k/)).toBeInTheDocument();
	});

	it('shows free space', () => {
		render(<ContextUsageBar contextUsage={defaultUsage} />);
		// free = 128000 - 64000 = 64000 → 50%
		expect(screen.getByText(/Free 50%/)).toBeInTheDocument();
	});

	it('handles 0% usage', () => {
		const empty: ContextUsage = {
			tokenLimit: 128000,
			currentTokens: 0,
			systemTokens: 0,
			conversationTokens: 0,
			toolDefinitionsTokens: 0,
		};
		render(<ContextUsageBar contextUsage={empty} />);
		expect(screen.getByText('Context: 0%')).toBeInTheDocument();
	});

	it('handles 100% usage', () => {
		const full: ContextUsage = {
			tokenLimit: 128000,
			currentTokens: 128000,
			systemTokens: 64000,
			conversationTokens: 64000,
			toolDefinitionsTokens: 0,
		};
		render(<ContextUsageBar contextUsage={full} />);
		expect(screen.getByText('Context: 100%')).toBeInTheDocument();
		expect(screen.getByText(/Free 0%/)).toBeInTheDocument();
	});

	it('renders progress bar segments', () => {
		const { container } = render(<ContextUsageBar contextUsage={defaultUsage} />);
		// The progress bar has two colored segments
		const bar = container.querySelector('.flex.rounded-full');
		expect(bar).toBeInTheDocument();
		expect(bar?.children).toHaveLength(2);
	});
});
