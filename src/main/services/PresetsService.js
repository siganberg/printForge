const { promises: fs } = require('fs');
const path = require('path');
const { app } = require('electron');

class PresetsService {
  constructor() {
    this.appDataPath = app.getPath('userData');
    this.presetsFilePath = path.join(this.appDataPath, 'slice-presets.json');
    this.presets = {};
    this.initialize();
  }

  async initialize() {
    try {
      await this.loadPresets();
      console.log('📋 Presets service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize presets service:', error);
    }
  }

  async loadPresets() {
    try {
      const data = await fs.readFile(this.presetsFilePath, 'utf8');
      this.presets = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, start with empty presets
        this.presets = {};
        await this.savePresets();
      } else {
        console.error('❌ Error loading presets:', error);
        this.presets = {};
      }
    }
  }

  async savePresets() {
    try {
      await fs.writeFile(
        this.presetsFilePath,
        JSON.stringify(this.presets, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('❌ Error saving presets:', error);
      throw error;
    }
  }

  getPresets() {
    return { presets: this.presets };
  }

  async savePreset(printerModel, machineProfile, processProfile) {
    try {
      this.presets[printerModel] = {
        printerModel,
        machineProfile,
        processProfile,
        lastUpdated: new Date().toISOString()
      };

      await this.savePresets();
      console.log(`📋 Saved preset for printer model ${printerModel}: ${machineProfile} / ${processProfile}`);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to save preset:', error);
      throw new Error('Failed to save preset');
    }
  }

  getPresetForPrinterModel(printerModel) {
    return this.presets[printerModel] || null;
  }

  async deletePreset(printerModel) {
    try {
      if (this.presets[printerModel]) {
        delete this.presets[printerModel];
        await this.savePresets();
        console.log(`🗑️ Deleted preset for printer model ${printerModel}`);
        return { success: true };
      }
      return { success: false, message: 'Preset not found' };
    } catch (error) {
      console.error('❌ Failed to delete preset:', error);
      throw new Error('Failed to delete preset');
    }
  }
}

module.exports = PresetsService;