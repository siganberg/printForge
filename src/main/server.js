// Production server (without Electron)
const PrinterService = require('./services/PrinterService');
const SettingsService = require('./services/SettingsService');
const WebSocketService = require('./services/WebSocketService');
const MqttService = require('./services/MqttService');
const FtpService = require('./services/FtpService');
const SlicingService = require('./services/SlicingService');
const PresetsService = require('./services/PresetsService');
const CameraService = require('./services/CameraService');

class ProductionServer {
  constructor() {
    this.mqttService = new MqttService();
    this.ftpService = new FtpService();
    this.presetsService = new PresetsService();
    this.printerService = new PrinterService(this.mqttService);
    this.settingsService = new SettingsService();
    this.cameraService = new CameraService(this.printerService);
    this.slicingService = new SlicingService(this.printerService, this.ftpService);
    this.webSocketService = new WebSocketService(
      this.printerService,
      this.settingsService,
      this.ftpService,
      this.slicingService,
      this.presetsService,
      this.mqttService,
      this.cameraService
    );
  }

  async initialize() {
    console.log('🚀 Starting PrintForge Production Server...');

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

    console.log('✅ PrintForge server initialized successfully');
  }

  shutdown() {
    console.log('🛑 Shutting down PrintForge server...');
    this.webSocketService.close();
    this.mqttService.shutdown();
    this.ftpService.shutdown();
    this.slicingService.destroy();
  }
}

// Start the server
const server = new ProductionServer();

server.initialize().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  server.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.shutdown();
  process.exit(0);
});
