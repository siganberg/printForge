const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SettingsService {
  constructor() {
    this.settings = {
      theme: 'light'
    };
    this.settingsFilePath = null;
  }

  initialize() {
    this.settingsFilePath = path.join(app.getPath('userData'), 'settings.json');
    this.loadSettings();
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        const data = fs.readFileSync(this.settingsFilePath, 'utf8');
        this.settings = { ...this.settings, ...JSON.parse(data) };
        console.log('Settings loaded from file');
      } else {
        console.log('No settings file found, using defaults');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  saveSettings() {
    try {
      fs.writeFileSync(this.settingsFilePath, JSON.stringify(this.settings, null, 2));
      console.log('Settings saved to file');
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
    return this.getSettings();
  }

  getSetting(key) {
    return this.settings[key];
  }

  setSetting(key, value) {
    this.settings[key] = value;
    this.saveSettings();
    return value;
  }
}

module.exports = SettingsService;