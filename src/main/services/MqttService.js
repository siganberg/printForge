const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');

class MqttService {
  constructor() {
    this.clients = new Map();
    this.statusCache = new Map();
    this.listeners = new Set();
    this.refreshIntervals = new Map();
    this.defaultRefreshMs = 1000;
    this.samplesDir = path.join(__dirname, '../../../samples');
    this.dumpedSerials = new Set(); // Track which serials we've already dumped
  }

  initialize() {
    console.log('MQTT Service initialized');
    // Ensure samples directory exists
    if (!fs.existsSync(this.samplesDir)) {
      fs.mkdirSync(this.samplesDir, { recursive: true });
    }
  }

  dumpMqttSample(serialNumber, message) {
    // Only dump once per serial number per session
    if (this.dumpedSerials.has(serialNumber)) {
      return;
    }

    const samplePath = path.join(this.samplesDir, `${serialNumber}.json`);

    // Check if sample already exists
    if (fs.existsSync(samplePath)) {
      console.log(`📄 Sample already exists for ${serialNumber}`);
      this.dumpedSerials.add(serialNumber);
      return;
    }

    try {
      // Write the full MQTT message to the sample file
      fs.writeFileSync(samplePath, JSON.stringify(message, null, 2));
      console.log(`💾 Dumped MQTT sample for ${serialNumber} to ${samplePath}`);
      this.dumpedSerials.add(serialNumber);
    } catch (error) {
      console.error(`❌ Failed to dump MQTT sample for ${serialNumber}:`, error);
    }
  }

