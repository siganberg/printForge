const { app, BrowserWindow } = require('electron');
const ApplicationManager = require('./ApplicationManager');

let applicationManager = null;

// Override console.log to add timestamps
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function formatTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

console.log = (...args) => {
  originalConsoleLog(`[${formatTimestamp()}]`, ...args);
};

console.error = (...args) => {
  originalConsoleError(`[${formatTimestamp()}]`, ...args);
};

console.warn = (...args) => {
  originalConsoleWarn(`[${formatTimestamp()}]`, ...args);
};

// Application entry point
app.whenReady().then(async () => {
  console.log('PrintForge starting...');
  
  applicationManager = new ApplicationManager();
  await applicationManager.initialize();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && process.env.HEADLESS !== 'true') {
      applicationManager.createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit in headless mode or on macOS
  if (process.platform !== 'darwin' && process.env.HEADLESS !== 'true') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (applicationManager) {
    applicationManager.shutdown();
  }
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  if (applicationManager) {
    applicationManager.shutdown();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  if (applicationManager) {
    applicationManager.shutdown();
  }
  process.exit(0);
});