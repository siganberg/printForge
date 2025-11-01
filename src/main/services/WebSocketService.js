const WebSocket = require('ws');

class WebSocketService {
  constructor(printerService, settingsService, ftpService) {
    this.printerService = printerService;
    this.settingsService = settingsService;
    this.ftpService = ftpService;
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

  async handleStartPrint(ws, { printerId, fileName }) {
    try {
      const printer = this.printerService.getPrinter(printerId);
      if (!printer) {
        this.sendResponse(ws, 'error', { message: 'Printer not found' });
        return;
      }

      const result = await this.ftpService.startPrint(printer, fileName);
      this.sendResponse(ws, 'print-started', result);
      
      // Broadcast to all clients that a print job has started
      this.broadcast('print-job-started', {
        printerId,
        fileName,
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

  close() {
    if (this.wss) {
      this.wss.close();
      console.log('WebSocket server closed');
    }
  }
}

module.exports = WebSocketService;