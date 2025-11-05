<template>
  <div class="modal-overlay" v-if="isVisible">
    <div class="modal-container print-dialog">
      <div class="modal-header">
        <div class="header-left">
          <button v-if="currentSlide === 'plate-selection'" class="back-btn" @click="goBackToFileSelection" title="Back to file selection">
            <span>←</span>
          </button>
        </div>
        <h2>{{ headerTitle }}</h2>
        <button class="close-btn" @click="close">
          <span>✕</span>
        </button>
      </div>

      <div class="modal-body">
        <!-- Slide 1: File Selection -->
        <div v-if="currentSlide === 'file-selection'" class="file-list-container">
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <p>Loading files...</p>
          </div>

          <div v-else-if="error" class="error-state">
            <p class="error-message">{{ error }}</p>
            <button class="retry-btn" @click="loadFiles">Retry</button>
          </div>

          <div v-else-if="files.length === 0" class="empty-state">
            <p>No files found on this printer</p>
          </div>

          <div v-else class="file-list">
            <div
              v-for="file in files"
              :key="file.name"
              class="file-item"
              @click="selectFile(file.name)"
            >
              <div class="file-icon">📄</div>
              <div class="file-info">
                <div class="file-name">{{ file.name }}</div>
                <div class="file-details">
                  <span class="file-size">{{ formatFileSize(file.size) }}</span>
                  <span class="file-date">{{ formatDate(file.date) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Slide 2: Plate Selection -->
        <div v-if="currentSlide === 'plate-selection'" class="plate-selection-container">
          <div v-if="downloadingModel" class="loading-state">
            <div class="spinner"></div>
            <p>Downloading model...</p>
          </div>

          <div v-else-if="loadingPlates" class="loading-state">
            <div class="spinner"></div>
            <p>Loading plates...</p>
          </div>

          <div v-else-if="plateError" class="error-state">
            <p class="error-message">{{ plateError }}</p>
            <button class="retry-btn" @click="loadPlates">Retry</button>
          </div>

          <div v-else-if="plates.length === 0" class="empty-state">
            <p>No plates found in this file</p>
          </div>

          <div v-else class="two-column-layout">
            <!-- Left Column: Plates -->
            <div class="plates-column">
              <h3>Select Plate</h3>
              <div class="plates-grid">
                <div
                  v-for="(plate, index) in plates"
                  :key="index"
                  class="plate-card"
                  :class="{ selected: selectedPlateIndex === index }"
                  @click="selectPlate(index)"
                >
                  <div class="plate-thumbnail">
                    <img
                      v-if="plate.preview"
                      :src="plate.preview"
                      :alt="`Plate ${index + 1}`"
                      class="plate-image"
                    />
                    <div v-else class="plate-placeholder">
                      <div class="plate-icon">🖼️</div>
                    </div>
                    <div class="check-overlay" v-if="selectedPlateIndex === index">
                      <span>✓</span>
                    </div>
                    <div class="plate-name">Plate {{ index + 1 }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Column: Filament Selection -->
            <div class="filament-column">
              <h3>Select Filament</h3>
              <div class="filament-grid">
                <div
                  v-for="(filament, index) in filaments"
                  :key="index"
                  class="filament-card"
                  :class="{
                    selected: selectedFilamentIndex === index,
                    disabled: isFilamentDisabled(filament)
                  }"
                  @click="!isFilamentDisabled(filament) && selectFilament(index)"
                >
                  <svg class="filament-spool" viewBox="0 0 100 100">
                    <!-- Outer ring -->
                    <circle cx="50" cy="50" r="45" :fill="filament.color" opacity="0.2"/>
                    <circle cx="50" cy="50" r="45" :stroke="filament.color" stroke-width="2" fill="none"/>

                    <!-- Inner dark ring -->
                    <circle cx="50" cy="50" r="35" :fill="filament.color" opacity="0.8"/>

                    <!-- Center hub -->
                    <circle cx="50" cy="50" r="15" fill="white"/>

                    <!-- Hub details -->
                    <circle cx="50" cy="50" r="12" :fill="filament.color" opacity="0.3"/>
                    <circle cx="50" cy="50" r="8" fill="white"/>
                  </svg>
                  <div class="filament-name">{{ filament.type }}</div>
                  <div class="check-overlay" v-if="selectedFilamentIndex === index">
                    <span>✓</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer" style="justify-content: center;">
        <button class="cancel-btn" @click="close">Cancel</button>
        <button
          v-if="currentSlide === 'plate-selection'"
          class="print-btn"
          :disabled="!canStartPrint || printing"
          @click="startPrint()"
        >
          {{ printing ? 'Starting Print...' : 'Start Print' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PrintDialog',
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
    printerData: {
      type: Object,
      default: () => ({})
    },
    printer: {
      type: Object,
      default: () => ({})
    }
  },
  data() {
    return {
      currentSlide: 'file-selection',
      files: [],
      loading: false,
      error: null,
      selectedFileName: '',
      plates: [],
      loadingPlates: false,
      downloadingModel: false,
      plateError: null,
      selectedPlateIndex: 0,
      printing: false,
      selectedFilamentIndex: 0
    }
  },
  computed: {
    headerTitle() {
      if (this.currentSlide === 'file-selection') {
        return `Select File - ${this.printerName}`
      } else {
        return `Select Plate - ${this.selectedFileName}`
      }
    },
    selectedPlate() {
      return this.plates[this.selectedPlateIndex] || null
    },
    filaments() {
      // Get filaments from printer's AMS data
      if (this.printerData && this.printerData.ams && this.printerData.ams.length > 0) {
        return this.printerData.ams.map((filament, index) => ({
          slot: filament.slot !== undefined ? filament.slot : index,
          type: filament.type || 'Unknown',
          color: filament.colorHex || filament.color || '#CCCCCC'
        }));
      }

      // Fallback: return empty array or default filaments
      return [];
    },
    canStartPrint() {
      // Must have a plate selected
      if (!this.selectedPlate) return false

      // Must have filaments available
      if (this.filaments.length === 0) return false

      // Must have a filament selected
      if (this.selectedFilamentIndex === null || this.selectedFilamentIndex < 0) return false

      // The selected filament must not be disabled
      const selectedFilament = this.filaments[this.selectedFilamentIndex]
      if (!selectedFilament) return false

      // If plate requires specific filament type, selected filament must match
      if (this.selectedPlate.filamentType) {
        const isDisabled = this.isFilamentDisabled(selectedFilament)
        if (isDisabled) return false
      }

      return true
    }
  },
  watch: {
    isVisible(newVal) {
      if (newVal) {
        this.currentSlide = 'file-selection'
        // Only load files if we don't have them cached
        if (this.files.length === 0) {
          this.loadFiles()
        }
      } else {
        this.resetDialog()
      }
    }
  },
  methods: {
    async loadFiles() {
      this.loading = true
      this.error = null

      try {
        // Use WebSocket instead of Electron IPC for browser compatibility
        const app = this.$parent.$parent || this.$root
        if (app.sendMessage) {
          // Send request via WebSocket
          app.sendMessage('get-printer-files', { printerId: this.printerId })

          // Wait for response
          const response = await this.waitForWebSocketResponse('printer-files')
          this.files = response.files || []
        } else {
          throw new Error('WebSocket connection not available')
        }
      } catch (error) {
        console.error('Failed to load printer files:', error)
        this.error = error.message || 'Failed to load files from printer'
      } finally {
        this.loading = false
      }
    },

    selectFile(fileName) {
      this.selectedFileName = fileName
      this.currentSlide = 'plate-selection'
      this.loadPlates()
    },

    async loadPlates() {
      this.loadingPlates = true
      this.plateError = null

      try {
        const app = this.$parent.$parent || this.$root
        if (app.sendMessage) {
          // First, try to get sliced file plates
          app.sendMessage('get-sliced-file-plates', {
            printerModel: this.printerModel,
            fileName: this.selectedFileName
          })

          const response = await this.waitForWebSocketResponse('sliced-file-plates')

          // If no plates found, download and extract the file
          if (!response.plates || response.plates.length === 0) {
            this.loadingPlates = false
            this.downloadingModel = true


            // Request download and extraction
            app.sendMessage('download-and-extract-file', {
              printerId: this.printerId,
              fileName: this.selectedFileName,
              printerModel: this.printerModel
            })

            // Wait for extraction to complete (5 minute timeout for download + extraction)
            const extractionResponse = await this.waitForWebSocketResponse('file-extraction-complete', 300000)

            this.downloadingModel = false
            this.loadingPlates = true

            // Now try to get plates again
            app.sendMessage('get-sliced-file-plates', {
              printerModel: this.printerModel,
              fileName: this.selectedFileName
            })

            const finalResponse = await this.waitForWebSocketResponse('sliced-file-plates')
            this.plates = finalResponse.plates || []
          } else {
            this.plates = response.plates || []
          }

          this.selectedPlateIndex = 0

          // Auto-select matching filament for the first plate
          if (this.plates.length > 0) {
            this.$nextTick(() => {
              this.selectPlate(0)
            })
          }
        } else {
          throw new Error('WebSocket connection not available')
        }
      } catch (error) {
        console.error('Failed to load plates:', error)
        this.plateError = error.message || 'Failed to load plates from file'
        this.downloadingModel = false
      } finally {
        this.loadingPlates = false
      }
    },

    selectPlate(index) {
      this.selectedPlateIndex = index

      // Auto-select matching filament when plate is selected
      const plate = this.plates[index]


      if (plate && plate.filamentType && this.filaments.length > 0) {
        const matchingFilamentIndex = this.findBestMatchingFilament(plate.filamentType, plate.filamentColor)
        if (matchingFilamentIndex !== -1) {
          this.selectedFilamentIndex = matchingFilamentIndex
          const selected = this.filaments[matchingFilamentIndex]
        }
      } else if (!plate?.filamentType) {
      } else if (this.filaments.length === 0) {
      }
    },

    findBestMatchingFilament(requiredType, requiredColor) {
      if (!this.filaments.length) {
        return 0
      }

      // Step 1: Filter by filament type
      let candidateFilaments = this.filaments.map((filament, index) => ({ filament, index }))

      if (requiredType) {
        candidateFilaments = candidateFilaments.filter(
          ({ filament }) => filament.type.toUpperCase() === requiredType.toUpperCase()
        )
      }

      // If no type matches, use all filaments as candidates
      if (candidateFilaments.length === 0) {
        candidateFilaments = this.filaments.map((filament, index) => ({ filament, index }))
      }

      // If only one candidate, return it
      if (candidateFilaments.length === 1) {
        return candidateFilaments[0].index
      }

      // Step 2: Calculate color distances and assign scores
      const highestScore = candidateFilaments.length
      const filamentsWithScores = candidateFilaments.map(({ filament, index }) => ({
        filament,
        index,
        distance: requiredColor ? this.calculateColorDistance(requiredColor, filament.color) : 0,
        score: 0
      }))

      // Sort by distance (closest first)
      filamentsWithScores.sort((a, b) => a.distance - b.distance)

      // Assign scores based on color ranking
      let currentDistance = filamentsWithScores[0].distance
      let currentScore = highestScore

      for (let i = 0; i < filamentsWithScores.length; i++) {
        const filament = filamentsWithScores[i]

        // If distance changed, decrease score
        if (filament.distance > currentDistance) {
          currentDistance = filament.distance
          currentScore--
        }

        filament.score = currentScore
      }

      // Step 3: Add bonus point for lastSelectedFilamentIndex
      const lastIndex = this.printer?.lastSelectedFilamentIndex
      if (lastIndex !== undefined && lastIndex !== null) {
        const matchingFilament = filamentsWithScores.find(f => f.index === lastIndex)
        if (matchingFilament) {
          matchingFilament.score += 1
        }
      }

      // Step 4: Find filament with highest score
      filamentsWithScores.sort((a, b) => b.score - a.score)

      return filamentsWithScores[0].index
    },

    calculateColorDistance(color1, color2) {
      // Convert hex colors to RGB and calculate Euclidean distance
      const rgb1 = this.hexToRgb(color1)
      const rgb2 = this.hexToRgb(color2)

      if (!rgb1 || !rgb2) return Infinity

      const rDiff = rgb1.r - rgb2.r
      const gDiff = rgb1.g - rgb2.g
      const bDiff = rgb1.b - rgb2.b

      return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff)
    },

    hexToRgb(hex) {
      // Remove # if present
      hex = hex.replace(/^#/, '')

      // Handle 8-char hex (RRGGBBAA) by removing alpha
      if (hex.length === 8) {
        hex = hex.substring(0, 6)
      }

      if (hex.length !== 6) return null

      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)

      return { r, g, b }
    },

    isFilamentDisabled(filament) {
      // If no plate is selected, don't disable any filaments
      if (!this.selectedPlate) return false

      // If plate has no filament type requirement, don't disable
      if (!this.selectedPlate.filamentType) return false

      // Disable if filament type doesn't match plate requirement
      return filament.type.toUpperCase() !== this.selectedPlate.filamentType.toUpperCase()
    },

    selectFilament(index) {
      this.selectedFilamentIndex = index

      // Update local printer object immediately for instant feedback
      if (this.printer) {
        this.printer.lastSelectedFilamentIndex = index
      }

      // Save filament preference to backend
      const app = this.$parent.$parent || this.$root
      if (app.sendMessage) {
        app.sendMessage('save-filament-preference', {
          printerId: this.printerId,
          filamentIndex: index
        })
      }
    },

    async startPrint() {
      if (!this.selectedPlate) return

      this.printing = true
      try {
        const app = this.$parent.$parent || this.$root
        if (app.sendMessage) {
          // Get the selected filament slot for AMS
          const selectedFilament = this.filaments[this.selectedFilamentIndex]
          const filamentId = selectedFilament ? selectedFilament.slot : 0

          // Use the actual plate number from metadata, not the array index
          const actualPlateIndex = this.selectedPlate.plateIndex


          app.sendMessage('start-print', {
            printerId: this.printerId,
            fileName: this.selectedFileName,
            plateIndex: actualPlateIndex,
            filamentId: filamentId
          })

          await this.waitForWebSocketResponse('print-started')

          this.$emit('print-started', {
            printerId: this.printerId,
            fileName: this.selectedFileName,
            plateIndex: actualPlateIndex,
            filamentId: filamentId
          })

          this.close()
        } else {
          throw new Error('WebSocket connection not available')
        }
      } catch (error) {
        console.error('Failed to start print:', error)
        this.plateError = error.message || 'Failed to start print job'
      } finally {
        this.printing = false
      }
    },

    goBackToFileSelection() {
      this.currentSlide = 'file-selection'
      this.selectedFileName = ''
      this.plates = []
      this.plateError = null
      this.selectedPlateIndex = 0
      // Note: Files are cached and not reloaded when going back
    },

    waitForWebSocketResponse(expectedType, timeoutMs = 15000) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket response timeout'))
        }, timeoutMs)

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

    close() {
      this.$emit('close')
    },

    resetDialog() {
      this.currentSlide = 'file-selection'
      this.files = []
      this.error = null
      this.selectedFileName = ''
      this.plates = []
      this.loadingPlates = false
      this.downloadingModel = false
      this.plateError = null
      this.selectedPlateIndex = 0
      this.selectedFilamentIndex = 0
      this.printing = false
    },

    formatFileSize(bytes) {
      if (!bytes) return ''
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(1024))
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
    },

    formatDate(date) {
      if (!date) return ''
      return new Date(date).toLocaleDateString()
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
.back-btn {
  background: var(--button-bg);
  border: 1px solid var(--border-color);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  color: var(--text-primary);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  font-weight: bold;
}

.back-btn:hover {
  background-color: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
  transform: translateX(-2px);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-left {
  min-width: 40px;
  display: flex;
  align-items: center;
}

.modal-header h2 {
  flex: 1;
  margin: 0;
  font-size: 1.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  text-align: center;
}

.plate-selection-container {
  min-height: 400px;
  padding: 1.5rem;
}

.two-column-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  min-height: 400px;
}

.plates-column {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  padding-right: 1rem;
}

.filament-column {
  display: flex;
  flex-direction: column;
  padding-left: 1rem;
}

.plates-column h3,
.filament-column h3 {
  margin: 0 0 1rem 0;
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.plates-grid,
.filament-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  overflow-y: auto;
  max-height: 350px;
  padding: 0.75rem;
  margin: -0.25rem;
}

/* Plate Cards */
.plate-card {
  border: 2px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--card-bg);
  height: 160px;
}

