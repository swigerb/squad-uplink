import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';

// Register service worker for PWA installability
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
