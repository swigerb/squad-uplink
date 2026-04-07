import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// PWA service worker registration
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      onNeedRefresh() {
        // Dispatch a custom event that the terminal can listen for
        window.dispatchEvent(new CustomEvent('pwa-update-available'));
      },
      onOfflineReady() {
        console.log('[PWA] Offline ready');
      },
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
