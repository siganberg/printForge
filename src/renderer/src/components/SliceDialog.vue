<template>
  <div class="modal-overlay" v-if="isVisible">
    <div class="modal-container slice-dialog">
      <div class="modal-header">
        <h2>Slice 3MF File</h2>
        <button class="close-btn" @click="close">
          <span>✕</span>
        </button>
      </div>
      
      <div class="modal-body">
        <div class="two-column-layout">
          <!-- Left Column: File Upload -->
          <div class="left-column">
            <div class="upload-section">
              <div class="upload-area" 
                   :class="{ 'drag-over': isDragOver, 'has-file': selectedFile }"
                   @dragover.prevent="isDragOver = true"
                   @dragleave.prevent="isDragOver = false"
                   @drop.prevent="handleFileDrop"
                   @click="triggerFileInput">
                <div class="upload-icon">📁</div>
                <p class="upload-text">
                  {{ selectedFile ? selectedFile.name : 'Drop your 3MF file here or click to browse' }}
                </p>
                <p class="upload-hint">{{ selectedFile ? formatFileSize(selectedFile.size) : 'Only .3mf files are supported' }}</p>
              </div>
              <input 
                ref="fileInput" 
                type="file" 
                accept=".3mf"
                @change="handleFileSelect"
                style="display: none"
              />
            </div>

            <!-- Progress and success states in left column -->
            <div v-if="slicing" class="slicing-progress">
              <div class="spinner"></div>
              <p>Slicing file... This may take a few minutes.</p>
            </div>

            <div v-if="sliceCompleted" class="success-state">
              <div class="success-icon">✅</div>
              <p>File sliced successfully!</p>
              <p class="success-details">Output saved to: {{ sliceOutputPath }}</p>
            </div>
          </div>

          <!-- Right Column: Printer Models -->
          <div class="right-column">
            <div class="printer-models-section">
              <h3>Select Profiles for Each Printer Model</h3>
              
              <!-- Loading indicator -->
              <div v-if="loadingProfiles" class="loading-profiles">
                <div class="spinner"></div>
                <p>Loading profiles...</p>
              </div>
              
              <div v-else class="printer-models-grid">
                <div 
                  v-for="model in printerModels" 
                  :key="model.value"
                  class="printer-model-card"
                  :class="{ disabled: slicing }"
                >
                  <div class="model-header">
                    <div class="model-icon">🖨️</div>
                    <div class="model-info">
                      <h4>{{ model.label }}</h4>
                      <p class="model-count">{{ getModelCount(model.value) }} printer(s)</p>
                    </div>
                  </div>
                  
                  <div class="model-profiles">
                    <div class="profile-group">
                      <label :for="`machine-${model.value}`">Machine Profile:</label>
                      <select 
                        :id="`machine-${model.value}`"
                        v-model="modelSettings[model.value].machineProfile"
                        :disabled="slicing"
                        @change="savePresetForModel(model.value)"
                      >
                        <option value="">Select machine profile...</option>
                        <option 
                          v-for="profile in machineProfiles" 
                          :key="profile" 
                          :value="profile"
                        >
                          {{ profile }}
                        </option>
                      </select>
                    </div>
                    
                    <div class="profile-group">
                      <label :for="`process-${model.value}`">Process Profile:</label>
                      <select 
                        :id="`process-${model.value}`"
                        v-model="modelSettings[model.value].processProfile"
                        :disabled="slicing"
                        @change="savePresetForModel(model.value)"
                      >
                        <option value="">Select process profile...</option>
                        <option 
                          v-for="profile in processProfiles" 
                          :key="profile" 
                          :value="profile"
                        >
                          {{ profile }}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="uploading" class="upload-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: uploadProgress + '%' }"></div>
          </div>
          <p>Uploading file... {{ uploadProgress }}%</p>
        </div>


        <div v-if="error" class="error-state">
          <p class="error-message">{{ error }}</p>
          <button class="retry-btn" @click="clearError">Try Again</button>
        </div>

      </div>
      
      <div class="modal-footer" style="justify-content: center;">
        <div class="footer-buttons" style="display: flex; gap: 1rem;">
          <button class="cancel-btn" @click="close">
            {{ sliceCompleted ? 'Close' : 'Cancel' }}
          </button>
          <button 
            class="slice-btn-footer" 
            :disabled="!canStartSlice"
            @click="startSlice"
            v-if="!sliceCompleted"
          >
            {{ slicing ? 'Slicing...' : 'Start Slice' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SliceDialog',
  props: {
    isVisible: {
      type: Boolean,
      default: false
    },
    printers: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      selectedFile: null,
      isDragOver: false,
      uploading: false,
      uploadProgress: 0,
      slicing: false,
      sliceCompleted: false,
      sliceOutputPath: '',
      error: null,
      machineProfiles: [],
      processProfiles: [],
      printerModelPresets: {}, // Store presets per printer model
      modelSettings: {}, // Current settings for each model
      loadingProfiles: false
    }
  },
  computed: {
    canStartSlice() {
      return this.selectedFile && 
             this.hasAtLeastOneValidProfile &&
             !this.uploading && 
             !this.slicing
    },
    hasAtLeastOneValidProfile() {
      return this.printerModels.some(model => {
        const settings = this.modelSettings[model.value]
        return settings && settings.machineProfile && settings.processProfile
      })
    },
    printerModels() {
      // Extract unique printer models from the printers array
      const uniqueModels = new Set()
      const models = []
      
      this.printers.forEach(printer => {
        if (printer.model && !uniqueModels.has(printer.model)) {
          uniqueModels.add(printer.model)
          models.push({
            value: printer.model.toLowerCase().replace(/\s+/g, ''),
            label: printer.model
          })
        }
      })
      
      return models.sort((a, b) => a.label.localeCompare(b.label))
    }
  },
  watch: {
    async isVisible(newVal) {
      if (newVal) {
        this.resetDialog()
        this.loadingProfiles = true
        try {
          await this.loadProfiles()
          await this.loadPresets()
          this.initializeModelSettings()
        } catch (error) {
          console.error('Failed to load profiles:', error)
          this.error = 'Failed to load slicing profiles'
        } finally {
          this.loadingProfiles = false
        }
      }
    },
    printerModels: {
      handler() {
        this.initializeModelSettings()
      },
      immediate: true
    }
  },
  methods: {
    async loadProfiles() {
      try {
        const app = this.$parent.$parent || this.$root
        if (app.sendMessage) {
          // Get machine profiles
          app.sendMessage('get-machine-profiles')
          const machineResponse = await this.waitForWebSocketResponse('machine-profiles')
          this.machineProfiles = machineResponse.profiles || []

          // Get process profiles  
          app.sendMessage('get-process-profiles')
          const processResponse = await this.waitForWebSocketResponse('process-profiles')
          this.processProfiles = processResponse.profiles || []
        }
      } catch (error) {
        console.error('Failed to load profiles:', error)
        this.error = 'Failed to load slicing profiles'
      }
    },

    triggerFileInput() {
      this.$refs.fileInput.click()
    },

    handleFileSelect(event) {
      const files = event.target.files
      if (files.length > 0) {
        this.selectFile(files[0])
      }
    },

    handleFileDrop(event) {
      this.isDragOver = false
      const files = event.dataTransfer.files
      if (files.length > 0) {
        this.selectFile(files[0])
      }
    },

    selectFile(file) {
      if (!file.name.toLowerCase().endsWith('.3mf')) {
        this.error = 'Only .3mf files are supported'
        return
      }
      
      this.selectedFile = file
      this.error = null
    },

    removeFile() {
      this.selectedFile = null
      this.selectedMachineProfile = ''
      this.selectedProcessProfile = ''
      this.$refs.fileInput.value = ''
    },

    async startSlice() {
      if (!this.canStartSlice) return

      try {
        // First upload the file
        await this.uploadFile()
        
        // Then start slicing
        await this.sliceFile()
        
      } catch (error) {
        console.error('Slice process failed:', error)
        this.error = error.message || 'Failed to slice file'
        this.slicing = false
        this.uploading = false
      }
    },

    async uploadFile() {
      this.uploading = true
      this.uploadProgress = 0
      
      const formData = new FormData()
      formData.append('file', this.selectedFile)
      
      try {
        const app = this.$parent.$parent || this.$root
        if (app.sendMessage) {
          // Send upload request via WebSocket
          app.sendMessage('upload-slice-file', {
            fileName: this.selectedFile.name,
            fileSize: this.selectedFile.size,
            fileData: await this.fileToBase64(this.selectedFile)
          })
          
          // Wait for upload completion
          await this.waitForWebSocketResponse('file-uploaded')
          this.uploadProgress = 100
        } else {
          throw new Error('WebSocket connection not available')
        }
      } finally {
        this.uploading = false
      }
    },

    async sliceFile() {
      this.slicing = true
      
      try {
        const app = this.$parent.$parent || this.$root
        if (app.sendMessage) {
          // Get all models with valid profiles
          const modelsToSlice = this.printerModels.filter(model => {
            const settings = this.modelSettings[model.value]
            return settings && settings.machineProfile && settings.processProfile
          })

          if (modelsToSlice.length === 0) {
            throw new Error('No printer models have complete profiles selected')
          }

          // Slice for each model
          const slicePromises = modelsToSlice.map(async (model) => {
            const settings = this.modelSettings[model.value]
            
            // Send slice request for this model
            app.sendMessage('start-slice', {
              fileName: this.selectedFile.name,
              printerModel: model.value,
              machineProfile: settings.machineProfile,
              processProfile: settings.processProfile
            })
            
            // Wait for this slice to complete
            return this.waitForWebSocketResponse('slice-completed')
          })

          // Wait for all slices to complete
          const responses = await Promise.all(slicePromises)
          
          // Now cleanup the input file since all slices are done
          try {
            app.sendMessage('cleanup-input-file', {
              fileName: this.selectedFile.name
            })
            await this.waitForWebSocketResponse('file-cleaned')
            console.log('✅ Input file cleaned up after all slices completed')
          } catch (cleanupError) {
            console.warn('⚠️ Failed to cleanup input file:', cleanupError)
            // Don't fail the whole process if cleanup fails
          }
          
          this.sliceOutputPath = `Sliced for ${modelsToSlice.length} printer model(s)`
          this.sliceCompleted = true
          
          this.$emit('slice-started', {
            fileName: this.selectedFile.name,
            modelCount: modelsToSlice.length,
            models: modelsToSlice.map(m => m.label)
          })
        } else {
          throw new Error('WebSocket connection not available')
        }
      } catch (error) {
        console.error('Slice process failed:', error)
        this.error = error.message || 'Failed to slice file'
      } finally {
        this.slicing = false
      }
    },

    async fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onload = () => {
          // Remove the data:application/octet-stream;base64, prefix
          const base64 = reader.result.split(',')[1]
          resolve(base64)
        }
        reader.onerror = error => reject(error)
      })
    },

    waitForWebSocketResponse(expectedType) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket response timeout'))
        }, 120000) // 2 minute timeout for slice operations
        
        const app = this.$parent.$parent || this.$root
        const originalHandler = app.handleMessage
        
        app.handleMessage = (message) => {
          // Call original handler first
          if (originalHandler) {
            originalHandler.call(app, message)
          }
          
          // Check if this is our expected response
          if (message.type === expectedType) {
            clearTimeout(timeout)
            app.handleMessage = originalHandler // Restore original handler
            resolve(message.data)
          } else if (message.type === 'error') {
            clearTimeout(timeout)
            app.handleMessage = originalHandler // Restore original handler
            reject(new Error(message.data.message || 'Server error'))
          }
        }
      })
    },

    clearError() {
      this.error = null
    },

    async loadPresets() {
      try {
        const app = this.$parent.$parent || this.$root
        if (app.sendMessage) {
          app.sendMessage('get-slice-presets')
          const response = await this.waitForWebSocketResponse('slice-presets')
          this.printerModelPresets = response.presets || {}
        }
      } catch (error) {
        console.error('Failed to load presets:', error)
        // Don't show error for presets, just use defaults
      }
    },

    initializeModelSettings() {
      // Create a new object to ensure reactivity
      const newModelSettings = { ...this.modelSettings }
      
      this.printerModels.forEach(model => {
        if (!newModelSettings[model.value]) {
          newModelSettings[model.value] = {
            machineProfile: '',
            processProfile: ''
          }
        }
        
        // Load presets for this model
        if (this.printerModelPresets[model.value]) {
          const preset = this.printerModelPresets[model.value]
          newModelSettings[model.value].machineProfile = preset.machineProfile || ''
          newModelSettings[model.value].processProfile = preset.processProfile || ''
        }
      })
      
      // Replace the entire object to maintain reactivity
      this.modelSettings = newModelSettings
    },

    getModelCount(modelValue) {
      return this.printers.filter(printer => 
        printer.model && printer.model.toLowerCase().replace(/\s+/g, '') === modelValue
      ).length
    },

    async savePresetForModel(modelValue) {
      const settings = this.modelSettings[modelValue]
      if (!settings || (!settings.machineProfile && !settings.processProfile)) {
        return
      }

      try {
        const preset = {
          printerModel: modelValue,
          machineProfile: settings.machineProfile,
          processProfile: settings.processProfile
        }

        // Save locally
        this.printerModelPresets[modelValue] = preset

        // Save to backend
        const app = this.$parent.$parent || this.$root
        if (app.sendMessage) {
          app.sendMessage('save-slice-preset', preset)
        }
      } catch (error) {
        console.error('Failed to save preset:', error)
      }
    },

    close() {
      this.$emit('close')
    },

    resetDialog() {
      this.selectedFile = null
      this.isDragOver = false
      this.uploading = false
      this.uploadProgress = 0
      this.slicing = false
      this.sliceCompleted = false
      this.sliceOutputPath = ''
      this.error = null
      if (this.$refs.fileInput) {
        this.$refs.fileInput.value = ''
      }
    },

    formatFileSize(bytes) {
      if (!bytes) return '0 B'
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(1024))
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
    }
  }
}
</script>

