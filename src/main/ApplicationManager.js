const { BrowserWindow } = require('electron');
const path = require('path');
const PrinterService = require('./services/PrinterService');
const SettingsService = require('./services/SettingsService');
const WebSocketService = require('./services/WebSocketService');
const MqttService = require('./services/MqttService');
const FtpService = require('./services/FtpService');
const SlicingService = require('./services/SlicingService');
const PresetsService = require('./services/PresetsService');
const CameraService = require('./services/CameraService');

class ApplicationManager {
  constructor() {
    this.mainWindow = null;
    this.mqttService = new MqttService();
    this.ftpService = new FtpService();
    this.presetsService = new PresetsService();
    this.printerService = new PrinterService(this.mqttService);
    this.settingsService = new SettingsService();
    this.cameraService = new CameraService(this.printerService);

    // Initialize SlicingService with PrinterService and FtpService dependencies
    this.slicingService = new SlicingService(this.printerService, this.ftpService);

    this.webSocketService = new WebSocketService(this.printerService, this.settingsService, this.ftpService, this.slicingService, this.presetsService, this.mqttService, this.cameraService);
  }

  async initialize() {
    console.log('Initializing Application Manager...');
    
    // Initialize services
    this.settingsService.initialize();
    this.mqttService.initialize();
    this.ftpService.initialize();
    await this.slicingService.ensureDirectories();
    await this.presetsService.initialize();
    this.printerService.initialize();
    this.webSocketService.initialize();

    // Set up MQTT status broadcasting to WebSocket clients
    this.mqttService.addStatusListener((printerId, data, type) => {
      if (type === 'status') {
        this.webSocketService.broadcast('printer-status-changed', {
          printerId,
          status: data
        });
      } else if (type === 'printer-data') {
        this.webSocketService.broadcast('printer-data-changed', {
          printerId,
          printerData: data
        });
      }
    });

    // Create main window (unless running headless)
    if (process.env.HEADLESS !== 'true') {
      this.createWindow();
    } else {
      console.log('Running in headless mode (no UI window)');
    }

    console.log('Application Manager initialized successfully');
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const isDev = process.env.NODE_ENV === 'development';
    
    if (isDev) {
      this.mainWindow.loadURL('http://localhost:5173');
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  getMainWindow() {
    return this.mainWindow;
  }

  shutdown() {
    console.log('Shutting down Application Manager...');
    this.webSocketService.close();
    this.mqttService.shutdown();
    this.ftpService.shutdown();
    this.slicingService.destroy();
  }
}

module.exports = ApplicationManager;