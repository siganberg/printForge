const mqtt = require('mqtt');

class MqttService {
  constructor() {
    this.clients = new Map();
    this.statusCache = new Map();
    this.listeners = new Set();
    this.refreshIntervals = new Map();
    this.defaultRefreshMs = 1000;
  }

  initialize() {
    console.log('MQTT Service initialized');
  }

  addStatusListener(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  broadcastStatus(printerId, status) {
    const cacheData = this.statusCache.get(printerId) || {};
    const updatedData = { 
      ...cacheData,
      printerId, 
      status, 
      timestamp: Date.now() 
    };
    this.statusCache.set(printerId, updatedData);
    
    this.listeners.forEach(callback => {
      try {
        callback(printerId, status, 'status');
      } catch (error) {
        console.error('Status listener error:', error);
      }
    });
  }

  broadcastPrinterData(printerId, printerData) {
    const cacheData = this.statusCache.get(printerId) || {};
    const updatedData = { 
      ...cacheData,
      printerId,
      printerData,
      timestamp: Date.now() 
    };
    this.statusCache.set(printerId, updatedData);
    
    this.listeners.forEach(callback => {
      try {
        callback(printerId, printerData, 'printer-data');
      } catch (error) {
        console.error('Printer data listener error:', error);
      }
    });
  }

  requestPrinterData(client, serialNumber) {
    if (!client || client.disconnecting || client.disconnected || !client.connected) {
      return false;
    }

    const requestMessage = {
      pushing: {
        sequence_id: Date.now().toString(),
        command: 'pushall'
      }
    };

    client.publish(`device/${serialNumber}/request`, JSON.stringify(requestMessage));
    return true;
  }

  connectToPrinter(printer) {
    if (!printer.enabled) {
      this.disconnectPrinter(printer.id);
      return null;
    }

    // Check if already connected with same configuration
    const existing = this.clients.get(printer.id);
    if (existing && existing.connected) {
      return existing;
    }

    if (!printer.ipAddress || !printer.serialNo || !printer.accessCode) {
      console.warn(`Missing connection details for printer ${printer.name} (${printer.id})`);
      return null;
    }

    const endpoint = `mqtts://${printer.ipAddress}:8883`;
    
    const clientOptions = {
      clientId: `printforge_${printer.id}`,
      username: 'bblp',
      password: printer.accessCode,
      keepalive: 60,
      connectTimeout: 5000, // 5 second connection timeout
      reconnectPeriod: 5000, // 5 second retry interval
      rejectUnauthorized: false
    };

    console.log(`🔌 Attempting MQTT connection to ${printer.name} (${printer.ipAddress})...`);
    const client = mqtt.connect(endpoint, clientOptions);
    this.clients.set(printer.id, client);

    // Set up connection timeout handler
    const connectionTimeout = setTimeout(() => {
      if (!client.connected) {
        console.warn(`⏰ Connection timeout for ${printer.name}, forcing disconnect and retry...`);
        this.forceReconnect(printer);
      }
    }, 6000); // Give 6 seconds total (1 second buffer)

    client.on('connect', () => {
      console.log(`✅ Connected to MQTT for printer ${printer.name} (${printer.serialNo})`);
      clearTimeout(connectionTimeout);
      this.broadcastStatus(printer.id, 'online');

      client.subscribe(`device/${printer.serialNo}/report`, (err) => {
        if (err) {
          console.error(`❌ Failed to subscribe to ${printer.name}:`, err);
          this.broadcastStatus(printer.id, 'offline');
          return;
        }

        console.log(`📡 Subscribed to reports for ${printer.name}`);

        // Start requesting printer data periodically
        const sendRequest = () => {
          const published = this.requestPrinterData(client, printer.serialNo);
          if (!published) {
            this.clearRefreshInterval(printer.id);
            this.broadcastStatus(printer.id, 'offline');
          }
        };

        sendRequest();
        const interval = setInterval(sendRequest, this.defaultRefreshMs);
        this.refreshIntervals.set(printer.id, interval);
      });
    });

    client.on('message', (topic, message) => {
      try {
        const raw = message.toString();
        const parsed = JSON.parse(raw);

        if (parsed?.print?.command === 'push_status') {
          // Printer is responding, so it's online
          this.broadcastStatus(printer.id, 'online');
          
          // Extract temperature, progress and print job data
          const printerData = {
            bedTemp: parsed.print?.bed_temper || 0,
            bedTargetTemp: parsed.print?.bed_target_temper || 0,
            nozzleTemp: parsed.print?.nozzle_temper || 0,
            nozzleTargetTemp: parsed.print?.nozzle_target_temper || 0,
            progress: parsed.print?.mc_percent || parsed.print?.percent || 0,  // Try mc_percent first, then percent
            // Print job information
            projectId: parsed.print?.project_id || '',
            subtaskName: parsed.print?.subtask_name || '',
            gcodeFile: parsed.print?.gcode_file || '',
            gcodeState: parsed.print?.gcode_state || ''
          };
          
          // Broadcast printer data to listeners
          this.broadcastPrinterData(printer.id, printerData);
        }
      } catch (error) {
        console.error(`Error parsing MQTT message for ${printer.name}:`, error);
      }
    });

    client.on('error', (error) => {
      console.error(`❌ MQTT error for ${printer.name}:`, error.message || error);
      clearTimeout(connectionTimeout);
      this.broadcastStatus(printer.id, 'offline');
      
      // Check if it's a connection timeout or other connection error
      if (error.message && (error.message.includes('timeout') || error.message.includes('connack'))) {
        console.log(`🔄 Scheduling reconnection for ${printer.name} in 5 seconds...`);
        setTimeout(() => {
          if (printer.enabled) {
            this.forceReconnect(printer);
          }
        }, 5000);
      }
      
      if (client.disconnecting || client.disconnected) {
        this.clearRefreshInterval(printer.id);
      }
    });

    client.on('close', () => {
      console.log(`🔌 MQTT connection closed for ${printer.name}`);
      clearTimeout(connectionTimeout);
      this.broadcastStatus(printer.id, 'offline');
      this.clearRefreshInterval(printer.id);
    });

    client.on('offline', () => {
      console.log(`📴 MQTT offline for ${printer.name}`);
      this.broadcastStatus(printer.id, 'offline');
    });

    client.on('end', () => {
      console.log(`🏁 MQTT connection ended for ${printer.name}`);
      clearTimeout(connectionTimeout);
      this.broadcastStatus(printer.id, 'offline');
      this.clearRefreshInterval(printer.id);
    });

    return client;
  }

  clearRefreshInterval(printerId) {
    const interval = this.refreshIntervals.get(printerId);
    if (interval) {
      clearInterval(interval);
      this.refreshIntervals.delete(printerId);
    }
  }

  forceReconnect(printer) {
    console.log(`🔄 Force reconnecting to ${printer.name}...`);
    
    // Clean disconnect first
    this.disconnectPrinter(printer.id);
    
    // Wait a moment then reconnect
    setTimeout(() => {
      if (printer.enabled) {
        console.log(`🔌 Retrying connection to ${printer.name}...`);
        this.connectToPrinter(printer);
      }
    }, 1000);
  }

  disconnectPrinter(printerId) {
    this.clearRefreshInterval(printerId);
    const client = this.clients.get(printerId);
    if (client) {
      try {
        client.removeAllListeners();
        client.end(true);
      } catch (error) {
        console.error(`Failed to dispose MQTT client for printer ${printerId}:`, error);
      }
      this.clients.delete(printerId);
    }
    this.statusCache.delete(printerId);
    this.broadcastStatus(printerId, 'offline');
  }

  disconnectAllPrinters() {
    Array.from(this.clients.keys()).forEach(printerId => {
      this.disconnectPrinter(printerId);
    });
  }

  getStatus(printerId) {
    const cached = this.statusCache.get(printerId);
    return cached ? cached.status : 'offline';
  }

  getAllStatuses() {
    const result = {};
    this.statusCache.forEach((data, printerId) => {
      result[printerId] = data.status;
    });
    return result;
  }

  connectToAllPrinters(printers) {
    printers.forEach(printer => {
      if (printer.enabled) {
        this.connectToPrinter(printer);
      } else {
        this.disconnectPrinter(printer.id);
      }
    });
  }

  shutdown() {
    console.log('Shutting down MQTT Service...');
    this.disconnectAllPrinters();
    this.listeners.clear();
  }
}

module.exports = MqttService;