const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class PrinterService {
  constructor(mqttService) {
    this.printers = new Map();
    this.printersFilePath = null;
    this.mqttService = mqttService;
  }

  initialize() {
    this.printersFilePath = path.join(app.getPath('userData'), 'printers.json');
    this.loadPrinters();
    
    if (this.mqttService) {
      // Connect to all enabled printers via MQTT
      this.mqttService.connectToAllPrinters(this.getAllPrinters());
    }
  }

  loadPrinters() {
    try {
      if (fs.existsSync(this.printersFilePath)) {
        const data = fs.readFileSync(this.printersFilePath, 'utf8');
        const printers = JSON.parse(data);
        this.printers.clear();
        printers.forEach(printer => {
          this.printers.set(printer.id, printer);
        });
        console.log(`Loaded ${printers.length} printers from file`);
      } else {
        // Load from project root printers.json if exists
        const projectPrintersPath = path.join(process.cwd(), 'printers.json');
        if (fs.existsSync(projectPrintersPath)) {
          const data = fs.readFileSync(projectPrintersPath, 'utf8');
          const printers = JSON.parse(data);
          this.savePrinters(printers);
          printers.forEach(printer => {
            this.printers.set(printer.id, printer);
          });
          console.log(`Loaded ${printers.length} printers from project default`);
        } else {
          console.log('No printers file found');
        }
      }
    } catch (error) {
      console.error('Error loading printers:', error);
    }
  }

  savePrinters(printers = null) {
    try {
      const printersArray = printers || Array.from(this.printers.values());
      fs.writeFileSync(this.printersFilePath, JSON.stringify(printersArray, null, 2));
      console.log(`Saved ${printersArray.length} printers to file`);
    } catch (error) {
      console.error('Error saving printers:', error);
    }
  }

  getAllPrinters() {
    return Array.from(this.printers.values());
  }

  getPrinter(id) {
    return this.printers.get(id);
  }

  addPrinter(printerData) {
    const id = Date.now().toString();
    const printer = { id, ...printerData, status: 'offline' };
    this.printers.set(id, printer);
    this.savePrinters();
    
    // Connect to MQTT if enabled
    if (this.mqttService && printer.enabled) {
      this.mqttService.connectToPrinter(printer);
    }
    
    return printer;
  }

  updatePrinter(id, updates) {
    if (this.printers.has(id)) {
      const oldPrinter = this.printers.get(id);
      const printer = { ...oldPrinter, ...updates };
      this.printers.set(id, printer);
      this.savePrinters();
      
      // Handle MQTT connection changes
      if (this.mqttService) {
        if (printer.enabled && (
          oldPrinter.ipAddress !== printer.ipAddress ||
          oldPrinter.serialNo !== printer.serialNo ||
          oldPrinter.accessCode !== printer.accessCode ||
          !oldPrinter.enabled
        )) {
          // Reconnect if connection details changed or printer was re-enabled
          this.mqttService.disconnectPrinter(id);
          this.mqttService.connectToPrinter(printer);
        } else if (!printer.enabled && oldPrinter.enabled) {
          // Disconnect if printer was disabled
          this.mqttService.disconnectPrinter(id);
        }
      }
      
      return printer;
    }
    return null;
  }

  deletePrinter(id) {
    if (this.printers.has(id)) {
      // Disconnect from MQTT before deleting
      if (this.mqttService) {
        this.mqttService.disconnectPrinter(id);
      }
      
      this.printers.delete(id);
      this.savePrinters();
      return true;
    }
    return false;
  }

  updatePrinterStatus(id, status) {
    return this.updatePrinter(id, { status });
  }

  getOnlineStatus(printerId) {
    if (this.mqttService) {
      return this.mqttService.getStatus(printerId);
    }
    return 'offline';
  }

  getAllOnlineStatuses() {
    if (this.mqttService) {
      return this.mqttService.getAllStatuses();
    }
    return {};
  }

  getCachedPrinterData(printerId) {
    if (this.mqttService && this.mqttService.statusCache) {
      return this.mqttService.statusCache.get(printerId);
    }
    return null;
  }
}

module.exports = PrinterService;