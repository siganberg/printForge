<template>
  <div class="printer-card">
    <div class="printer-header">
      <h3 class="printer-name">{{ printer.name }}</h3>
      <span 
        class="printer-status" 
        :class="printer.status === 'online' ? 'status-online' : 'status-offline'"
      >
        {{ printer.status }}
      </span>
    </div>
    
    <div class="printer-info">
      <div class="info-row">
        <span>IP Address:</span>
        <span>{{ printer.ipAddress }}</span>
      </div>
      <div class="info-row">
        <span>Model:</span>
        <span>{{ printer.model }}</span>
      </div>
      <div class="info-row">
        <span>Enabled:</span>
        <span :class="printer.enabled ? 'enabled-true' : 'enabled-false'">
          {{ printer.enabled ? 'Yes' : 'No' }}
        </span>
      </div>
    </div>

    <div class="printer-data-info" v-if="printer.status === 'online' && printerData">
      <!-- Print Job Info -->
      <div class="print-job-section" v-if="isPrinting">
        <div class="job-header">
          <span class="job-label">🖨️ Printing:</span>
          <span class="job-filename">{{ getJobFilename() }}</span>
        </div>
        <div class="job-details" v-if="getPlateDisplay()">
          <span class="plate-info">{{ getPlateDisplay() }}</span>
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="progress-section" v-if="printerData && printerData.progress > 0">
        <div class="progress-header">
          <span class="progress-label">Progress</span>
          <span class="progress-percentage">{{ Math.round(printerData.progress) }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: printerData.progress + '%' }"></div>
        </div>
      </div>

      <!-- Temperature Info -->
      <div class="temperature-section">
        <div class="temp-row">
          <span class="temp-label">🔥 Nozzle:</span>
          <span class="temp-values">
            {{ Math.round(printerData.nozzleTemp) }}°C / {{ Math.round(printerData.nozzleTargetTemp) }}°C
          </span>
        </div>
        <div class="temp-row">
          <span class="temp-label">🛏️ Bed:</span>
          <span class="temp-values">
            {{ Math.round(printerData.bedTemp) }}°C / {{ Math.round(printerData.bedTargetTemp) }}°C
          </span>
        </div>
      </div>
    </div>

    <!-- Print Button -->
    <div class="printer-actions">
      <button 
        class="print-btn" 
        :disabled="printer.status !== 'online'"
        @click="handlePrint"
      >
        Print
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
    getJobFilename() {
      if (!this.printerData) return ''
      
      const { projectId, gcodeFile } = this.printerData
      
      // Follow layer-fleet logic: use project_id if it exists and is non-numeric
      if (projectId && projectId.trim() !== '' && isNaN(Number(projectId))) {
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
      if (!this.printerData || !this.printerData.subtaskName) return ''
      
      const subtaskName = this.printerData.subtaskName.trim()
      if (subtaskName === '') return ''
      
      // Convert plate_3 to "Plate 3" format
      if (subtaskName.toLowerCase().startsWith('plate_')) {
        const plateNumber = subtaskName.split('_')[1]
        return `Plate ${plateNumber}`
      }
      
      return subtaskName
    },
    handlePrint() {
      this.$emit('open-print-dialog', this.printer)
    }
  }
}
</script>