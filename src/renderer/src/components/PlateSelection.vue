<template>
  <div class="modal-overlay" v-if="isVisible">
    <div class="modal-container plate-selection">
      <div class="modal-header">
        <button class="back-btn" @click="goBack" title="Back to file selection">
          <span>←</span>
        </button>
        <h2>Select Plate - {{ fileName }}</h2>
        <button class="close-btn" @click="close">
          <span>✕</span>
        </button>
      </div>
      
      <div class="modal-body">
        <div class="plate-carousel-container">
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <p>Loading plates...</p>
          </div>
          
          <div v-else-if="error" class="error-state">
            <p class="error-message">{{ error }}</p>
            <button class="retry-btn" @click="loadPlates">Retry</button>
          </div>
          
          <div v-else-if="plates.length === 0" class="empty-state">
            <p>No plates found in this file</p>
          </div>
          
          <div v-else class="plates-list">
            <div 
              v-for="(plate, index) in plates" 
              :key="index"
              class="plate-item"
              :class="{ selected: selectedPlateIndex === index }"
              @click="selectPlate(index)"
            >
              <div class="plate-preview">
                <img
                  v-if="plate.preview"
                  :src="plate.preview"
                  :alt="`Plate ${index + 1}`"
                  class="plate-image"
                />
                <div v-else class="plate-placeholder">
                  <div class="plate-icon">🖼️</div>
                  <p>Plate {{ index + 1 }}</p>
                </div>
              </div>

              <div class="plate-info">
                <h4>Plate {{ index + 1 }}</h4>
                <div class="plate-stats">
                  <div class="stat-item" v-if="plate.layerCount">
                    <span class="stat-label">Layers:</span>
                    <span class="stat-value">{{ plate.layerCount }}</span>
                  </div>
                  <div class="stat-item" v-if="plate.printTime">
                    <span class="stat-label">Time:</span>
                    <span class="stat-value">{{ formatTime(plate.printTime) }}</span>
                  </div>
                  <div class="stat-item" v-if="plate.resinUsage">
                    <span class="stat-label">Resin:</span>
                    <span class="stat-value">{{ plate.resinUsage }}ml</span>
                  </div>
                </div>
              </div>
              
              <div class="plate-radio">
                <div class="radio-button" :class="{ checked: selectedPlateIndex === index }">
                  <span v-if="selectedPlateIndex === index">✓</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="modal-footer" style="justify-content: center;">
        <button class="cancel-btn" @click="close">Cancel</button>
        <button
          class="print-btn"
          :disabled="!selectedPlate || printing"
          @click="startPrint"
        >
          {{ printing ? 'Starting Print...' : 'Start Print' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PlateSelection',
  props: {
    isVisible: {
      type: Boolean,
      default: false
    },
    printerId: {
      type: String,
      required: true
    },
    printerName: {
      type: String,
      required: true
    },
    printerModel: {
      type: String,
      required: true
    },
    fileName: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      plates: [],
      selectedPlateIndex: 0,
      loading: false,
      error: null,
      printing: false
    }
  },
  computed: {
    selectedPlate() {
      return this.plates[this.selectedPlateIndex] || {}
    }
  },
  watch: {
    isVisible(newVal) {
      if (newVal) {
          printerId: this.printerId,
          printerName: this.printerName, 
          printerModel: this.printerModel,
          fileName: this.fileName
        })
        this.loadPlates()
      } else {
        this.resetDialog()
      }
    },
    printerModel(newVal) {
      if (newVal && this.isVisible) {
        this.loadPlates()
      }
    }
  },
  methods: {
    async loadPlates() {
      this.loading = true
      this.error = null
      
      try {
        
        // Use WebSocket to get plate information
        const app = this.$parent.$parent || this.$root
        if (app.sendMessage) {
          // Send request via WebSocket using printer model directly
          app.sendMessage('get-sliced-file-plates', { 
            printerModel: this.printerModel,
            fileName: this.fileName
          })
          
          
          // Wait for response
          const response = await this.waitForWebSocketResponse('sliced-file-plates')
          this.plates = response.plates || []
          this.selectedPlateIndex = 0
        } else {
          throw new Error('WebSocket connection not available')
        }
      } catch (error) {
        console.error('Failed to load plates:', error)
        this.error = error.message || 'Failed to load plates from file'
      } finally {
        this.loading = false
      }
    },
    
    selectPlate(index) {
      this.selectedPlateIndex = index
    },
    
    async startPrint() {
      if (!this.selectedPlate) return
      
      this.printing = true
      try {
        // Use WebSocket to start print
        const app = this.$parent.$parent || this.$root
        if (app.sendMessage) {
          // Send request via WebSocket
          app.sendMessage('start-print', {
            printerId: this.printerId,
            fileName: this.fileName,
            plateIndex: this.selectedPlateIndex
          })
          
          // Wait for response
          await this.waitForWebSocketResponse('print-started')
          
          this.$emit('print-started', {
            printerId: this.printerId,
            fileName: this.fileName,
            plateIndex: this.selectedPlateIndex
          })
          
          this.close()
        } else {
          throw new Error('WebSocket connection not available')
        }
      } catch (error) {
        console.error('Failed to start print:', error)
        this.error = error.message || 'Failed to start print job'
      } finally {
        this.printing = false
      }
    },
    
    waitForWebSocketResponse(expectedType) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket response timeout'))
        }, 15000) // 15 second timeout
        
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
    
    goBack() {
      this.$emit('go-back')
    },
    
    close() {
      this.$emit('close')
    },
    
    resetDialog() {
      this.plates = []
      this.selectedPlateIndex = 0
      this.error = null
      this.printing = false
    },
    
    formatTime(seconds) {
      if (!seconds) return ''
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      if (hours > 0) {
        return `${hours}h ${minutes}m`
      }
      return `${minutes}m`
    }
  }
}
</script>

