import { useConnectionStore } from '@/store/connectionStore';
import { CRTOverlay } from '@/components/CRTOverlay';
import { Apple2eKeyboard } from './Apple2eKeyboard';

interface Apple2eLayoutProps {
  children: React.ReactNode;
  statusBar: React.ReactNode;
  crtEnabled: boolean;
}

export function Apple2eLayout({ children, statusBar, crtEnabled }: Apple2eLayoutProps) {
  const status = useConnectionStore((s) => s.status);
  const isConnected = status === 'connected';

  return (
    <div className={crtEnabled ? 'crt-screen' : undefined} style={{ width: '100%', height: '100%' }}>
      <div className="a2e-container">
        <div className="a2e-bg" />
        <h1 className="a2e-h1-bg">
          Apple <span>IIe</span>
        </h1>
        <div className="a2e-scene">
          <div className="a2e-back-shadow" />
          <div className="a2e-monitor-shadow" />
          <div className="a2e-monitor">
            <div className="a2e-monitor__soft-shadow" />
            <div className="a2e-monitor__shadow" />
            <div className="a2e-monitor__inner" />
            <div className="a2e-monitor__inner-shadow" />
            <div className="a2e-monitor__inner-shadow-light" />
            <div className="a2e-monitor__inner-shadow-dark" />
            <div className="a2e-monitor__screen" />
            <div className="a2e-monitor__screen-2">
              <div className="a2e-monitor__terminal">{children}</div>
            </div>
            <div className="a2e-monitor__screen-2 a2e-top-shadow" />
            <div className="a2e-monitor__screen-2 a2e-bottom-shadow" />
            <div className="a2e-monitor__logo-embed" />
            <div className="a2e-monitor__line" />
            <div className="a2e-monitor__power-switch">
              <div className="a2e-monitor__power-switch__button" />
            </div>
          </div>
          <Apple2eKeyboard />
          {/* Disk II Floppy Drive */}
          <div className="a2e-floppy">
            <div className="a2e-floppy-left">
              <div className="a2e-floppy-emboss" />
            </div>
            <div className="a2e-floppy-top">
              <div className="a2e-floppy-emboss a2e-floppy-emboss-1" />
              <div className="a2e-floppy-embed a2e-floppy-embed-1" />
              <div className="a2e-floppy-emboss a2e-floppy-emboss-2" />
              <div className="a2e-floppy-embed a2e-floppy-embed-2" />
            </div>
            <div className="a2e-floppy-front">
              <div className="a2e-floppy-slot-container">
                <div className="a2e-floppy-slot">
                  <div className="a2e-floppy-hole" />
                </div>
              </div>
              <div className="a2e-floppy-slot-embed">
                <div className="a2e-floppy-cover" />
                <div className="a2e-floppy-shadow" />
              </div>
              <div className="a2e-floppy-logo" />
              <div className="a2e-floppy-label">disk II</div>
              <div className="a2e-floppy-light">
                <span>IN USE</span>
                <span className="a2e-floppy-arrow">▼</span>
                <div className={`a2e-floppy-led ${isConnected ? 'a2e-floppy-led--active' : ''}`}>
                  <div className="a2e-floppy-reflection" />
                </div>
              </div>
            </div>
            <div className="a2e-floppy-bottom" />
          </div>
        </div>
        <div className="a2e-statusbar">{statusBar}</div>
      </div>
      <CRTOverlay crtEnabled={crtEnabled} />
    </div>
  );
}
