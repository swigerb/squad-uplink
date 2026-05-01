export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4"
			style={{ background: 'rgba(0,0,0,0.85)' }}
			onClick={onClose}
		>
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