.plate-card:hover {
  border-color: var(--accent-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.plate-card.selected {
  border-color: var(--accent-color);
  border-width: 3px;
}

.plate-thumbnail {
  position: relative;
  width: 100%;
  padding-bottom: 100%;
  background-color: var(--bg-secondary);
  overflow: hidden;
}

.plate-thumbnail img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.plate-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.plate-icon {
  font-size: 2rem;
}

.plate-name {
  bottom: 0;
  left: 0;
  right: 0;
  padding: 0.5rem;
  text-align: center;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-primary);
  background: transparent;
}

/* Filament Cards */
.filament-card {
  border: 2px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--card-bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  position: relative;
}

.filament-card:hover:not(.disabled) {
  border-color: var(--accent-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.filament-card.selected {
  border-color: var(--accent-color);
  border-width: 3px;
}

.filament-card.disabled {
  opacity: 0.3;
  cursor: not-allowed;
  pointer-events: none;
}

.filament-card.disabled .filament-spool {
  filter: grayscale(100%);
}

.filament-card.disabled .filament-name {
  text-decoration: line-through;
}

.filament-spool {
  width: 80px;
  height: 80px;
}

.filament-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  text-align: center;
}

/* Check Overlay */
.check-overlay {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 32px;
  height: 32px;
  background-color: var(--accent-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  color: white;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.print-btn {
  background-color: var(--accent-color);
  color: white;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.print-btn:hover:not(:disabled) {
  background-color: var(--accent-hover);
}

.print-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>