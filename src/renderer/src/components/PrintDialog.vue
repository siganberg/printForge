<template>
  <div class="modal-overlay" v-if="isVisible" @click.self="close">
    <div class="modal-container print-dialog">
      <div class="modal-header">
        <h2>Select File to Print - {{ printerName }}</h2>
        <button class="close-btn" @click="close">
          <span>✕</span>
        </button>
      </div>
      
      <div class="modal-body">
        <div class="file-list-container">
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
              :class="{ selected: selectedFile === file.name }"
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
      </div>
      
      <div class="modal-footer">
        <button class="cancel-btn" @click="close">Cancel</button>
        <button 
          class="print-btn" 
          :disabled="!selectedFile || printing"
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
    }
  },
  data() {
    return {
      files: [],
      selectedFile: null,
      loading: false,
      error: null,
      printing: false
    }
  },
  watch: {
    isVisible(newVal) {
      if (newVal) {
        this.loadFiles()
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
      this.selectedFile = fileName
    },
    
    async startPrint() {
      if (!this.selectedFile) return
      
      this.printing = true
      try {
        // Use WebSocket instead of Electron IPC for browser compatibility
        const app = this.$parent.$parent || this.$root
        if (app.sendMessage) {
          // Send request via WebSocket
          app.sendMessage('start-print', {
            printerId: this.printerId,
            fileName: this.selectedFile
          })
          
          // Wait for response
          await this.waitForWebSocketResponse('print-started')
          
          this.$emit('print-started', {
            printerId: this.printerId,
            fileName: this.selectedFile
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
    
    close() {
      this.$emit('close')
    },
    
    resetDialog() {
      this.selectedFile = null
      this.files = []
      this.error = null
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
    }
  }
}
</script>