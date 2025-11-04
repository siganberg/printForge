<template>
  <div class="app-container" :data-theme="theme">
    <header class="header">
      <h1>PrintForge</h1>
      <div class="header-controls">
        <button class="theme-toggle" @click="toggleTheme" title="Toggle theme">
          <svg class="icon" viewBox="0 0 24 24" v-if="theme === 'light'">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
          <svg class="icon" viewBox="0 0 24 24" v-else>
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        </button>
        <button class="slice-btn" @click="openSliceDialog" title="Slice File">
          <svg class="icon" viewBox="0 0 24 24">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
          </svg>
        </button>
        <button class="settings-btn" @click="openSettings" title="Settings">
          <svg class="icon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3"/>
            <path d="m12 1-3 6-6 3 6 3 3 6 3-6 6-3-6-3-3-6z"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </header>

    <main class="main-content">
      <div class="printers-grid">
        <PrinterCard
          v-for="printer in printers"
          :key="printer.id"
          :printer="printer"
          :printerData="printerData[printer.id]"
          @open-print-dialog="openPrintDialog"
          @request-stop-print="handleStopPrintRequest"
        />
      </div>
    </main>

    <!-- Settings Modal -->
    <SettingsModal
      :isVisible="showSettings"
      :printers="printers"
      @close="closeSettings"
      @add-printer="handleAddPrinter"
      @update-printer="handleUpdatePrinter"
      @delete-printer="handleDeletePrinter"
    />

    <!-- Print Dialog -->
    <PrintDialog
      :isVisible="showPrintDialog"
      :printerId="selectedPrinterId"
      :printerName="selectedPrinterName"
      :printerModel="selectedPrinterModel"
      :printerData="printerData[selectedPrinterId]"
      @close="closePrintDialog"
      @print-started="handlePrintStarted"
    />

    <!-- Slice Dialog -->
    <SliceDialog
      :isVisible="showSliceDialog"
      :printers="printers"
      @close="closeSliceDialog"
      @slice-started="handleSliceStarted"
    />

    <!-- Confirm Dialog -->
    <ConfirmDialog
      :isVisible="showConfirmDialog"
      :message="confirmDialogMessage"
      @confirm="handleConfirmYes"
      @cancel="handleConfirmNo"
    />
  </div>
</template>

<script>
import PrinterCard from './components/PrinterCard.vue'
import SettingsModal from './components/SettingsModal.vue'
import PrintDialog from './components/PrintDialog.vue'
import SliceDialog from './components/SliceDialog.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'

