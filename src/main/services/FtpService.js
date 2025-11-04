const { Client } = require('basic-ftp');
const Queue = require('better-queue');
const path = require('path');

class FtpService {
  constructor() {
    this.connections = new Map();
    
    // Initialize FTP upload queue
    this.ftpUploadQueue = new Queue(this.processFtpUploadTask.bind(this), {
      concurrent: 3, // Process up to 3 FTP uploads concurrently
      retries: 2, // Retry failed uploads up to 2 times
      retryDelay: 3000, // Wait 3 seconds between retries
      maxTimeout: 120000 // 2 minute timeout per upload
    });

    // Track active FTP upload tasks
    this.activeFtpTasks = new Map();
  }

  initialize() {
    console.log('FTP Service initialized');
  }

  // Queue FTP upload task for a specific printer
  queueFtpUpload(printer, slicedFilePath, fileName) {
    return new Promise((resolve, reject) => {
      const taskId = `${printer.id}-${fileName}-${Date.now()}`;
      const taskData = {
        taskId,
        printer,
        slicedFilePath,
        fileName,
        printerName: printer.name
      };

      console.log(`📤 Queuing FTP upload task: ${taskId} for ${printer.name}`);

      // Store the promise callbacks
      this.activeFtpTasks.set(taskId, { resolve, reject });

      // Add task to queue
      this.ftpUploadQueue.push(taskData, (error, result) => {
        const callbacks = this.activeFtpTasks.get(taskId);
        if (callbacks) {
          this.activeFtpTasks.delete(taskId);
          if (error) {
            console.error(`❌ FTP upload task failed: ${taskId}`, error);
            callbacks.reject(error);
          } else {
            console.log(`✅ FTP upload task completed: ${taskId}`);
            callbacks.resolve(result);
          }
        }
      });
    });
  }

  // Queue FTP uploads for multiple printers with the same model
  queueFtpUploadsForModel(printers, slicedFilePath, fileName) {
    const promises = printers.map(printer => {
      return this.queueFtpUpload(printer, slicedFilePath, fileName);
    });

    return Promise.all(promises);
  }

  // Process a single FTP upload task (called by the queue)
  async processFtpUploadTask(taskData, cb) {
    try {
      console.log(`📡 Processing FTP upload task: ${taskData.taskId} to ${taskData.printerName}`);
      const result = await this.uploadSlicedFile(taskData.printer, taskData.slicedFilePath, taskData.fileName);
      cb(null, result);
    } catch (error) {
      cb(error);
    }
  }

  // Upload sliced file to specific printer
  async uploadSlicedFile(printer, slicedFilePath, fileName) {
    if (!printer.ipAddress || !printer.accessCode) {
      throw new Error('Printer IP address and access code are required');
    }

    const client = new Client();
    const connectionKey = `${printer.id}-upload-${Date.now()}`;
    this.connections.set(connectionKey, client);

    try {
      client.ftp.timeout = 60000; // 60 second timeout for uploads

      console.log(`📤 [FTP] Starting upload: ${fileName} → ${printer.name} (${printer.ipAddress}:990)`);

      // Get file size first for accurate progress tracking
      const fs = require('fs').promises;
      const stats = await fs.stat(slicedFilePath);
      const fileSizeBytes = stats.size;
      
      console.log(`📁 [FTP] File size: ${this.formatBytes(fileSizeBytes)}`);

      // Add progress tracking
      let lastProgress = 0;
      client.trackProgress(info => {
        // Use the actual file size for percentage calculation
        const progress = fileSizeBytes > 0 ? Math.round((info.bytesOverall / fileSizeBytes) * 100) : 0;
        
        // Only log every 10% to avoid spam, but ensure we don't skip 100%
        if (progress >= lastProgress + 10 || (progress === 100 && lastProgress < 100)) {
          console.log(`📊 [FTP] ${printer.name}: ${fileName} - ${progress}% (${this.formatBytes(info.bytesOverall)}/${this.formatBytes(fileSizeBytes)})`);
          lastProgress = progress;
        }
      });

      await client.access({
        host: printer.ipAddress,
        port: 990, // FTPS port
        user: 'bblp', // Bambu Lab user
        password: printer.accessCode,
        secure: 'implicit', // Use implicit FTPS
        secureOptions: {
          rejectUnauthorized: false,
          requestCert: false,
        }
      });

      console.log(`🔗 [FTP] Connected to ${printer.name} for upload`);

      // Upload the sliced file
      const remotePath = `/${fileName}`;
      await client.uploadFrom(slicedFilePath, remotePath);

      // Stop progress tracking (basic-ftp doesn't have clearProgress, just stop calling trackProgress)
      console.log(`✅ [FTP] Upload COMPLETED: ${fileName} → ${printer.name} (${printer.ipAddress}) - ${this.formatBytes(fileSizeBytes)} - SUCCESS`);

      return {
        success: true,
        printer: printer.name,
        fileName: fileName,
        remotePath: remotePath,
        fileSize: fileSizeBytes
      };

    } catch (error) {
      console.error(`❌ [FTP] Upload FAILED: ${fileName} → ${printer.name} (${printer.ipAddress}) - ${error.message}`);
      throw new Error(`Failed to upload to ${printer.name}: ${error.message}`);
    } finally {
      try {
        await client.close();
      } catch (closeError) {
        console.warn(`⚠️ [FTP] Warning: Error closing connection to ${printer.name}:`, closeError.message);
      }
      this.connections.delete(connectionKey);
    }
  }