<style scoped>
.slice-dialog {
  width: 90vw;
  max-width: 900px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.two-column-layout {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 2rem;
  height: 100%;
}

.left-column {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.right-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.upload-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.upload-area {
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  padding: 2rem 1.5rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--card-bg);
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.upload-area:hover,
.upload-area.drag-over {
  border-color: var(--primary-color);
  background-color: var(--hover-bg);
}

.upload-area.has-file {
  padding: 1rem;
  background-color: var(--hover-bg);
  border-style: solid;
}

.upload-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.upload-text {
  font-size: 1.1rem;
  color: var(--text-color);
  margin: 0 0 0.5rem 0;
}

.upload-hint {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0;
}

.file-preview {
  margin: 1rem 0;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  margin-bottom: 1rem;
}

.file-icon {
  font-size: 2rem;
}

.file-details {
  flex: 1;
}

.file-name {
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 0.25rem;
}

.file-size {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.remove-file-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  color: var(--text-muted);
  transition: all 0.2s;
}

.remove-file-btn:hover {
  background-color: var(--hover-bg);
  color: var(--error-color);
}

.slice-options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.option-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.option-group label {
  font-weight: 500;
  color: var(--text-color);
}

.option-group select {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--button-bg);
  color: var(--text-color);
  font-size: 0.9rem;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.option-group select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.option-group select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.upload-progress,
.slicing-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
}

.slicing-note {
  font-size: 0.875rem;
  color: var(--text-muted);
  font-style: italic;
  margin: 0;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background-color: var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: var(--primary-color);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid var(--border-color);
  border-top: 3px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-state,
.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
}

.error-message {
  color: var(--error-color);
  margin: 0;
}

.success-icon {
  font-size: 3rem;
}

.success-details {
  font-size: 0.9rem;
  color: var(--text-muted);
  margin: 0;
}

.retry-btn {
  background-color: var(--button-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color);
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.retry-btn:hover {
  background-color: var(--hover-bg);
}

.printer-models-section {
  margin: 1rem 0;
}

.printer-models-section h3 {
  margin: 0 0 1rem 0;
  color: var(--text-color);
  font-size: 1.1rem;
}

.loading-profiles {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
  color: var(--text-muted);
}

.printer-models-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.printer-model-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  background-color: var(--card-bg);
  transition: all 0.2s;
}

.printer-model-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.printer-model-card.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.model-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-color);
}

.model-icon {
  font-size: 1.5rem;
}

.model-info h4 {
  margin: 0;
  color: var(--text-color);
  font-size: 1rem;
}

.model-count {
  margin: 0.25rem 0 0 0;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.model-profiles {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.profile-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.profile-group label {
  font-weight: 500;
  color: var(--text-color);
  font-size: 0.875rem;
}

.profile-group select {
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--button-bg);
  color: var(--text-color);
  font-size: 0.875rem;
  width: 100%;
  box-sizing: border-box;
}

.profile-group select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.profile-group select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-footer {
  display: flex;
  justify-content: center;
  padding: 1rem;
  border-top: 1px solid var(--border-color);
}

.footer-buttons {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.cancel-btn,
.slice-btn-footer {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 120px;
}

.cancel-btn {
  background-color: var(--button-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.cancel-btn:hover {
  background-color: var(--hover-bg);
}

.slice-btn-footer {
  width: 100%;
  background-color: var(--accent-color);
  color: white;
  border: none;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.slice-btn-footer:hover:not(:disabled) {
  background-color: var(--accent-hover);
}

.slice-btn-footer:disabled {
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: not-allowed;
  border: 1px solid var(--border-color);
}
</style>