import React from 'react';

interface Props { children: React.ReactNode; fallback?: React.ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false };
	}
	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}
	componentDidCatch(error: Error, info: React.ErrorInfo) {
		console.error('ErrorBoundary caught:', error, info);
	}
	render() {
		if (this.state.hasError) {
			return this.props.fallback || (
				<div style={{ padding: '2rem', color: 'var(--text-color, #fff)' }}>
					<h2>Something went wrong</h2>
					<pre style={{ whiteSpace: 'pre-wrap', opacity: 0.7 }}>{this.state.error?.message}</pre>
					<button onClick={() => this.setState({ hasError: false })}>Try Again</button>
				</div>
			);
		}
		return this.props.children;
	}
}
