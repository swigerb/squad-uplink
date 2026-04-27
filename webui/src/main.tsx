import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { ThemeProvider } from './hooks/useTheme';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';

// Register service worker for PWA installability
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<ThemeProvider>
			<ErrorBoundary>
				<App />
			</ErrorBoundary>
		</ThemeProvider>
	</StrictMode>,
);
