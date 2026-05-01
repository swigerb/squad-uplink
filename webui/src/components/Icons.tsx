import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: string };

const defaults = (size?: string): SVGProps<SVGSVGElement> => ({
	viewBox: '0 0 24 24',
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 2,
	className: size ?? 'size-4',
});

// ── Action icons ────────────────────────────────────────────────────────────

export function CheckIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M20 6L9 17l-5-5" />
		</svg>
	);
}

export function CopyIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<rect x="9" y="9" width="13" height="13" rx="2" />
			<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
		</svg>
	);
}

export function CopyRichIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<rect x="9" y="9" width="13" height="13" rx="2" />
			<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
			<path d="M12 13h5M12 16h3" strokeLinecap="round" />
		</svg>
	);
}

export function TrashIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
		</svg>
	);
}

export function EditIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
		</svg>
	);
}

export function SendIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
		</svg>
	);
}

export function StopIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
			<rect x="5" y="5" width="14" height="14" rx="2" />
		</svg>
	);
}

// ── Navigation / UI icons ───────────────────────────────────────────────────

export function HomeIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
		</svg>
	);
}

export function FolderIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
		</svg>
	);
}

export function BranchIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<path d="M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9" />
		</svg>
	);
}

export function ShieldIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<path d="M12 2L4 5v6c0 5.25 3.75 10.15 8 11 4.25-.85 8-5.75 8-11V5L12 2z" />
		</svg>
	);
}

export function GearIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<circle cx="12" cy="12" r="3" />
			<path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
		</svg>
	);
}

export function PersonIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
		</svg>
	);
}

export function SessionsIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
			<rect x="3" y="7" width="14" height="11" rx="2" />
			<path d="M7 5h12a2 2 0 012 2v10" opacity="0.55" />
		</svg>
	);
}

export function GuidesIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M2 6l7-2 6 2 7-2v16l-7 2-6-2-7 2V6z" />
			<line x1="9" y1="4" x2="9" y2="20" />
			<line x1="15" y1="6" x2="15" y2="22" />
		</svg>
	);
}

export function RulesListIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} strokeLinecap="round" {...props}>
			<circle cx="5" cy="7" r="1.5" fill="currentColor" stroke="none" />
			<line x1="9" y1="7" x2="20" y2="7" />
			<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
			<line x1="9" y1="12" x2="20" y2="12" />
			<circle cx="5" cy="17" r="1.5" fill="currentColor" stroke="none" />
			<line x1="9" y1="17" x2="20" y2="17" />
		</svg>
	);
}

export function EyeIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	);
}

export function ChatBubbleIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M3 15a2 2 0 0 0 2 2h12l4 4V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" />
			<path d="M8 9h8M8 13h5" />
		</svg>
	);
}

export function GuideScrollIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} strokeWidth={1.75} strokeLinecap="round" {...props}>
			<rect x="5" y="2" width="14" height="20" rx="2" />
			<path d="M8 8c1-2 2.5 2 3.5 0s2.5 2 3.5 0" />
			<path d="M8 13c1-2 2.5 2 3.5 0s2.5 2 3.5 0" />
		</svg>
	);
}

export function RecallIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<polyline points="9 10 4 15 9 20" />
			<path d="M20 4v7a4 4 0 0 1-4 4H4" />
		</svg>
	);
}

export function ClearIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} strokeLinecap="round" {...props}>
			<path d="M18 6L6 18M6 6l12 12" />
		</svg>
	);
}

export function InfoCircleIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
		</svg>
	);
}

export function RefreshIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} strokeLinecap="round" strokeLinejoin="round" {...props}>
			<path d="M4 4v5h5M20 20v-5h-5M5 19.5A9 9 0 0112 3m7 1.5A9 9 0 0112 21" />
		</svg>
	);
}

// ── Brand / complex icons ───────────────────────────────────────────────────

export function CopilotIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
			<path d="M23.922 16.992c-.861 1.495-5.859 5.023-11.922 5.023-6.063 0-11.061-3.528-11.922-5.023A.641.641 0 0 1 0 16.736v-2.869a.841.841 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.195 10.195 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952 1.399-1.136 3.392-2.093 6.122-2.093 2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.832.832 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256ZM12.172 11h-.344a4.323 4.323 0 0 1-.355.508C10.703 12.455 9.555 13 7.965 13c-1.725 0-2.989-.359-3.782-1.259a2.005 2.005 0 0 1-.085-.104L4 11.741v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.323 4.323 0 0 1-.355-.508h-.016.016Zm.641-2.935c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z" />
			<path d="M14.5 14.25a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Zm-5 0a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Z" />
		</svg>
	);
}

export function ImageIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} {...props}>
			<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
			<circle cx="8.5" cy="8.5" r="1.5" />
			<path d="M21 15l-5-5L5 21" />
		</svg>
	);
}

export function QRCodeIcon({ size, ...props }: IconProps) {
	return (
		<svg {...defaults(size)} viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
			{/* Top-left finder */}
			<path fillRule="evenodd" d="M2 2h9v9H2V2zm2 2v5h5V4H4z" />
			<rect x="5.5" y="5.5" width="2" height="2" />
			{/* Top-right finder */}
			<path fillRule="evenodd" d="M13 2h9v9h-9V2zm2 2v5h5V4h-5z" />
			<rect x="16.5" y="5.5" width="2" height="2" />
			{/* Bottom-left finder */}
			<path fillRule="evenodd" d="M2 13h9v9H2v-9zm2 2v5h5v-5H4z" />
			<rect x="5.5" y="16.5" width="2" height="2" />
			{/* Data modules */}
			<rect x="13" y="13" width="2.5" height="2.5" />
			<rect x="17" y="13" width="2.5" height="2.5" />
			<rect x="15" y="15.5" width="2.5" height="2.5" />
			<rect x="13" y="18" width="2.5" height="2.5" />
			<rect x="17" y="18" width="2.5" height="2.5" />
			<rect x="19.5" y="15.5" width="2.5" height="2.5" />
			<rect x="13" y="20.5" width="2.5" height="2.5" />
		</svg>
	);
}