  // Format bytes for human-readable output
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  // Get FTP upload queue statistics
  getFtpQueueStats() {
    return {
      length: this.ftpUploadQueue.length,
      running: this.ftpUploadQueue.running,
      succeeded: this.ftpUploadQueue.succeeded,
      failed: this.ftpUploadQueue.failed,
      activeTasks: this.activeFtpTasks.size
    };
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

  async startPrint(printer, fileName, plateIndex, filamentId, mqttService) {
    if (!mqttService) {
      throw new Error('MQTT service is required to start print');
    }

    console.log(`🖨️ [FTP] Print start requested: ${fileName} on ${printer.name} (Plate ${plateIndex}, Filament ${filamentId})`);

    try {
      // Use MQTT service to send print command
      const result = await mqttService.startPrint(printer, fileName, plateIndex, filamentId);
      console.log(`✅ [FTP] Print command completed for ${fileName} on ${printer.name}`);
      return result;
    } catch (error) {
      console.error(`❌ [FTP] Failed to start print on ${printer.name}:`, error);
      throw error;
    }
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

  async downloadFile(printerService, printerId, fileName) {
    const printer = printerService.getPrinter(printerId);
    if (!printer) {
      throw new Error(`Printer not found: ${printerId}`);
    }

    const client = new Client();
    client.ftp.timeout = 60000; // 60 second timeout

    try {
      console.log(`📥 [FTP] Starting download: ${fileName} ← ${printer.name} (${printer.ipAddress}:990)`);

      // Connect to FTPS
      await client.access({
        host: printer.ipAddress,
        port: 990, // FTPS port
        user: 'bblp', // Bambu Lab user
        password: printer.accessCode,
        secure: 'implicit', // Use implicit FTPS
        secureOptions: {
          rejectUnauthorized: false,
          requestCert: false,
          enableTrace: false
        }
      });

      console.log(`🔗 [FTP] Connected to ${printer.name} for download`);

      // Get remote file size first for accurate progress tracking
      const remotePath = `/${fileName}`;
      const remoteFileInfo = await client.size(remotePath);
      const fileSizeBytes = remoteFileInfo;

      console.log(`📁 [FTP] File size: ${this.formatBytes(fileSizeBytes)}`);

      // Add progress tracking
      let lastProgress = 0;
      client.trackProgress(info => {
        const progress = fileSizeBytes > 0 ? Math.round((info.bytesOverall / fileSizeBytes) * 100) : 0;

        // Only log every 10% to avoid spam
        if (progress >= lastProgress + 10 || (progress === 100 && lastProgress < 100)) {
          console.log(`📊 [FTP] ${printer.name}: ${fileName} - ${progress}% (${this.formatBytes(info.bytesOverall)}/${this.formatBytes(fileSizeBytes)})`);
          lastProgress = progress;
        }
      });

      // Get app data directory
      const { app } = require('electron');
      const userDataPath = app.getPath('userData');
      const downloadsPath = path.join(userDataPath, 'downloads');

      // Ensure downloads directory exists
      const fs = require('fs').promises;
      await fs.mkdir(downloadsPath, { recursive: true });

      // Download the file
      const localPath = path.join(downloadsPath, fileName);
      await client.downloadTo(localPath, remotePath);

      console.log(`✅ [FTP] Download COMPLETED: ${fileName} ← ${printer.name} (${printer.ipAddress}) - ${this.formatBytes(fileSizeBytes)} - SUCCESS`);
      return localPath;

    } catch (error) {
      console.error(`❌ [FTP] Download FAILED: ${fileName} ← ${printer.name} (${printer.ipAddress}) - ${error.message}`);
      throw error;
    } finally {
      try {
        await client.close();
      } catch (closeError) {
        console.warn(`⚠️ [FTP] Warning: Error closing connection to ${printer.name}:`, closeError.message);
      }
    }
  }

  shutdown() {
    console.log('Shutting down FTPS Service...');

    // Destroy the FTP upload queue
    if (this.ftpUploadQueue) {
      this.ftpUploadQueue.destroy();
    }
    this.activeFtpTasks.clear();

    this.disconnectAll();
  }
}

module.exports = FtpService;