export default {
  name: 'App',
  components: {
    PrinterCard,
    SettingsModal,
    PrintDialog,
    SliceDialog,
    ConfirmDialog
  },
  data() {
    return {
      theme: 'light',
      printers: [],
      ws: null,
      showSettings: false,
      showPrintDialog: false,
      showSliceDialog: false,
      selectedPrinterId: null,
      selectedPrinterName: '',
      selectedPrinterModel: '',
      printerData: {},
      showConfirmDialog: false,
      confirmDialogMessage: '',
      confirmDialogCallback: null
    }
  },
  methods: {
    toggleTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light'
      this.sendMessage('update-settings', { theme: this.theme })
    },
    openSettings() {
      this.showSettings = true
    },
    openSliceDialog() {
      this.showSliceDialog = true
    },
    closeSettings() {
      this.showSettings = false
    },
    openPrintDialog(printer) {
      this.selectedPrinterId = printer.id
      this.selectedPrinterName = printer.name
      this.selectedPrinterModel = printer.model
      this.showPrintDialog = true
    },
    closePrintDialog() {
      this.showPrintDialog = false
      this.selectedPrinterId = null
      this.selectedPrinterName = ''
      this.selectedPrinterModel = ''
    },
    closeSliceDialog() {
      this.showSliceDialog = false
    },
    handleSliceStarted(data) {
      // Could show a notification here
    },
    handlePrintStarted(data) {
      // Could show a notification here
    },
    sanitizeMessageForLogging(message) {
      // Deep clone the message
      const sanitized = JSON.parse(JSON.stringify(message))

      // Strip base64 image data from plates
      if (sanitized.type === 'sliced-file-plates' && sanitized.data && sanitized.data.plates) {
        sanitized.data.plates = sanitized.data.plates.map(plate => {
          if (plate.preview && plate.preview.startsWith('data:image')) {
            return {
              ...plate,
              preview: '[BASE64_IMAGE_DATA_STRIPPED]'
            }
          }
          return plate
        })
      }

      return sanitized
    },
    connectWebSocket() {
      this.ws = new WebSocket('ws://localhost:8080')

      this.ws.onopen = () => {
        this.loadSettings()
        this.loadPrinters()
      }

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      this.ws.onclose = () => {
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          this.connectWebSocket()
        }, 3000)
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    },
    handleMessage(message) {
      switch (message.type) {
        case 'printers-data':
          this.printers = message.data
          break
        case 'settings-data':
          this.theme = message.data.theme || 'light'
          break
        case 'settings-updated':
          this.theme = message.data.theme || 'light'
          break
        case 'printer-added':
          this.printers.push(message.data)
          break
        case 'printer-updated':
          const index = this.printers.findIndex(p => p.id === message.data.id)
          if (index !== -1) {
            this.printers[index] = message.data
          }
          break
        case 'printer-deleted':
          this.printers = this.printers.filter(p => p.id !== message.data.id)
          break
        case 'printer-status-changed':
          const printerIndex = this.printers.findIndex(p => p.id === message.data.printerId)
          if (printerIndex !== -1) {
            this.printers[printerIndex].status = message.data.status
          }
          break
        case 'printer-data-changed':
          const printerId = message.data.printerId
          const changes = message.data.printerData


          // Merge changes with existing data instead of replacing
          if (!this.printerData[printerId]) {
            this.printerData[printerId] = {}
          }

          // Apply only the changed fields
          this.printerData[printerId] = {
            ...this.printerData[printerId],
            ...changes
          }
          break
        case 'printer-files':
          // This will be handled by the PrintDialog's waitForWebSocketResponse
          break
        case 'file-plates':
          // This will be handled by the PlateSelection's waitForWebSocketResponse
          break
        case 'print-started':
          // This will be handled by the PlateSelection's waitForWebSocketResponse
          break
        case 'slice-started':
          // This will be handled by the SliceDialog's waitForWebSocketResponse
          break
        case 'slice-completed':
          // This will be handled by the SliceDialog's waitForWebSocketResponse
          break
        case 'slice-presets':
          // This will be handled by the SliceDialog's waitForWebSocketResponse
          break
        case 'file-cleaned':
          // This will be handled by the SliceDialog's waitForWebSocketResponse
          break
        case 'error':
          // This will be handled by the PrintDialog's waitForWebSocketResponse
          console.error('Server error:', message.data)
          break
      }
    },
    sendMessage(type, payload = {}) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const message = { type, payload }
        this.ws.send(JSON.stringify(message))
      }
    },
    loadSettings() {
      this.sendMessage('get-settings')
    },
    loadPrinters() {
      this.sendMessage('get-printers')
    },
    handleAddPrinter(printerData) {
      this.sendMessage('add-printer', printerData)
    },
    handleUpdatePrinter(printerData) {
      this.sendMessage('update-printer', printerData)
    },
    handleDeletePrinter(printerId) {
      this.sendMessage('delete-printer', { id: printerId })
    },
    handleStopPrintRequest(printer) {
      this.showConfirmDialog = true
      this.confirmDialogMessage = `Are you sure you want to stop the current print on ${printer.name}? This action cannot be undone and will cancel the print job.`
      this.confirmDialogCallback = () => {
        this.sendMessage('stop-print', {
          printerId: printer.id
        })
      }
    },
    handleConfirmYes() {
      this.showConfirmDialog = false
      if (this.confirmDialogCallback) {
        this.confirmDialogCallback()
        this.confirmDialogCallback = null
      }
    },
    handleConfirmNo() {
      this.showConfirmDialog = false
      this.confirmDialogCallback = null
    }
  },
  mounted() {
    this.connectWebSocket()
  },
  beforeUnmount() {
    if (this.ws) {
      this.ws.close()
    }
  }
}
</script>