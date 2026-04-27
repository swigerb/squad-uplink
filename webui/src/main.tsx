import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import '../src/themes/pipboy.css';
import '../src/themes/apple2e.css';
import '../src/themes/c64.css';
import '../src/themes/matrix.css';
import '../src/themes/lcars.css';
import '../src/themes/muthur.css';
import '../src/themes/wopr.css';
import '../src/themes/win95.css';
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
