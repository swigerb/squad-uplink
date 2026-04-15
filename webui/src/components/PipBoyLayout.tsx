import type { ReactNode } from 'react';
import { useTheme } from '../hooks/useTheme';

interface PipBoyLayoutProps {
	children: ReactNode;
}

export function PipBoyLayout({ children }: PipBoyLayoutProps) {
	const { themeId } = useTheme();

	if (themeId !== 'pipboy') {
		return <>{children}</>;
	}

	return (
		<div className="pipboy-viewport">
			<div className="pipboy-pip">
				<div className="pipboy-pipfront">
					{/* Decorative top elements */}
					<div className="pipboy-dtop">
						<div className="pipboy-dial" />
					</div>
					<div className="pipboy-dtop2">
						<div className="pipboy-dial2" />
					</div>

					{/* Screen area */}
					<div className="pipboy-screen">
						<div className="pipboy-scanline" />
						{/* Walking Vault Boy */}
						<div className="pipboy-vaultboy-walk">
							<img
								src="/images/pipboy/vaultboy2.gif"
								alt="Vault Boy"
								style={{ height: '40px', opacity: 0.6, imageRendering: 'pixelated' }}
							/>
						</div>
						<div className="pipboy-screen-content">
							{children}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
