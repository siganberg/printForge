<template>
  <div class="confirm-overlay" v-if="isVisible" @click.self="handleNo">
    <div class="confirm-container">
      <div class="confirm-body">
        <p>{{ message }}</p>
      </div>

      <div class="confirm-footer">
        <button class="no-btn" @click="handleNo">No</button>
        <button class="yes-btn" @click="handleYes">Yes</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ConfirmDialog',
  props: {
    isVisible: {
      type: Boolean,
      default: false
    },
    title: {
      type: String,
      default: 'Confirm'
    },
    message: {
      type: String,
      required: true
    }
  },
  methods: {
    handleYes() {
      this.$emit('confirm')
    },
    handleNo() {
      this.$emit('cancel')
    }
  }
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.75);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

.confirm-container {
  background-color: var(--bg-primary);
  border-radius: 12px;
  width: 90%;
  max-width: 450px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  border: 1px solid var(--border-color);
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.confirm-body {
  padding: 3rem 2.5rem;
}

.confirm-body p {
  margin: 0;
  color: var(--text-primary);
  font-size: 1rem;
  line-height: 1.6;
  white-space: pre-line;
  text-align: center;
}

.confirm-footer {
  padding: 0 2.5rem 2.5rem 2.5rem;
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.no-btn,
.yes-btn {
  padding: 0.75rem 2rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
  min-width: 100px;
}

.no-btn {
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.no-btn:hover {
  background-color: var(--bg-hover);
  border-color: var(--accent-color);
}

.yes-btn {
  background-color: #e74c3c;
  color: white;
}

.yes-btn:hover {
  background-color: #c0392b;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(231, 76, 60, 0.3);
}
</style>
