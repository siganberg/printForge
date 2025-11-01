<template>
  <div v-if="isVisible" class="modal-overlay" @click="closeModal">
    <div class="modal-container" @click.stop>
      <div class="modal-header">
        <h2>Settings</h2>
        <button class="close-btn" @click="closeModal">
          <svg class="icon" viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="tabs">
          <button 
            class="tab-btn" 
            :class="{ active: activeTab === 'printers' }"
            @click="activeTab = 'printers'"
          >
            Printers
          </button>
        </div>

        <div class="tab-content">
          <div v-if="activeTab === 'printers'" class="tab-panel">
            <div class="printers-management">
              <div class="printers-header">
                <h3>Manage Printers</h3>
                <button class="add-btn" @click="showAddPrinter">
                  <svg class="icon" viewBox="0 0 24 24">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Printer
                </button>
              </div>

              <div class="printers-list">
                <div v-for="printer in printers" :key="printer.id" class="printer-item">
                  <div class="printer-info">
                    <div class="printer-name">{{ printer.name }}</div>
                    <div class="printer-details">
                      {{ printer.ipAddress }} • {{ printer.model }}
                    </div>
                  </div>
                  <div class="printer-actions">
                    <button class="edit-btn" @click="editPrinter(printer)">
                      <svg class="icon" viewBox="0 0 24 24">
                        <path d="m18 2 4 4-8 8H10V10l8-8z"></path>
                        <path d="M16 8L2 22v4h4L22 10l-4-4-2 2z"></path>
                      </svg>
                    </button>
                    <button class="delete-btn" @click="deletePrinter(printer.id)">
                      <svg class="icon" viewBox="0 0 24 24">
                        <polyline points="3,6 5,6 21,6"></polyline>
                        <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Add/Edit Printer Form -->
              <div v-if="showPrinterForm" class="printer-form-overlay">
                <div class="printer-form">
                  <h4>{{ editingPrinter ? 'Edit Printer' : 'Add New Printer' }}</h4>
                  
                  <div class="form-group">
                    <label>Name</label>
                    <input v-model="printerForm.name" type="text" placeholder="Printer Name">
                  </div>

                  <div class="form-group">
                    <label>Access Code</label>
                    <input v-model="printerForm.accessCode" type="text" placeholder="Access Code">
                  </div>

                  <div class="form-group">
                    <label>IP Address</label>
                    <input v-model="printerForm.ipAddress" type="text" placeholder="192.168.1.100">
                  </div>

                  <div class="form-group">
                    <label>Serial Number</label>
                    <input v-model="printerForm.serialNo" type="text" placeholder="Serial Number">
                  </div>

                  <div class="form-group">
                    <label>Model</label>
                    <input v-model="printerForm.model" type="text" placeholder="Printer Model">
                  </div>

                  <div class="form-group checkbox-group">
                    <label>
                      <input v-model="printerForm.enabled" type="checkbox">
                      <span class="checkmark"></span>
                      Enabled
                    </label>
                  </div>

                  <div class="form-actions">
                    <button class="cancel-btn" @click="cancelPrinterForm">Cancel</button>
                    <button class="save-btn" @click="savePrinter">
                      {{ editingPrinter ? 'Update' : 'Add' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'SettingsModal',
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
      activeTab: 'printers',
      showPrinterForm: false,
      editingPrinter: null,
      printerForm: {
        name: '',
        accessCode: '',
        ipAddress: '',
        serialNo: '',
        model: '',
        enabled: true
      }
    }
  },
  methods: {
    closeModal() {
      this.$emit('close')
    },
    showAddPrinter() {
      this.editingPrinter = null
      this.printerForm = {
        name: '',
        accessCode: '',
        ipAddress: '',
        serialNo: '',
        model: '',
        enabled: true
      }
      this.showPrinterForm = true
    },
    editPrinter(printer) {
      this.editingPrinter = printer
      this.printerForm = {
        name: printer.name,
        accessCode: printer.accessCode,
        ipAddress: printer.ipAddress,
        serialNo: printer.serialNo,
        model: printer.model,
        enabled: printer.enabled
      }
      this.showPrinterForm = true
    },
    cancelPrinterForm() {
      this.showPrinterForm = false
      this.editingPrinter = null
    },
    savePrinter() {
      if (this.editingPrinter) {
        // Update existing printer
        this.$emit('update-printer', {
          id: this.editingPrinter.id,
          ...this.printerForm
        })
      } else {
        // Add new printer
        this.$emit('add-printer', this.printerForm)
      }
      this.showPrinterForm = false
      this.editingPrinter = null
    },
    deletePrinter(id) {
      if (confirm('Are you sure you want to delete this printer?')) {
        this.$emit('delete-printer', id)
      }
    }
  }
}
</script>