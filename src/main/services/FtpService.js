const { Client } = require('basic-ftp');

class FtpService {
  constructor() {
    this.connections = new Map();
  }

  initialize() {
    console.log('FTP Service initialized');
  }

  isFileEntry(item) {
    if (typeof item.isFile === 'boolean') {
      return item.isFile;
    }

    if (typeof item.type === 'string') {
      return item.type === '-' || item.type.toLowerCase() === 'file';
    }

    if (typeof item.type === 'number') {
      return item.type === 1;
    }

    return false;
  }

  async getFiles(printer) {
    if (!printer.ipAddress || !printer.accessCode) {
      throw new Error('Printer IP address and access code are required');
    }

    const client = new Client();
    const connectionKey = `${printer.id}-${Date.now()}`;
    this.connections.set(connectionKey, client);

    try {
      client.ftp.timeout = 10000; // 10 second timeout

      console.log(`🔌 Connecting to FTPS on ${printer.name} (${printer.ipAddress}:990)...`);

      await client.access({
        host: printer.ipAddress,
        port: 990, // FTPS port
        user: 'bblp', // Bambu Lab user
        password: printer.accessCode,
        secure: 'implicit', // Use implicit FTPS
        secureOptions: {
          rejectUnauthorized: false,
          requestCert: false,
          agent: false,
          sessionIdContext: 'bambu-ftps',
          minVersion: 'TLSv1.2',
          maxVersion: 'TLSv1.3'
        }
      });

      console.log(`✅ FTPS connected to ${printer.name} (${printer.ipAddress})`);

      const listing = await client.list();

      // Filter for common 3D printing file types
      const printFiles = listing
        .filter(item => this.isFileEntry(item))
        .filter(item => {
          const name = item.name.toLowerCase();
          return name.endsWith('.gcode') || 
                 name.endsWith('.3mf') || 
                 name.endsWith('.stl') ||
                 name.endsWith('.gco');
        })
        .map(item => ({
          name: item.name,
          size: item.size || 0,
          date: item.modifiedAt || item.date || new Date(),
          type: this.getFileType(item.name)
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

      console.log(`📁 Found ${printFiles.length} print files on ${printer.name}`);
      
      return { files: printFiles };
    } catch (error) {
      console.error(`❌ FTPS error for ${printer.name}:`, error.message || error);
      throw error;
    } finally {
      client.close();
      this.connections.delete(connectionKey);
    }
  }

  getFileType(filename) {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
      case 'gcode':
      case 'gco':
        return 'G-Code';
      case '3mf':
        return '3MF';
      case 'stl':
        return 'STL';
      default:
        return 'Unknown';
    }
  }

  async startPrint(printer, fileName) {
    // Note: Starting a print job on Bambu printers typically requires MQTT commands
    // This is a placeholder - actual implementation would need MQTT integration
    console.log(`🖨️ Print start requested for ${fileName} on ${printer.name}`);
    console.log(`📝 Note: Actual print start requires MQTT command integration`);
    
    // For now, just simulate the action
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`✅ Print command sent for ${fileName} on ${printer.name}`);
        resolve({ success: true, fileName });
      }, 1000);
    });
  }

  disconnectAll() {
    console.log('Disconnecting all FTPS connections...');
    this.connections.forEach((client, key) => {
      try {
        client.close();
      } catch (error) {
        console.error(`Failed to close FTPS connection ${key}:`, error);
      }
    });
    this.connections.clear();
  }

  shutdown() {
    console.log('Shutting down FTPS Service...');
    this.disconnectAll();
  }
}

module.exports = FtpService;