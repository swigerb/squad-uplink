import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
	open: boolean;
	title?: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDialog({
	open,
	title = 'Confirm',
	message,
	confirmLabel = 'Yes',
	cancelLabel = 'Cancel',
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	const confirmRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (open) confirmRef.current?.focus();
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onCancel();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, onCancel]);

	if (!open) return null;

	return (
		<div
			className="fixed inset-0 z-[9999] flex items-center justify-center"
			style={{ background: 'var(--overlay)' }}
			onClick={onCancel}
		>
			<div
				className="w-full max-w-sm rounded-2xl p-5"
				style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
				onClick={(e) => e.stopPropagation()}
			>
				<h3 className="mb-2 text-sm font-semibold" style={{ color: 'var(--text-bright)' }}>{title}</h3>
				<p className="mb-4 text-sm" style={{ color: 'var(--text)' }}>{message}</p>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						className="rounded-lg px-4 py-1.5 text-sm"
						style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
						onClick={onCancel}
					>
						{cancelLabel}
					</button>
					<button
						ref={confirmRef}
						type="button"
						className="rounded-lg px-4 py-1.5 text-sm font-medium"
						style={{ background: 'var(--primary)', color: 'white' }}
						onClick={onConfirm}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
