<template>
  <div class="printer-card" :class="{ 'printer-disabled': !printer.enabled }">
    <div class="printer-header">
      <div class="printer-title">
        <h3 class="printer-name">{{ printer.name }} ({{ printer.model }})</h3>
        <div class="printer-ip">{{ printer.ipAddress }}</div>
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
          <span class="progress-label">Progress</span>
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
  computed: {
    isPrinting() {
      return this.printerData && (
        this.printerData.gcodeState === 'RUNNING' || 
        this.printerData.gcodeState === 'PAUSE' ||
        this.printerData.progress > 0
      )
    }
  },
  methods: {
    getNozzleTemp() {
      if (this.printer.status !== 'online' || !this.printerData) {
        return '--°C'
      }
      return `${Math.round(this.printerData.nozzleTemp)}°C`
    },
    getNozzleTargetTemp() {
      if (this.printer.status !== 'online' || !this.printerData) {
        return 'Target: --°C'
      }
      return `Target: ${Math.round(this.printerData.nozzleTargetTemp)}°C`
    },
    getBedTemp() {
      if (this.printer.status !== 'online' || !this.printerData) {
        return '--°C'
      }
      return `${Math.round(this.printerData.bedTemp)}°C`
    },
    getBedTargetTemp() {
      if (this.printer.status !== 'online' || !this.printerData) {
        return 'Target: --°C'
      }
      return `Target: ${Math.round(this.printerData.bedTargetTemp)}°C`
    },
    getProgress() {
      if (this.printer.status !== 'online' || !this.printerData) {
        return 0
      }
      return Math.round(this.printerData.progress || 0)
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
  }
}
</script>