  addStatusListener(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  broadcastStatus(printerId, status) {
    const cacheData = this.statusCache.get(printerId) || {};
    const previousStatus = cacheData.status;
    
    // Only broadcast if status actually changed
    if (previousStatus === status) {
      return; // Skip broadcasting if status hasn't changed
    }
    
    const updatedData = { 
      ...cacheData,
      printerId, 
      status
    };
    this.statusCache.set(printerId, updatedData);
    
    console.log(`📡 Status changed for ${printerId}: ${previousStatus} → ${status}`);
    
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
    const previousData = cacheData.printerData || {};
    
    // Calculate changes between previous and current data
    const changes = this.calculatePrinterDataChanges(previousData, printerData);
    
    // Only broadcast if there are actual changes
    if (Object.keys(changes).length === 0) {
      return; // Skip broadcasting if no changes
    }
    
    const updatedData = { 
      ...cacheData,
      printerId,
      printerData
    };
    this.statusCache.set(printerId, updatedData);
    
    this.listeners.forEach(callback => {
      try {
        // Send only the changes, not the full data
        callback(printerId, changes, 'printer-data');
      } catch (error) {
        console.error('Printer data listener error:', error);
      }
    });
  }

  calculatePrinterDataChanges(previousData, currentData) {
    const changes = {};
    const threshold = 0.5; // Temperature threshold to avoid noise
    
    // Check each field for changes
    const fieldsToCheck = [
      'bedTemp', 'bedTargetTemp', 'nozzleTemp', 'nozzleTargetTemp',
      'progress', 'projectId', 'subtaskName', 'gcodeFile', 'gcodeState', 'ams'
    ];
    
    fieldsToCheck.forEach(field => {
      const oldValue = previousData[field];
      const newValue = currentData[field];
      
      // Handle temperature fields with threshold to reduce noise
      if (field.includes('Temp')) {
        const oldTemp = oldValue || 0;
        const newTemp = newValue || 0;
        if (Math.abs(newTemp - oldTemp) >= threshold) {
          changes[field] = newValue;
        }
      }
      // Handle progress with 1% threshold to reduce noise
      else if (field === 'progress') {
        const oldProgress = oldValue || 0;
        const newProgress = newValue || 0;
        if (Math.abs(newProgress - oldProgress) >= 1) {
          changes[field] = newValue;
        }
      }
      // Handle AMS data (array) - compare JSON strings
      else if (field === 'ams') {
        const oldAms = JSON.stringify(oldValue || []);
        const newAms = JSON.stringify(newValue || []);
        if (oldAms !== newAms) {
          changes[field] = newValue;
        }
      }
      // Handle string fields - exact comparison
      else if (oldValue !== newValue) {
        changes[field] = newValue;
      }
    });
    
    return changes;
  }

  extractAmsData(amsData) {
    if (!amsData || !amsData.ams || !Array.isArray(amsData.ams)) {
      return [];
    }

    const filaments = [];

    // Iterate through each AMS unit
    amsData.ams.forEach(amsUnit => {
      if (!amsUnit.tray || !Array.isArray(amsUnit.tray)) {
        return;
      }

      // Extract filament data from each tray
      amsUnit.tray.forEach((tray, index) => {
        // Only include trays that have filament loaded
        if (tray && tray.tray_type && tray.tray_type !== '') {
          filaments.push({
            slot: index,
            type: tray.tray_type || 'Unknown',
            color: tray.tray_color || '#CCCCCC',
            // Note: tray_color is typically in format "RRGGBBAA" (hex with alpha)
            // We'll extract just RGB for display
            colorHex: this.normalizeColor(tray.tray_color)
          });
        }
      });
    });

    return filaments;
  }

  normalizeColor(color) {
    if (!color) return '#CCCCCC';

    // Remove any alpha channel (last 2 chars if 8 chars long)
    // Bambu sends colors as RRGGBBAA
    if (color.length === 8) {
      color = color.substring(0, 6);
    }

    // Ensure it starts with #
    if (!color.startsWith('#')) {
      color = '#' + color;
    }

    return color;
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

  startPrint(printer, fileName, plateIndex, filamentId) {
    return new Promise((resolve, reject) => {
      const client = this.clients.get(printer.id);

      if (!client || !client.connected) {
        reject(new Error(`Printer ${printer.name} is not connected`));
        return;
      }

      if (!printer.serialNo) {
        reject(new Error(`Printer ${printer.name} has no serial number`));
        return;
      }

      // Build the param path for the specific plate's gcode
      const param = plateIndex !== undefined ? `Metadata/plate_${plateIndex}.gcode` : 'Metadata/plate_1.gcode';

      // Build subtask name (typically the filename without extension)
      const subtaskName = fileName.replace(/\.3mf$/i, '');

      // Build AMS mapping array - simple format for single filament
      const amsMapping = [];
      if (filamentId !== undefined && filamentId !== null) {
        amsMapping.push(filamentId);
      }

      const printCommand = {
        print: {
          sequence_id: "0",
          command: 'project_file',
          param: param,
          subtask_name: subtaskName,
          subtask_id: "0",
          file: "",
          project_id: "0",
          profile_id: "0",
          task_id: "0",
          url: `file:///sdcard/${fileName}`,
          md5: "",
          bed_type: "auto",
          bed_leveling: false,
          flow_cali: false,
          vibration_cali: false,
          layer_inspect: false,
          timelapse: false,
          use_ams: filamentId !== undefined && filamentId !== null,
          ams_mapping: amsMapping
        }
      };

      console.log(`🖨️ [MQTT] Sending print command to ${printer.name}:`, JSON.stringify(printCommand, null, 2));

      try {
        client.publish(
          `device/${printer.serialNo}/request`,
          JSON.stringify(printCommand),
          { qos: 0 },
          (error) => {
            if (error) {
              console.error(`❌ [MQTT] Failed to send print command to ${printer.name}:`, error);
              reject(error);
            } else {
              console.log(`✅ [MQTT] Print command sent successfully to ${printer.name} - File: ${fileName}, Plate: ${plateIndex || 'default'}`);
              resolve({
                success: true,
                fileName,
                plateIndex,
                printer: printer.name
              });
            }
          }
        );
      } catch (error) {
        console.error(`❌ [MQTT] Error publishing print command to ${printer.name}:`, error);
        reject(error);
      }
    });
  }

  stopPrint(printer) {
    return new Promise((resolve, reject) => {
      const client = this.clients.get(printer.id);

      if (!client || !client.connected) {
        reject(new Error(`Printer ${printer.name} is not connected`));
        return;
      }

      if (!printer.serialNo) {
        reject(new Error(`Printer ${printer.name} has no serial number`));
        return;
      }

      const stopCommand = {
        print: {
          sequence_id: "0",
          command: 'stop'
        }
      };

      console.log(`🛑 [MQTT] Sending stop command to ${printer.name}`);

      try {
        client.publish(
          `device/${printer.serialNo}/request`,
          JSON.stringify(stopCommand),
          { qos: 1 },
          (error) => {
            if (error) {
              console.error(`❌ [MQTT] Failed to send stop command to ${printer.name}:`, error);
              reject(error);
            } else {
              console.log(`✅ [MQTT] Stop command sent successfully to ${printer.name}`);
              resolve({
                success: true,
                printer: printer.name
              });
            }
          }
        );
      } catch (error) {
        console.error(`❌ [MQTT] Error publishing stop command to ${printer.name}:`, error);
        reject(error);
      }
    });
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

        // Dump sample for this printer if we haven't already
        if (parsed?.print?.command === 'push_status' && printer.serialNo) {
          this.dumpMqttSample(printer.serialNo, parsed);
        }

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
            // Layer information
            layerNum: parsed.print?.['3D']?.layer_num || 0,
            totalLayerNum: parsed.print?.['3D']?.total_layer_num || 0,
            // Print job information
            projectId: parsed.print?.project_id || '',
            subtaskName: parsed.print?.subtask_name || '',
            gcodeFile: parsed.print?.gcode_file || '',
            gcodeState: parsed.print?.gcode_state || '',
            // AMS (filament) information
            ams: this.extractAmsData(parsed.print?.ams)
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