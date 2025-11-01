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
      <!-- Progress Bar -->
      <div class="progress-section" v-if="printerData && printerData.progress > 0">
        <div class="progress-header">
          <span class="progress-label">🖨️ Print Progress</span>
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
        progress: 0
      })
    }
  }
}
</script>