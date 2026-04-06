import { C64Keyboard } from './C64Keyboard';

interface C64LayoutProps {
  children: React.ReactNode;
  statusBar: React.ReactNode;
  crtEnabled: boolean;
}

export function C64Layout({ children, statusBar, crtEnabled: _crtEnabled }: C64LayoutProps) {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <div className="c64-container">
        <div className="c64-monitor">
          <div className="c64-screen">
            <div className="c64-terminal">{children}</div>
          </div>
        </div>
        <C64Keyboard />
        <div className="c64-statusbar">{statusBar}</div>
      </div>
    </div>
  );
}
