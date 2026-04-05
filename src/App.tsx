import { useState, useCallback } from 'react';
import { ThemeProvider } from '@/hooks/useTheme';
import { Terminal } from '@/components/Terminal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CRTOverlay } from '@/components/CRTOverlay';
import '@/styles/global.css';
import '@/styles/crt-effects.css';
import '@/styles/fonts.css';

function AppContent() {
  const [output, setOutput] = useState<string | undefined>();

  const handleInput = useCallback((data: string) => {
    // For now, echo input back — will be wired to WebSocket
    setOutput(`[echo] ${data}`);
  }, []);

  return (
    <div className="crt-screen" style={{ width: '100%', height: '100%' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: '8px 12px',
          position: 'absolute',
          top: 0,
          right: 0,
          zIndex: 1001,
        }}
      >
        <ThemeToggle />
      </header>
      <Terminal onInput={handleInput} output={output} />
      <CRTOverlay />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
