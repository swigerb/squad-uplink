import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../components/ConfirmDialog';

describe('ConfirmDialog', () => {
	const defaultProps = {
		open: true,
		message: 'Are you sure?',
		onConfirm: vi.fn(),
		onCancel: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders nothing when open is false', () => {
		const { container } = render(
			<ConfirmDialog {...defaultProps} open={false} />
		);
		expect(container.innerHTML).toBe('');
	});

	it('renders title and message when open', () => {
		render(<ConfirmDialog {...defaultProps} title="Delete?" />);
		expect(screen.getByText('Delete?')).toBeInTheDocument();
		expect(screen.getByText('Are you sure?')).toBeInTheDocument();
	});

	it('uses default title "Confirm" when no title prop', () => {
		render(<ConfirmDialog {...defaultProps} />);
		expect(screen.getByText('Confirm')).toBeInTheDocument();
	});

	it('uses default button labels "Yes" and "Cancel"', () => {
		render(<ConfirmDialog {...defaultProps} />);
		expect(screen.getByText('Yes')).toBeInTheDocument();
		expect(screen.getByText('Cancel')).toBeInTheDocument();
	});

	it('uses custom button labels', () => {
		render(
			<ConfirmDialog
				{...defaultProps}
				confirmLabel="Delete"
				cancelLabel="Keep"
			/>
		);
		expect(screen.getByText('Delete')).toBeInTheDocument();
		expect(screen.getByText('Keep')).toBeInTheDocument();
	});

	it('calls onConfirm when confirm button is clicked', () => {
		render(<ConfirmDialog {...defaultProps} />);
		fireEvent.click(screen.getByText('Yes'));
		expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
	});

	it('calls onCancel when cancel button is clicked', () => {
		render(<ConfirmDialog {...defaultProps} />);
		fireEvent.click(screen.getByText('Cancel'));
		expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
	});

	it('calls onCancel when backdrop is clicked', () => {
		const { container } = render(<ConfirmDialog {...defaultProps} />);
		// The backdrop is the outermost fixed div
		const backdrop = container.firstElementChild!;
		fireEvent.click(backdrop);
		expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
	});

	it('does NOT call onCancel when inner dialog is clicked', () => {
		render(<ConfirmDialog {...defaultProps} />);
		// The inner dialog contains the message text
		fireEvent.click(screen.getByText('Are you sure?'));
		expect(defaultProps.onCancel).not.toHaveBeenCalled();
	});

	it('calls onCancel when Escape key is pressed', () => {
		render(<ConfirmDialog {...defaultProps} />);
		fireEvent.keyDown(window, { key: 'Escape' });
		expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
	});

	it('does NOT respond to Escape when closed', () => {
		render(<ConfirmDialog {...defaultProps} open={false} />);
		fireEvent.keyDown(window, { key: 'Escape' });
		expect(defaultProps.onCancel).not.toHaveBeenCalled();
	});

	it('focuses the confirm button when opened', () => {
		render(<ConfirmDialog {...defaultProps} />);
		const confirmBtn = screen.getByText('Yes');
		expect(document.activeElement).toBe(confirmBtn);
	});
});
