const { app, BrowserWindow } = require('electron');
const ApplicationManager = require('./ApplicationManager');

let applicationManager = null;

// Application entry point
app.whenReady().then(async () => {
  console.log('PrintForge starting...');
  
  applicationManager = new ApplicationManager();
  await applicationManager.initialize();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      applicationManager.createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
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