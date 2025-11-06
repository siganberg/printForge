<template>
  <div class="printer-card-container" :class="{ 'is-flipped': isFlipped }">
    <div class="printer-card printer-card-front" :class="{ 'printer-disabled': !printer.enabled }">
      <div class="printer-header">
        <div class="printer-title">
          <h3 class="printer-name">{{ printer.name }} ({{ printer.model }})</h3>
          <div class="printer-ip-row">
            <span class="printer-ip">{{ printer.ipAddress }}</span>
            <button class="camera-icon-btn" @click="toggleFlip" title="View Camera">
              📷
            </button>
          </div>
        </div>
        <span
          class="printer-status"
          :class="printer.status === 'online' ? 'status-online' : 'status-offline'"
        >
          {{ printer.status }}
        </span>
      </div>

    <div class="printer-data-info">
      <!-- Temperature Cards -->
      <div class="temperature-cards">
        <div class="temp-card">
          <div class="temp-label">Nozzle</div>
          <div class="temp-current">{{ getNozzleTemp() }}</div>
          <div class="temp-target">Target: {{ getNozzleTargetTemp() }}</div>
        </div>
        <div class="temp-card">
          <div class="temp-label">Bed</div>
          <div class="temp-current">{{ getBedTemp() }}</div>
          <div class="temp-target">Target: {{ getBedTargetTemp() }}</div>
        </div>
      </div>

      <!-- Progress Bar (always shown) -->
      <div class="progress-section">
        <div class="progress-header">
          <span class="progress-layers">{{ getLayersDisplay() }}</span>
          <span class="progress-percentage">{{ getProgress() }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: getProgress() + '%' }"></div>
        </div>
        <div class="progress-footer">
          <span class="job-info" v-if="getJobFilename()">
            {{ getJobFilename() }}<span v-if="getPlateDisplay()"> - {{ getPlateDisplay() }}</span>
          </span>
          <span class="job-info idle" v-else>No Job Running</span>
        </div>
      </div>
    </div>

      <!-- Print/Stop Button -->
      <div class="printer-actions">
        <button
          :class="['print-btn', { 'stop-btn': isPrinting }]"
          :disabled="printer.status !== 'online'"
          @click="isPrinting ? handleStopPrint() : handlePrint()"
        >
          {{ isPrinting ? 'Stop Print' : 'Print' }}
        </button>
      </div>
    </div>

    <!-- Back of Card -->
    <div class="printer-card printer-card-back">
      <div class="printer-header">
        <div class="printer-title">
          <h3 class="printer-name">{{ printer.name }} - Camera</h3>
        </div>
        <button class="back-btn" @click="toggleFlip" title="Back to Printer Info">
          ✕
        </button>
      </div>
      <div class="camera-content">
        <div class="camera-view">
          <canvas ref="cameraCanvas" class="camera-canvas"></canvas>
          <div v-if="!cameraConnected" class="camera-overlay">
            <div v-if="cameraError" class="camera-message">
              <p>Camera Error</p>
              <p class="error-detail">{{ cameraError }}</p>
              <button @click="connectCamera" class="retry-btn">Retry</button>
            </div>
            <div v-else-if="cameraConnecting" class="camera-message">
              <div class="loading-spinner"></div>
              <p>Connecting to camera...</p>
            </div>
            <div v-else class="camera-message">
              <p>Camera not connected</p>
              <button @click="connectCamera" class="connect-btn">Connect Camera</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PrinterCard',
  props: {
    printer: {
      type: Object,
      required: true
    },
    printerData: {
      type: Object,
      default: () => ({
        nozzleTemp: 0,
        nozzleTargetTemp: 0,
        bedTemp: 0,
        bedTargetTemp: 0,
        progress: 0,
        projectId: '',
        subtaskName: '',
        gcodeFile: '',
        gcodeState: ''
      })
    }
  },
  data() {
    return {
      isFlipped: false,
      cameraWs: null,
      cameraPlayer: null,
      cameraConnected: false,
      cameraConnecting: false,
      cameraError: null
    }
  },
  computed: {
    isPrinting() {
      return this.printerData && (
        this.printerData.gcodeState === 'RUNNING' ||
        this.printerData.gcodeState === 'PAUSE'
      )
    }
  },
  methods: {
    toggleFlip() {
      this.isFlipped = !this.isFlipped
      if (this.isFlipped) {
        // Auto-connect camera when flipping to camera view
        this.$nextTick(() => {
          this.connectCamera()
        })
      } else {
        // Disconnect camera when flipping back
        this.disconnectCamera()
      }
    },
    async connectCamera() {
      if (this.cameraConnecting || this.cameraConnected) return

      if (this.printer.status !== 'online') {
        this.cameraError = 'Printer is offline'
        return
      }

      this.cameraConnecting = true
      this.cameraError = null

      const canvas = this.$refs.cameraCanvas
      if (!canvas) {
        this.cameraError = 'Canvas not available'
        this.cameraConnecting = false
        return
      }

      // Determine camera type based on printer model
      const isA1Model = this.printer.model?.toLowerCase().includes('a1') ||
                        this.printer.serialNo?.toLowerCase().startsWith('039')

      // Connect to camera WebSocket
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${wsProtocol}//localhost:8080/camera/${this.printer.id}`

      console.log(`📹 Connecting to camera (${isA1Model ? 'A1' : 'X1'}): ${wsUrl}`)

      if (isA1Model) {
        // A1 model - direct JPEG frames
        this.connectA1Camera(wsUrl, canvas)
      } else {
        // X1 Carbon - RTSP stream with player
        await this.connectRtspCamera(wsUrl, canvas)
      }
    },
    connectA1Camera(wsUrl, canvas) {
      this.cameraWs = new WebSocket(wsUrl)
      this.cameraWs.binaryType = 'arraybuffer'

      const ctx = canvas.getContext('2d')

      this.cameraWs.onopen = () => {
        console.log('📹 [A1] Camera WebSocket connected')
        this.cameraConnected = true
        this.cameraConnecting = false
      }

      this.cameraWs.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const blob = new Blob([event.data], { type: 'image/jpeg' })
          const url = URL.createObjectURL(blob)

          const img = new Image()
          img.onload = () => {
            if (canvas && ctx) {
              canvas.width = img.width
              canvas.height = img.height
              ctx.drawImage(img, 0, 0)
            }
            URL.revokeObjectURL(url)
          }
          img.onerror = () => {
            URL.revokeObjectURL(url)
          }
          img.src = url
        }
      }

      this.cameraWs.onerror = (err) => {
        console.error('📹 [A1] Camera WebSocket error:', err)
        this.cameraError = 'Camera connection failed'
        this.cameraConnecting = false
      }

      this.cameraWs.onclose = () => {
        console.log('📹 [A1] Camera WebSocket closed')
        this.cameraConnected = false
        if (!this.cameraError) {
          this.cameraError = 'Camera connection closed'
        }
      }
    },
    async connectRtspCamera(wsUrl, canvas) {
      try {
        // Load RTSP player script if not already loaded
        if (!window.loadPlayer) {
          console.log('📹 [RTSP] Loading RTSP player...')
          await this.loadRtspScript()
        }

        if (window.loadPlayer && canvas) {
          console.log('📹 [RTSP] Initializing RTSP player for:', wsUrl)

          // Create player using rtsp-relay's loadPlayer
          this.cameraPlayer = window.loadPlayer({
            url: wsUrl,
            canvas: canvas
          })

          console.log('📹 [RTSP] Player initialized, waiting for stream...')

          // Give it time to connect and start streaming
          setTimeout(() => {
            if (this.cameraPlayer && !this.cameraError) {
              console.log('📹 [RTSP] Camera stream started')
              this.cameraConnected = true
              this.cameraConnecting = false
            } else if (this.cameraConnecting) {
              this.cameraError = 'Connection timeout - no video received'
              this.cameraConnecting = false
            }
          }, 2000)
        } else {
          throw new Error('RTSP player not available')
        }
      } catch (error) {
        console.error('📹 [RTSP] Connection error:', error)
        this.cameraError = error.message || 'Failed to connect to camera'
        this.cameraConnecting = false
      }
    },
    loadRtspScript() {
      return new Promise(async (resolve, reject) => {
        if (window.loadPlayer) {
          resolve()
          return
        }

        try {
          console.log('📹 [RTSP] Fetching script URL from backend...')
          const response = await fetch('http://localhost:8080/camera/script')
          if (!response.ok) {
            throw new Error('Failed to get RTSP script URL')
          }

          const data = await response.json()
          console.log('📹 [RTSP] Loading player script from:', data.scriptUrl)

          const script = document.createElement('script')
          script.src = data.scriptUrl

          script.onload = () => {
            console.log('📹 [RTSP] RTSP player script loaded successfully')
            if (window.loadPlayer) {
              resolve()
            } else {
              reject(new Error('loadPlayer not available after loading script'))
            }
          }

          script.onerror = (err) => {
            console.error('📹 [RTSP] Failed to load RTSP script:', err)
            reject(new Error('Failed to load RTSP script'))
          }

          document.head.appendChild(script)
        } catch (error) {
          console.error('📹 [RTSP] Error loading script:', error)
          reject(error)
        }
      })
    },
    disconnectCamera() {
      if (this.cameraWs) {
        this.cameraWs.close()
        this.cameraWs = null
      }
      if (this.cameraPlayer) {
        // Clean up JSMpeg player
        try {
          if (typeof this.cameraPlayer.destroy === 'function') {
            this.cameraPlayer.destroy()
          } else if (typeof this.cameraPlayer.stop === 'function') {
            this.cameraPlayer.stop()
          }
        } catch (err) {
          console.warn('📹 Error destroying player:', err)
        }
        this.cameraPlayer = null
      }
      this.cameraConnected = false
      this.cameraConnecting = false
      this.cameraError = null
    },
    getNozzleTemp() {
      if (this.printer.status !== 'online' || !this.printerData) {
        return '--°C'
      }
      return `${Math.round(this.printerData.nozzleTemp)}°C`
    },
    getNozzleTargetTemp() {
      if (this.printer.status !== 'online' || !this.printerData) {
        return '--°C'
      }
      const temp = this.printerData.nozzleTargetTemp
      if (temp === null || temp === undefined || isNaN(temp)) {
        return '--°C'
      }
      return `${Math.round(temp)}°C`
    },
    getBedTemp() {
      if (this.printer.status !== 'online' || !this.printerData) {
        return '--°C'
      }
      return `${Math.round(this.printerData.bedTemp)}°C`
    },
    getBedTargetTemp() {
      if (this.printer.status !== 'online' || !this.printerData) {
        return '--°C'
      }
      const temp = this.printerData.bedTargetTemp
      if (temp === null || temp === undefined || isNaN(temp)) {
        return '--°C'
      }
      return `${Math.round(temp)}°C`
    },
    getProgress() {
      if (this.printer.status !== 'online' || !this.printerData) {
        return 0
      }
      return Math.round(this.printerData.progress || 0)
    },
    getLayersDisplay() {
      if (this.printer.status !== 'online' || !this.printerData) {
        return 'Layers: --/--'
      }
      const currentLayer = this.printerData.layerNum || 0
      const totalLayers = this.printerData.totalLayerNum || 0

      if (totalLayers === 0) {
        return 'Layers: --/--'
      }

      return `Layers: ${currentLayer}/${totalLayers}`
    },
    getJobFilename() {
      if (!this.printerData) return ''

      const { projectId, gcodeFile, subtaskName } = this.printerData

      // First check if subtaskName exists and is not just a plate number
      if (subtaskName && subtaskName.trim() !== '') {
        const trimmed = subtaskName.trim()

        // If subtaskName contains "plate_X - filename", extract the filename
        const match = trimmed.match(/^plate_\d+\s*-\s*(.+)$/i)
        if (match) {
          return match[1]
        }

        // If subtaskName is just "plate_X", skip it and use other sources
        if (!/^plate_\d+$/i.test(trimmed)) {
          // Otherwise use subtaskName as-is (it's the actual filename)
          return trimmed
        }
      }

      // Follow layer-fleet logic: use project_id if it exists and is non-numeric
      if (projectId && projectId.trim() !== '' && isNaN(Number(projectId))) {
        // Check if projectId contains "plate_X - filename" format and extract just the filename
        const match = projectId.match(/^plate_\d+\s*-\s*(.+)$/i)
        if (match) {
          return match[1]
        }
        return projectId
      } else if (gcodeFile && gcodeFile.trim() !== '') {
        // Extract filename from gcode_file path and remove .gcode extension
        let filename = gcodeFile.split('/').pop() || gcodeFile
        if (filename.toLowerCase().endsWith('.gcode')) {
          filename = filename.slice(0, -6)
        }
        return filename
      }

      return ''
    },
    getPlateDisplay() {
      if (!this.printerData) return ''

      const { subtaskName, gcodeFile } = this.printerData

      // First check subtaskName for plate info
      if (subtaskName && subtaskName.trim() !== '') {
        const trimmed = subtaskName.trim()

        // If subtaskName contains "plate_X - filename", extract plate number
        const match = trimmed.match(/^plate_(\d+)\s*-\s*.+$/i)
        if (match) {
          return `Plate ${match[1]}`
        }

        // Convert plate_3 format to "Plate 3"
        if (trimmed.toLowerCase().startsWith('plate_')) {
          const plateNumber = trimmed.split('_')[1]
          if (plateNumber && /^\d+$/.test(plateNumber)) {
            return `Plate ${plateNumber}`
          }
        }
      }

      // Fall back to gcodeFile path to extract plate number
      if (gcodeFile && gcodeFile.includes('plate_')) {
        const match = gcodeFile.match(/plate_(\d+)/i)
        if (match) {
          return `Plate ${match[1]}`
        }
      }

      return ''
    },
    handlePrint() {
      this.$emit('open-print-dialog', this.printer)
    },
    handleStopPrint() {
      // Emit event to parent to show confirmation dialog
      this.$emit('request-stop-print', this.printer)
    }
  },
  beforeUnmount() {
    // Clean up camera connection
    this.disconnectCamera()
  }
}
</script>