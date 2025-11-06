const tls = require('tls');
const crypto = require('crypto');

class A1CameraSocket {
  constructor(printerIp, accessCode, printerName) {
    this.printerIp = printerIp;
    this.accessCode = accessCode;
    this.printerName = printerName;
    this.socket = null;
    this.isConnected = false;
    this.clients = new Set();
    this.lastImageHash = null;
    this.reconnectTimer = null;
  }

  connect() {
    if (this.socket && !this.socket.destroyed) {
      return;
    }

    console.log(`📹 [A1] Connecting to ${this.printerName} at ${this.printerIp}:6000...`);

    this.socket = tls.connect(6000, this.printerIp, {
      rejectUnauthorized: false
    }, () => {
      console.log(`📹 [A1] TLS connection established to ${this.printerName}`);
      this.sendAuth();
    });

    let imageBuffer = Buffer.alloc(0);
    let expectingImage = false;

    this.socket.on('data', (data) => {
      const jpegStart = Buffer.from([0xFF, 0xD8, 0xFF]);
      const jpegEnd = Buffer.from([0xFF, 0xD9]);

      imageBuffer = Buffer.concat([imageBuffer, data]);

      const startIndex = imageBuffer.indexOf(jpegStart);
      if (startIndex !== -1 && !expectingImage) {
        expectingImage = true;
        imageBuffer = imageBuffer.slice(startIndex);
      }

      if (expectingImage) {
        const endIndex = imageBuffer.indexOf(jpegEnd);
        if (endIndex !== -1) {
          const completeImage = imageBuffer.slice(0, endIndex + 2);

          const imageHash = crypto.createHash('md5').update(completeImage).digest('hex');
          if (imageHash !== this.lastImageHash) {
            this.lastImageHash = imageHash;
            this.broadcastFrame(completeImage);
          }

          imageBuffer = imageBuffer.slice(endIndex + 2);
          expectingImage = false;
        }
      }

      if (imageBuffer.length > 1024 * 1024) {
        imageBuffer = Buffer.alloc(0);
        expectingImage = false;
      }
    });

    this.socket.on('error', (error) => {
      console.error(`📹 [A1] Socket error for ${this.printerName}:`, error.message);
      this.isConnected = false;
      this.scheduleReconnect();
    });

    this.socket.on('close', () => {
      console.log(`📹 [A1] Socket closed for ${this.printerName}`);
      this.isConnected = false;
      this.scheduleReconnect();
    });

    this.socket.setTimeout(30000);
    this.socket.on('timeout', () => {
      console.log(`📹 [A1] Socket timeout for ${this.printerName}`);
      this.socket?.destroy();
    });
  }

  sendAuth() {
    if (!this.socket || this.socket.destroyed) return;

    const authData = Buffer.alloc(80);
    let offset = 0;

    authData.writeUInt32LE(0x40, offset);
    offset += 4;
    authData.writeUInt32LE(0x3000, offset);
    offset += 4;
    authData.writeUInt32LE(0, offset);
    offset += 4;
    authData.writeUInt32LE(0, offset);
    offset += 4;

    const usernameBytes = Buffer.from('bblp', 'ascii');
    usernameBytes.copy(authData, offset);
    offset += 32;

    const accessCodeBytes = Buffer.from(this.accessCode, 'ascii');
    accessCodeBytes.copy(authData, offset);

    console.log(`📹 [A1] Sending auth to ${this.printerName}`);
    this.socket.write(authData);
    this.isConnected = true;
  }

  broadcastFrame(imageData) {
    this.clients.forEach(client => {
      if (!client.destroyed) {
        try {
          client.send(imageData);
        } catch (err) {
          console.error('Error broadcasting frame:', err);
        }
      }
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    if (this.clients.size > 0) {
      console.log(`📹 [A1] Scheduling reconnect for ${this.printerName} in 5s...`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (this.clients.size > 0) {
          this.connect();
        }
      }, 5000);
    }
  }

  addClient(client) {
    this.clients.add(client);
    console.log(`📹 [A1] Client connected to ${this.printerName}, total: ${this.clients.size}`);

    if (!this.isConnected && this.clients.size === 1) {
      this.connect();
    }

    client.on('close', () => {
      this.clients.delete(client);
      console.log(`📹 [A1] Client disconnected from ${this.printerName}, remaining: ${this.clients.size}`);

      if (this.clients.size === 0) {
        this.disconnect();
      }
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket && !this.socket.destroyed) {
      console.log(`📹 [A1] Disconnecting from ${this.printerName}`);
      this.socket.destroy();
    }

    this.isConnected = false;
    this.socket = null;
  }
}

class CameraService {
  constructor(printerService) {
    this.printerService = printerService;
    this.a1Sockets = new Map();
    this.rtspProxy = null;
  }

  initialize(app) {
    console.log('📹 Initializing Camera Service...');

    // Initialize rtsp-relay
    try {
      const rtspRelay = require('rtsp-relay')(app);
      this.rtspProxy = rtspRelay.proxy;
      console.log('📹 RTSP relay initialized');
    } catch (error) {
      console.error('📹 Failed to initialize RTSP relay:', error);
    }
  }

  getPrinterModel(printer) {
    // Determine if it's an A1 model based on model name or serial
    const model = printer.model?.toLowerCase() || '';
    const serial = printer.serialNo?.toLowerCase() || '';

    return (model.includes('a1') || serial.startsWith('039')) ? 'a1' : 'x1';
  }

  handleCameraStream(ws, printerId) {
    const printer = this.printerService.getPrinter(printerId);

    if (!printer) {
      console.warn(`📹 Printer not found: ${printerId}`);
      ws.close(1000, 'Printer not found');
      return;
    }

    if (!printer.ipAddress || !printer.accessCode) {
      console.warn(`📹 Missing IP or access code for printer: ${printerId}`);
      ws.close(1000, 'Printer missing IP address or access code');
      return;
    }

    const modelType = this.getPrinterModel(printer);

    if (modelType === 'a1') {
      console.log(`📹 [A1] Setting up TLS socket stream for ${printer.name}`);

      let a1Socket = this.a1Sockets.get(printerId);
      if (!a1Socket) {
        a1Socket = new A1CameraSocket(printer.ipAddress, printer.accessCode, printer.name);
        this.a1Sockets.set(printerId, a1Socket);
      }

      ws.destroyed = false;

      ws.on('close', () => {
        ws.destroyed = true;
      });

      a1Socket.addClient(ws);

    } else {
      // X1 Carbon and similar - use RTSP
      const cameraUrl = `rtsps://bblp:${printer.accessCode}@${printer.ipAddress}:322/streaming/live/1`;
      console.log(`📹 Starting RTSP stream for ${printer.name}: ${cameraUrl}`);

      if (this.rtspProxy) {
        const handler = this.rtspProxy({
          url: cameraUrl,
          verbose: false,
          transport: 'tcp'
        });

        handler(ws);
      } else {
        console.error('📹 RTSP proxy not available');
        ws.close(1011, 'RTSP streaming not available');
      }
    }
  }
}

module.exports = CameraService;
