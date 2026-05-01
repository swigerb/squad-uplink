import { useEffect, useRef } from 'react';

export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
	const closeRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		closeRef.current?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			style={{ background: 'rgba(0,0,0,0.85)' }}
			onClick={onClose}
			role="dialog"
			aria-modal="true"
			aria-label="Image preview"
		>
			<button
				ref={closeRef}
				type="button"
				onClick={onClose}
				className="absolute top-4 right-4 rounded-full p-2 opacity-70 hover:opacity-100"
				style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', cursor: 'pointer', zIndex: 1 }}
				aria-label="Close image preview"
			>
				<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
					<path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
				</svg>
			</button>
			<img
				src={src}
				alt="Full size"
				className="rounded-lg"
				style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain' }}
				onClick={(e) => e.stopPropagation()}
			/>
		</div>
	);
}