<style scoped>
.plate-selection {
  /* Sizing inherited from .modal-container */
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.modal-header h2 {
  flex: 1;
  margin: 0;
  font-size: 1.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.back-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 4px;
  color: var(--text-color);
  transition: background-color 0.2s;
}

.back-btn:hover {
  background-color: var(--hover-bg);
}

.modal-body {
  padding: 1.5rem;
}

.plate-carousel-container {
  min-height: 400px;
}

.plates-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 400px;
  overflow-y: auto;
}

.plate-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  cursor: pointer;
  transition: all 0.2s;
}

.plate-item:hover {
  border-color: var(--accent-color);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.plate-item.selected {
  border-color: var(--accent-color);
  background-color: var(--hover-bg);
}

.plate-item .plate-preview {
  width: 120px;
  height: 120px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-bg);
  overflow: hidden;
  flex-shrink: 0;
}

.plate-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.plate-item .plate-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.plate-item .plate-info h4 {
  margin: 0;
  color: var(--text-color);
  font-size: 1.1rem;
}

.plate-stats {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 500;
}

.stat-value {
  font-size: 0.9rem;
  color: var(--text-color);
  font-weight: 600;
}

.plate-radio {
  display: flex;
  align-items: center;
  justify-content: center;
}

.radio-button {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--card-bg);
  transition: all 0.2s;
}

.radio-button.checked {
  border-color: var(--accent-color);
  background-color: var(--accent-color);
  color: white;
}

.plate-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
}

.plate-icon {
  font-size: 3rem;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem;
  text-align: center;
  min-height: 400px;
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

.error-message {
  color: var(--error-color);
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

.modal-footer {
  display: flex;
  justify-content: center !important;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem 2rem;
  border-top: 1px solid var(--border-color);
}

.cancel-btn,
.print-btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-btn {
  background-color: var(--button-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
}

.cancel-btn:hover {
  background-color: var(--hover-bg);
}

.print-btn {
  background-color: var(--primary-color);
  color: white;
}

.print-btn:hover:not(:disabled) {
  background-color: var(--primary-hover);
}

.print-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>