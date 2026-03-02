// Initialize colored console logging and global error listeners
const initConsoleColors = () => {
  try {
    const origError = console.error.bind(console);
    console.error = (...args: any[]) => {
      origError('%c[ERROR]', 'color: #fff; background: #dc2626; padding: 2px 6px; border-radius: 3px; font-weight:700;', ...args);
    };

    const origWarn = console.warn.bind(console);
    console.warn = (...args: any[]) => {
      origWarn('%c[WARN]', 'color: #92400e; background: #fef3c7; padding: 2px 6px; border-radius:3px; font-weight:700;', ...args);
    };

    const origInfo = console.info.bind(console);
    console.info = (...args: any[]) => {
      origInfo('%c[INFO]', 'color: #0369a1; font-weight:700;', ...args);
    };

    // Capture uncaught errors and promise rejections and route to console.error
    window.addEventListener('error', (ev: ErrorEvent) => {
      console.error('Uncaught error:', ev.error || ev.message || ev);
    });

    window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', ev.reason);
    });
  } catch (err) {
    // If anything fails during initialization, log plainly
    console.error('Failed to initialize colored console logging', err);
  }
};

export default initConsoleColors;
