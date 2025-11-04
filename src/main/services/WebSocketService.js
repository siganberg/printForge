const WebSocket = require('ws');

class WebSocketService {
  constructor(printerService, settingsService, ftpService, slicingService, presetsService, mqttService) {
    this.printerService = printerService;
    this.settingsService = settingsService;
    this.ftpService = ftpService;
    this.slicingService = slicingService;
    this.presetsService = presetsService;
    this.mqttService = mqttService;
    this.wss = null;
    this.port = 8080;
  }

  initialize() {
    this.wss = new WebSocket.Server({ port: this.port });
    
    this.wss.on('connection', (ws) => {
      console.log('Client connected to WebSocket');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected from WebSocket');
      });

      ws.on('error', (error) => {
        console.error('WebSocket client error:', error);
      });
    });

    console.log(`WebSocket server started on port ${this.port}`);
  }

  handleMessage(ws, data) {
    console.log('WebSocket received:', data.type);

    switch (data.type) {
      case 'get-printers':
        const printers = this.printerService.getAllPrinters();
        const statuses = this.printerService.getAllOnlineStatuses();
        
        // Update printer statuses with real-time MQTT status
        const printersWithStatus = printers.map(printer => ({
          ...printer,
          status: statuses[printer.id] || 'offline'
        }));
        
        this.sendResponse(ws, 'printers-data', printersWithStatus);
        
        // Send current printer data for all online printers
        printersWithStatus.forEach(printer => {
          if (printer.status === 'online') {
            const cachedData = this.printerService.getCachedPrinterData(printer.id);
            if (cachedData && cachedData.printerData) {
              this.sendResponse(ws, 'printer-data-changed', {
                printerId: printer.id,
                printerData: cachedData.printerData
              });
            }
          }
        });
        break;

      case 'get-settings':
        this.sendResponse(ws, 'settings-data', this.settingsService.getSettings());
        break;

      case 'update-settings':
        const updatedSettings = this.settingsService.updateSettings(data.payload);
        this.sendResponse(ws, 'settings-updated', updatedSettings);
        break;

      case 'add-printer':
        const newPrinter = this.printerService.addPrinter(data.payload);
        this.broadcast('printer-added', newPrinter);
        break;

      case 'update-printer':
        const updatedPrinter = this.printerService.updatePrinter(data.payload.id, data.payload);
        if (updatedPrinter) {
          this.broadcast('printer-updated', updatedPrinter);
        }
        break;

      case 'delete-printer':
        const deleted = this.printerService.deletePrinter(data.payload.id);
        if (deleted) {
          this.broadcast('printer-deleted', { id: data.payload.id });
        }
        break;

      case 'get-printer-files':
        this.handleGetPrinterFiles(ws, data.payload.printerId);
        break;

      case 'start-print':
        this.handleStartPrint(ws, data.payload);
        break;

      case 'stop-print':
        this.handleStopPrint(ws, data.payload);
        break;

      case 'get-machine-profiles':
        this.handleGetMachineProfiles(ws);
        break;

      case 'get-process-profiles':
        this.handleGetProcessProfiles(ws);
        break;

      case 'upload-slice-file':
        this.handleUploadSliceFile(ws, data.payload);
        break;

      case 'start-slice':
        this.handleStartSlice(ws, data.payload);
        break;

      case 'get-file-plates':
        this.handleGetFilePlates(ws, data.payload);
        break;

      case 'get-sliced-file-plates':
        this.handleGetSlicedFilePlates(ws, data.payload);
        break;

      case 'download-and-extract-file':
        this.handleDownloadAndExtractFile(ws, data.payload);
        break;

      case 'get-slice-presets':
        this.handleGetSlicePresets(ws);
        break;

      case 'save-slice-preset':
        this.handleSaveSlicePreset(ws, data.payload);
        break;

      case 'cleanup-input-file':
        this.handleCleanupInputFile(ws, data.payload);
        break;

      case 'get-queue-stats':
        this.handleGetQueueStats(ws);
        break;

      case 'get-ftp-queue-stats':
        this.handleGetFtpQueueStats(ws);
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  }

  async handleGetPrinterFiles(ws, printerId) {
    try {
      const printer = this.printerService.getPrinter(printerId);
      if (!printer) {
        this.sendResponse(ws, 'error', { message: 'Printer not found' });
        return;
      }

      const result = await this.ftpService.getFiles(printer);
      this.sendResponse(ws, 'printer-files', result);
    } catch (error) {
      console.error('Error getting printer files:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to get printer files',
        details: error.message 
      });
    }
  }

  async handleStartPrint(ws, { printerId, fileName, plateIndex, filamentId }) {
    try {
      const printer = this.printerService.getPrinter(printerId);
      if (!printer) {
        this.sendResponse(ws, 'error', { message: 'Printer not found' });
        return;
      }

      if (!this.mqttService) {
        this.sendResponse(ws, 'error', { message: 'MQTT service not available' });
        return;
      }

      console.log(`🖨️ [WebSocket] Starting print: ${fileName} on ${printer.name}, Plate ${plateIndex}, Filament ${filamentId}`);

      const result = await this.ftpService.startPrint(printer, fileName, plateIndex, filamentId, this.mqttService);
      this.sendResponse(ws, 'print-started', result);

      // Broadcast to all clients that a print job has started
      this.broadcast('print-job-started', {
        printerId,
        fileName,
        plateIndex,
        filamentId,
        printerName: printer.name
      });
    } catch (error) {
      console.error('Error starting print:', error);
      this.sendResponse(ws, 'error', {
        message: 'Failed to start print job',
        details: error.message
      });
    }
  }

  async handleStopPrint(ws, { printerId }) {
    try {
      const printer = this.printerService.getPrinter(printerId);
      if (!printer) {
        this.sendResponse(ws, 'error', { message: 'Printer not found' });
        return;
      }

      if (!this.mqttService) {
        this.sendResponse(ws, 'error', { message: 'MQTT service not available' });
        return;
      }

      console.log(`🛑 [WebSocket] Stopping print on ${printer.name}`);

      const result = await this.mqttService.stopPrint(printer);
      this.sendResponse(ws, 'print-stopped', result);

      // Broadcast to all clients that a print job has stopped
      this.broadcast('print-job-stopped', {
        printerId,
        printerName: printer.name
      });
    } catch (error) {
      console.error('Error stopping print:', error);
      this.sendResponse(ws, 'error', {
        message: 'Failed to stop print job',
        details: error.message
      });
    }
  }

  async handleGetMachineProfiles(ws) {
    try {
      const result = await this.slicingService.getMachineProfiles();
      this.sendResponse(ws, 'machine-profiles', result);
    } catch (error) {
      console.error('Error getting machine profiles:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to get machine profiles',
        details: error.message 
      });
    }
  }

  async handleGetProcessProfiles(ws) {
    try {
      const result = await this.slicingService.getProcessProfiles();
      this.sendResponse(ws, 'process-profiles', result);
    } catch (error) {
      console.error('Error getting process profiles:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to get process profiles',
        details: error.message 
      });
    }
  }

  async handleUploadSliceFile(ws, { fileName, fileSize, fileData }) {
    try {
      const result = await this.slicingService.uploadFile(fileName, fileData);
      this.sendResponse(ws, 'file-uploaded', result);
    } catch (error) {
      console.error('Error uploading slice file:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to upload file',
        details: error.message 
      });
    }
  }

  async handleStartSlice(ws, { fileName, printerModel, machineProfile, processProfile }) {
    try {
      const result = await this.slicingService.queueSliceTask(fileName, printerModel, machineProfile, processProfile);
      this.sendResponse(ws, 'slice-completed', result);
      
      // Broadcast to all clients that a slice job has completed
      this.broadcast('slice-job-completed', {
        fileName: result.fileName,
        printerModel: printerModel,
        outputPath: result.outputPath
      });
    } catch (error) {
      console.error('Error starting slice:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to slice file',
        details: error.message 
      });
    }
  }

  async handleGetFilePlates(ws, { printerId, fileName }) {
    try {
      console.log(`🔍 Looking for printer with ID: ${printerId}`);
      
      // Check if we have sliced files for this printer/file combination
      const printer = this.printerService.getPrinter(printerId);
      if (!printer) {
        console.error(`❌ Printer not found with ID: ${printerId}`);
        
        // List all available printers for debugging
        const allPrinters = this.printerService.getAllPrinters();
        console.log(`📋 Available printers:`, allPrinters.map(p => `${p.id} (${p.name})`));
        
        this.sendResponse(ws, 'error', { message: 'Printer not found' });
        return;
      }

      console.log(`✅ Found printer: ${printer.name} (${printer.model})`);
      const result = await this.slicingService.getSlicedFilePlates(printer.model, fileName);
      this.sendResponse(ws, 'file-plates', result);
    } catch (error) {
      console.error('Error getting file plates:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to get file plates',
        details: error.message 
      });
    }
  }

  async handleGetSlicedFilePlates(ws, { printerModel, fileName }) {
    try {
      const result = await this.slicingService.getSlicedFilePlates(printerModel, fileName);
      this.sendResponse(ws, 'sliced-file-plates', result);
    } catch (error) {
      console.error('Error getting sliced file plates:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to get sliced file plates',
        details: error.message 
      });
    }
  }

  async handleGetSlicePresets(ws) {
    try {
      const result = this.presetsService.getPresets();
      this.sendResponse(ws, 'slice-presets', result);
    } catch (error) {
      console.error('Error getting slice presets:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to get slice presets',
        details: error.message 
      });
    }
  }

  async handleSaveSlicePreset(ws, { printerModel, machineProfile, processProfile }) {
    try {
      const result = await this.presetsService.savePreset(printerModel, machineProfile, processProfile);
      this.sendResponse(ws, 'preset-saved', result);
      
      // Broadcast to all clients that presets have been updated
      this.broadcast('presets-updated', {
        printerModel,
        machineProfile,
        processProfile
      });
    } catch (error) {
      console.error('Error saving slice preset:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to save slice preset',
        details: error.message 
      });
    }
  }

  async handleCleanupInputFile(ws, { fileName }) {
    try {
      const result = await this.slicingService.cleanupInputFile(fileName);
      this.sendResponse(ws, 'file-cleaned', result);
    } catch (error) {
      console.error('Error cleaning up input file:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to cleanup input file',
        details: error.message 
      });
    }
  }

  async handleGetQueueStats(ws) {
    try {
      const stats = this.slicingService.getQueueStats();
      this.sendResponse(ws, 'queue-stats', stats);
    } catch (error) {
      console.error('Error getting queue stats:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to get queue statistics',
        details: error.message 
      });
    }
  }

  async handleGetFtpQueueStats(ws) {
    try {
      const stats = this.ftpService.getFtpQueueStats();
      this.sendResponse(ws, 'ftp-queue-stats', stats);
    } catch (error) {
      console.error('Error getting FTP queue stats:', error);
      this.sendResponse(ws, 'error', { 
        message: 'Failed to get FTP queue statistics',
        details: error.message 
      });
    }
  }

  sendResponse(ws, type, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data }));
    }
  }

  broadcast(type, data) {
    const message = JSON.stringify({ type, data });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  async handleDownloadAndExtractFile(ws, { printerId, fileName, printerModel }) {
    try {
      console.log(`Downloading and extracting file: ${fileName} for printer: ${printerId}`);

      // Download the file from printer via FTP
      const localFilePath = await this.ftpService.downloadFile(this.printerService, printerId, fileName);

      // Extract the 3MF file
      await this.slicingService.extractFile(localFilePath, printerModel);

      // Send completion notification
      ws.send(JSON.stringify({
        type: 'file-extraction-complete',
        data: {
          fileName,
          printerModel,
          success: true
        }
      }));

    } catch (error) {
      console.error('Error downloading and extracting file:', error);
      ws.send(JSON.stringify({
        type: 'error',
        data: {
          message: error.message || 'Failed to download and extract file',
          fileName
        }
      }));
    }
  }

  close() {
    if (this.wss) {
      this.wss.close();
      console.log('WebSocket server closed');
    }
  }
}

module.exports = WebSocketService;