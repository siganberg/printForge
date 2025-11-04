const { promises: fs } = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { app } = require('electron');
const AdmZip = require('adm-zip');
const Queue = require('better-queue');
const { XMLParser } = require('fast-xml-parser');

const execAsync = promisify(exec);

class SlicingService {
  constructor(printerService = null, ftpService = null) {
    this.SLICE_TIMEOUT = 120000; // 2 minutes
    this.appDataPath = app.getPath('userData');
    this.uploadedPath = path.join(this.appDataPath, 'uploaded');
    this.slicedPath = path.join(this.appDataPath, 'sliced');
    this.profilesPath = path.join(process.cwd(), 'profiles');
    
    // Services for FTP uploading
    this.printerService = printerService;
    this.ftpService = ftpService;
    
    // Initialize queue for slicing tasks
    this.sliceQueue = new Queue(this.processSliceTask.bind(this), {
      concurrent: 5, // Process up to 5 slicing tasks concurrently
      retries: 3, // Retry failed tasks up to 3 times
      retryDelay: 5000, // Wait 5 seconds between retries
      maxTimeout: 300000 // 5 minute timeout per task
    });

    // Track active tasks and their callbacks
    this.activeTasks = new Map();
    
    this.ensureDirectories();
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.uploadedPath, { recursive: true });
      await fs.mkdir(this.slicedPath, { recursive: true });
      console.log('📁 Slicing directories initialized');
    } catch (error) {
      console.error('❌ Failed to create slicing directories:', error);
    }
  }

  async getMachineProfiles() {
    try {
      const machineProfilesPath = path.join(this.profilesPath, 'machine');
      const files = await fs.readdir(machineProfilesPath);
      
      // Remove .json extension from filenames
      const profiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
      
      return { profiles };
    } catch (error) {
      console.error('❌ Failed to load machine profiles:', error);
      throw new Error('Failed to load machine profiles');
    }
  }

  async getProcessProfiles() {
    try {
      const processProfilesPath = path.join(this.profilesPath, 'process');
      const files = await fs.readdir(processProfilesPath);
      
      // Remove .json extension from filenames
      const profiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
      
      return { profiles };
    } catch (error) {
      console.error('❌ Failed to load process profiles:', error);
      throw new Error('Failed to load process profiles');
    }
  }

  async uploadFile(fileName, fileData) {
    try {
      const filePath = path.join(this.uploadedPath, fileName);
      
      // Convert base64 to buffer and write file
      const buffer = Buffer.from(fileData, 'base64');
      await fs.writeFile(filePath, buffer);
      
      return { success: true, filePath };
    } catch (error) {
      console.error('❌ Failed to upload file:', error);
      throw new Error('Failed to upload file');
    }
  }

  // Queue a slice task for a specific printer model
  queueSliceTask(fileName, printerModel, machineProfile, processProfile) {
    return new Promise((resolve, reject) => {
      const taskId = `${fileName}-${printerModel}-${Date.now()}`;
      const taskData = {
        taskId,
        fileName,
        printerModel,
        machineProfile,
        processProfile
      };


      // Store the promise callbacks
      this.activeTasks.set(taskId, { resolve, reject });

      // Add task to queue
      this.sliceQueue.push(taskData, (error, result) => {
        const callbacks = this.activeTasks.get(taskId);
        if (callbacks) {
          this.activeTasks.delete(taskId);
          if (error) {
            console.error(`❌ Slice task failed: ${taskId}`, error);
            callbacks.reject(error);
          } else {
            callbacks.resolve(result);
          }
        }
      });
    });
  }

  // Queue multiple slice tasks for different printer models
  queueMultipleSliceTasks(fileName, modelsWithProfiles) {
    const promises = modelsWithProfiles.map(({ printerModel, machineProfile, processProfile }) => {
      return this.queueSliceTask(fileName, printerModel, machineProfile, processProfile);
    });

    return Promise.all(promises);
  }

  // Process a single slice task (called by the queue)
  async processSliceTask(taskData, cb) {
    try {
      const result = await this.startSlice(taskData.fileName, taskData.printerModel, taskData.machineProfile, taskData.processProfile);
      cb(null, result);
    } catch (error) {
      cb(error);
    }
  }

  // Original slice method (now used internally by the queue)
  async startSlice(fileName, printerModel, machineProfile, processProfile) {
    try {
      const inputPath = path.join(this.uploadedPath, fileName);
      const fileNameWithoutExt = path.basename(fileName, '.3mf');
      
      // Create output directory structure: sliced/printermodel/filename/
      const printerModelFolder = printerModel.toLowerCase().replace(/\s+/g, '');
      const outputDir = path.join(this.slicedPath, printerModelFolder, fileNameWithoutExt);
      await fs.mkdir(outputDir, { recursive: true });
      
      const outputPath = path.join(outputDir, fileName);
      
      // Remove existing output file if it exists
      try {
        await fs.access(outputPath);
        await fs.unlink(outputPath);
      } catch {
        // File doesn't exist, that's fine
      }

      // Verify input file exists
      try {
        await fs.access(inputPath);
      } catch {
        throw new Error(`Input file not found: ${fileName}`);
      }

      // Build profile paths
      const machineProfilePath = path.join(this.profilesPath, 'machine', `${machineProfile}.json`);
      const processProfilePath = path.join(this.profilesPath, 'process', `${processProfile}.json`);

      // Verify profiles exist
      try {
        await fs.access(machineProfilePath);
      } catch {
        throw new Error(`Machine profile not found: ${machineProfile}`);
      }

      try {
        await fs.access(processProfilePath);
      } catch {
        throw new Error(`Process profile not found: ${processProfile}`);
      }

      // Check if BambuStudio exists
      let bambuStudioPath = '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio';
      try {
        await fs.access(bambuStudioPath);
      } catch {
        // Try alternative path
        const altPath = '/Applications/Bambu Studio.app/Contents/MacOS/BambuStudio';
        try {
          await fs.access(altPath);
          bambuStudioPath = altPath;
        } catch {
          throw new Error('BambuStudio not found. Please install BambuStudio.');
        }
      }

      // Build slicing command (original working syntax from layer-fleet)
      const command = [
        '/Applications/BambuStudio.app/Contents/MacOS/BambuStudio',
        '--slice', '0',
        '--debug', '2',
        '--load-settings', `"${machineProfilePath}"`,
        '--load-settings', `"${processProfilePath}"`,
        '--export-3mf', `"${outputPath}"`,
        `"${inputPath}"`
      ].join(' ');

      console.log(`Starting slice: ${fileName}`);

      // Execute slicing command
      const result = await execAsync(command, {
        timeout: this.SLICE_TIMEOUT,
        cwd: process.cwd()
      });

      if (result.stderr && result.stderr.trim()) {
        console.warn(`BambuStudio stderr:`, result.stderr);
      }

      // Verify output file was created
      await fs.access(outputPath);

      console.log(`Slice completed: ${fileName}`);
      
      // Extract the .3mf file (it's a zip container)
      await this.extractSlicedFile(outputPath, outputDir);
      
      // Queue FTP uploads to all printers with this model (don't wait for completion)
      this.queueFtpUploadsForModel(printerModel, outputPath, fileName).catch(error => {
        console.error(`❌ Failed to queue FTP uploads for ${printerModel}:`, error);
      });
      
      // Note: Input file cleanup will be handled after all slices are complete
      
      return { 
        success: true, 
        outputPath,
        fileName: fileNameWithoutExt,
        printerModel
      };
      
    } catch (error) {
      console.error('❌ Slice failed:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        stdout: error.stdout,
        stderr: error.stderr,
        cmd: error.cmd
      });
      
      // Move failed file to failed directory
      try {
        await this.moveToFailedDirectory(fileName);
      } catch (moveError) {
        console.error('❌ Failed to move file to failed directory:', moveError);
      }
      
      // Provide more specific error messages
      let errorMessage = 'Slicing failed';
      if (error.message.includes('BambuStudio not found')) {
        errorMessage = 'BambuStudio application not found. Please install BambuStudio.';
      } else if (error.stderr && error.stderr.includes('No such file')) {
        errorMessage = 'Input file or profile not found.';
      } else if (error.code === 'ENOENT') {
        errorMessage = 'BambuStudio executable not found.';
      } else if (error.stderr) {
        errorMessage = `BambuStudio error: ${error.stderr}`;
      } else {
        errorMessage = `Slicing failed: ${error.message}`;
      }
      
      throw new Error(errorMessage);
    }
  }

  async moveToFailedDirectory(fileName) {
    const failedDir = path.join(this.appDataPath, 'failed-slice');
    await fs.mkdir(failedDir, { recursive: true });
    
    const sourcePath = path.join(this.uploadedPath, fileName);
    const failedPath = path.join(failedDir, fileName);
    
    try {
      await fs.access(sourcePath);
      
      // Remove existing failed file if it exists
      try {
        await fs.access(failedPath);
        await fs.unlink(failedPath);
      } catch {
        // File doesn't exist, that's fine
      }
      
      await fs.rename(sourcePath, failedPath);
    } catch (error) {
      console.warn(`⚠️ Failed to move file to failed directory: ${error.message}`);
    }
  }

  getUploadedPath() {
    return this.uploadedPath;
  }

  getSlicedPath() {
    return this.slicedPath;
  }

  getProfilesPath() {
    return this.profilesPath;
  }

  async extractSlicedFile(filePath, outputDir) {
    try {
      console.log(`📦 Extracting sliced file: ${filePath}`);
      
      // Create extraction directory
      const extractDir = path.join(outputDir, 'extracted');
      await fs.mkdir(extractDir, { recursive: true });
      
      // Extract the .3mf file using AdmZip
      const zip = new AdmZip(filePath);
      zip.extractAllTo(extractDir, true);
      
      
      // List extracted files for verification
      const extractedFiles = await fs.readdir(extractDir);
      
      return { success: true, extractPath: extractDir, files: extractedFiles };
    } catch (error) {
      console.error('❌ Failed to extract sliced file:', error);
      throw new Error(`Failed to extract sliced file: ${error.message}`);
    }
  }

  // Queue FTP uploads for all printers with the specified model
  async queueFtpUploadsForModel(printerModel, slicedFilePath, fileName) {
    if (!this.printerService || !this.ftpService) {
      console.warn('⚠️ PrinterService or FtpService not available, skipping FTP uploads');
      return;
    }

    try {
      // Get all printers with this model
      const allPrinters = this.printerService.getAllPrinters();
      const modelPrinters = allPrinters.filter(printer => {
        const normalizedPrinterModel = printer.model.toLowerCase().replace(/\s+/g, '');
        return normalizedPrinterModel === printerModel;
      });

      if (modelPrinters.length === 0) {
        console.log(`📤 No printers found for model: ${printerModel}`);
        return;
      }

      console.log(`📤 Queuing FTP uploads for ${modelPrinters.length} printers with model: ${printerModel}`);

      // Queue FTP uploads for all printers with this model
      const uploadPromises = modelPrinters.map(printer => {
        return this.ftpService.queueFtpUpload(printer, slicedFilePath, fileName);
      });

      // Don't wait for FTP uploads to complete, just queue them
      Promise.allSettled(uploadPromises).then(() => {
      });
      
      console.log(`FTP uploads queued for model ${printerModel}`);

    } catch (error) {
      console.error(`❌ Failed to queue FTP uploads for model ${printerModel}:`, error);
      // Don't throw error here as this shouldn't fail the slicing process
    }
  }

  // Get queue statistics
  getQueueStats() {
    return {
      length: this.sliceQueue.length,
      running: this.sliceQueue.running,
      succeeded: this.sliceQueue.succeeded,
      failed: this.sliceQueue.failed,
      activeTasks: this.activeTasks.size
    };
  }

  // Destroy the queue (for cleanup)
  destroy() {
    if (this.sliceQueue) {
      this.sliceQueue.destroy();
    }
    this.activeTasks.clear();
  }

  async parsePlateMetadata(extractedDir) {
    try {
      const metadataPath = path.join(extractedDir, 'Metadata');
      const platesMetadata = {};

      // Initialize XML parser with options
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        textNodeName: "#text",
        parseTagValue: true,
        parseAttributeValue: true,
        trimValues: true
      });

      // Try to read model_settings.config (XML format)
      const modelSettingsPath = path.join(metadataPath, 'model_settings.config');
      try {
        const settingsContent = await fs.readFile(modelSettingsPath, 'utf-8');
        const settings = parser.parse(settingsContent);

        console.log(`📋 Raw parsed XML structure:`, JSON.stringify(settings, null, 2));

        // Navigate to the config root
        const config = settings.config || settings;

        // Helper function to ensure array format
        const ensureArray = (value) => {
          if (!value) return [];
          if (Array.isArray(value)) return value;
          return [value];
        };

        // Extract plate names
        const plateNames = ensureArray(config.plate_name_list?.item || []);
        const filamentTypes = ensureArray(config.filament_list?.item || []);
        const filamentColors = ensureArray(config.filament_color_list?.item || []);

        console.log(`📋 Extracted plate data:`, {
          plateNames,
          filamentTypes,
          filamentColors
        });

        // Extract plate-specific metadata
        plateNames.forEach((plateName, index) => {
          const plateIndex = index + 1; // Plates are 1-indexed

          platesMetadata[plateIndex] = {
            filamentType: filamentTypes[index] || null,
            filamentColor: filamentColors[index] || null
          };
        });

        console.log(`📋 Parsed plate metadata:`, JSON.stringify(platesMetadata, null, 2));
      } catch (error) {
        console.warn(`⚠️ Could not read model_settings.config:`, error.message);
      }

      // Try to read slice_info.config for additional metadata (also XML)
      const sliceInfoPath = path.join(metadataPath, 'slice_info.config');
      try {
        const sliceContent = await fs.readFile(sliceInfoPath, 'utf-8');
        const sliceInfo = parser.parse(sliceContent);

        console.log(`📋 Raw slice_info XML structure:`, JSON.stringify(sliceInfo, null, 2));

        const config = sliceInfo.config || sliceInfo;
        const ensureArray = (value) => {
          if (!value) return [];
          if (Array.isArray(value)) return value;
          return [value];
        };

        // The correct path is config.plate (not config.plate_list.item)
        const plateList = ensureArray(config.plate || []);

        console.log(`📋 Found ${plateList.length} plates in slice_info`);

        // Extract filament and plate metadata
        plateList.forEach((plate, index) => {
          // Get plate index from metadata
          let plateIndex = index + 1; // Default to 1-based index

          // Try to get the actual index from metadata
          if (plate.metadata && Array.isArray(plate.metadata)) {
            const indexMetadata = plate.metadata.find(m => m['@_key'] === 'index');
            if (indexMetadata && indexMetadata['@_value']) {
              plateIndex = parseInt(indexMetadata['@_value']);
            }
          }

          if (!platesMetadata[plateIndex]) {
            platesMetadata[plateIndex] = {
              filamentType: null,
              filamentColor: null
            };
          }

          // Extract filament info from nested <filament> element
          if (plate.filament) {
            const filament = Array.isArray(plate.filament) ? plate.filament[0] : plate.filament;

            // Filament attributes are prefixed with @_ by the XML parser
            if (filament['@_type']) {
              platesMetadata[plateIndex].filamentType = filament['@_type'];
            }
            if (filament['@_color']) {
              platesMetadata[plateIndex].filamentColor = filament['@_color'];
            }

            console.log(`🎨 Plate ${plateIndex} filament from XML:`, {
              type: filament['@_type'],
              color: filament['@_color']
            });
          }
        });

        console.log(`📋 Final plate metadata after slice_info:`, JSON.stringify(platesMetadata, null, 2));
      } catch (error) {
        console.warn(`⚠️ Could not read slice_info.config:`, error.message);
      }

      // Fallback: Read plate_{number}.json files for filament info
      try {
        const files = await fs.readdir(metadataPath);
        const plateJsonFiles = files.filter(file => file.match(/^plate_\d+\.json$/i));

        for (const plateFile of plateJsonFiles) {
          const plateNumber = parseInt(plateFile.match(/plate_(\d+)\.json/i)[1]);
          const plateJsonPath = path.join(metadataPath, plateFile);

          try {
            const plateJsonContent = await fs.readFile(plateJsonPath, 'utf-8');
            const plateJson = JSON.parse(plateJsonContent);

            if (!platesMetadata[plateNumber]) {
              platesMetadata[plateNumber] = {
                filamentType: null,
                filamentColor: null
              };
            }

            // If we don't already have filament info, get it from JSON
            if (!platesMetadata[plateNumber].filamentColor && plateJson.filament_colors && plateJson.filament_colors[0]) {
              platesMetadata[plateNumber].filamentColor = plateJson.filament_colors[0];
              console.log(`🎨 Plate ${plateNumber} color from JSON: ${plateJson.filament_colors[0]}`);
            }

            // Note: filament type is not in plate JSON, only in slice_info.config XML
          } catch (readError) {
            console.warn(`⚠️ Could not read ${plateFile}:`, readError.message);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Could not scan for plate JSON files:`, error.message);
      }

      console.log(`📋 Final plate metadata (with JSON fallback):`, JSON.stringify(platesMetadata, null, 2));
      return platesMetadata;
    } catch (error) {
      console.error('❌ Failed to parse plate metadata:', error);
      return {};
    }
  }

  async getSlicedFilePlates(printerModel, fileName) {
    try {
      // Normalize printer model (e.g., "Bambu X1C" -> "bambux1c")
      const normalizedModel = printerModel.toLowerCase().replace(/\s+/g, '');
      
      // Remove .3mf extension from filename
      const fileNameWithoutExt = path.basename(fileName, '.3mf');
      
      // Build path: sliced/{printerModel}/{filename_without_extension}/extracted/Metadata/
      const metadataPath = path.join(this.slicedPath, normalizedModel, fileNameWithoutExt, 'extracted', 'Metadata');
      
      
      // Check if the metadata directory exists
      try {
        await fs.access(metadataPath);
      } catch {
        // Return empty plates array to trigger download and extraction
        return {
          plates: [],
          source: 'not-found'
        };
      }
      
      // Scan for plate_*.png files
      const files = await fs.readdir(metadataPath);
      const plateFiles = files.filter(file => file.match(/^plate_\d+\.png$/i));
      
      console.log(`🖼️ Found ${plateFiles.length} plate images: ${plateFiles.join(', ')}`);
      
      if (plateFiles.length === 0) {
        return {
          plates: [{
            preview: null,
            plateIndex: 0,
            filamentType: null,
            filamentColor: null
          }],
          source: 'no_images'
        };
      }
      
      // Sort plate files numerically
      plateFiles.sort((a, b) => {
        const aNum = parseInt(a.match(/plate_(\d+)\.png/i)[1]);
        const bNum = parseInt(b.match(/plate_(\d+)\.png/i)[1]);
        return aNum - bNum;
      });
      
      // Parse plate metadata from model_settings.config
      const extractedDir = path.join(this.slicedPath, normalizedModel, fileNameWithoutExt, 'extracted');
      const platesMetadata = await this.parsePlateMetadata(extractedDir);

      // Read plate images and convert to base64
      const plates = await Promise.all(plateFiles.map(async (plateFile, index) => {
        const platePath = path.join(metadataPath, plateFile);
        const plateNumber = parseInt(plateFile.match(/plate_(\d+)\.png/i)[1]);
        const plateInfo = platesMetadata[plateNumber] || {};

        try {
          const imageBuffer = await fs.readFile(platePath);
          const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

          return {
            preview: base64Image,
            plateIndex: plateNumber,
            filamentType: plateInfo.filamentType || null,
            filamentColor: plateInfo.filamentColor || null
          };
        } catch (error) {
          console.error(`❌ Failed to read plate image ${plateFile}:`, error);
          return {
            preview: null,
            plateIndex: plateNumber,
            filamentType: null,
            filamentColor: null
          };
        }
      }));
      
      
      return {
        plates,
        source: 'sliced_file',
        metadataPath
      };
      
    } catch (error) {
      console.error('❌ Failed to get sliced file plates:', error);
      throw new Error(`Failed to get sliced file plates: ${error.message}`);
    }
  }

  async extractFile(localFilePath, printerModel) {
    try {
      const fileName = path.basename(localFilePath);
      const fileNameWithoutExt = path.basename(fileName, '.3mf');
      const normalizedModel = printerModel.toLowerCase().replace(/\s+/g, '');

      console.log(`📦 Extracting file: ${fileName} for model: ${printerModel}`);

      // Create extraction directory
      const extractPath = path.join(
        this.slicedPath,
        normalizedModel,
        fileNameWithoutExt,
        'extracted'
      );

      await fs.mkdir(extractPath, { recursive: true });

      // Extract the 3MF file
      const zip = new AdmZip(localFilePath);
      zip.extractAllTo(extractPath, true);

      return { success: true, extractPath };

    } catch (error) {
      console.error(`❌ Error extracting file:`, error);
      throw error;
    }
  }

  async cleanupInputFile(fileName) {
    try {
      const inputPath = path.join(this.uploadedPath, fileName);
      await fs.unlink(inputPath);
      return { success: true };
    } catch (error) {
      console.warn(`⚠️ Failed to cleanup input file: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

module.exports = SlicingService;