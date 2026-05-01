import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// A component that throws on render
function ThrowingComponent({ error }: { error: Error }) {
	throw error;
}

// Suppress React error boundary console.error noise in tests
beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ErrorBoundary', () => {
	it('renders children when no error occurs', () => {
		render(
			<ErrorBoundary>
				<div>Content</div>
			</ErrorBoundary>
		);
		expect(screen.getByText('Content')).toBeInTheDocument();
	});

	it('shows default error UI when child throws', () => {
		render(
			<ErrorBoundary>
				<ThrowingComponent error={new Error('Test crash')} />
			</ErrorBoundary>
		);
		expect(screen.getByText('Something went wrong')).toBeInTheDocument();
		expect(screen.getByText('Test crash')).toBeInTheDocument();
	});

	it('shows custom fallback when provided', () => {
		render(
			<ErrorBoundary fallback={<div>Custom error page</div>}>
				<ThrowingComponent error={new Error('boom')} />
			</ErrorBoundary>
		);
		expect(screen.getByText('Custom error page')).toBeInTheDocument();
	});

	it('provides a "Try Again" button in default error UI', () => {
		render(
			<ErrorBoundary>
				<ThrowingComponent error={new Error('boom')} />
			</ErrorBoundary>
		);
		expect(screen.getByText('Try Again')).toBeInTheDocument();
	});
});
