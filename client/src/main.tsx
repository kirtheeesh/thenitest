import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import initConsoleColors from './lib/errorLogging';
import ErrorBoundary from './components/ErrorBoundary';

// Initialize colored console logging and global error handlers
initConsoleColors();

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
