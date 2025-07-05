class PerformanceMonitor {
  constructor(config) {
    this.config = config;
    this.metrics = [];
  }

  async initialize() {
    // Initialize monitoring resources if needed
    return true;
  }

  startMonitoring() {
    // Start monitoring (stub)
    return true;
  }

  startSession(processingId) {
    // Start a performance session (stub)
    return { id: processingId, start: Date.now() };
  }

  getMetrics() {
    return {
      sessions: this.metrics.length,
      lastSession: this.metrics[this.metrics.length - 1] || null,
    };
  }

  async stop() {
    // Stop monitoring (stub)
    return true;
  }
}

module.exports = PerformanceMonitor; 