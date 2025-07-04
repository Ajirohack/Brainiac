/**
 * System Monitor - Performance and health monitoring for the CAI Platform
 * 
 * Tracks system metrics, performance, and health status across all components
 */

const os = require('os');
const process = require('process');
const EventEmitter = require('events');
const Logger = require('../utils/logger');

class SystemMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        this.logger = new Logger('SystemMonitor');
        this.config = config;

        // Monitoring intervals
        this.metricsInterval = null;
        this.healthCheckInterval = null;
        this.alertCheckInterval = null;

        // Monitoring frequencies (in milliseconds)
        this.metricsFrequency = config.metrics_frequency || 30000; // 30 seconds
        this.healthCheckFrequency = config.health_frequency || 60000; // 1 minute
        this.alertCheckFrequency = config.alert_frequency || 10000; // 10 seconds

        // Metrics storage
        this.metrics = {
            system: [],
            performance: [],
            errors: [],
            requests: []
        };

        // Component health status
        this.componentHealth = {
            cognitiveBrain: { status: 'unknown', lastCheck: null },
            agentCouncil: { status: 'unknown', lastCheck: null },
            ragSystem: { status: 'unknown', lastCheck: null },
            database: { status: 'unknown', lastCheck: null },
            api: { status: 'unknown', lastCheck: null }
        };

        // Alert thresholds
        this.thresholds = {
            cpu: config.cpu_threshold || 80,
            memory: config.memory_threshold || 85,
            responseTime: config.response_time_threshold || 5000,
            errorRate: config.error_rate_threshold || 5
        };

        // Performance tracking
        this.performanceData = {
            requests: {
                total: 0,
                successful: 0,
                failed: 0,
                averageResponseTime: 0
            },
            operations: new Map(),
            errors: new Map()
        };

        // System state
        this.isMonitoring = false;
        this.startTime = null;
        this.alerts = [];

        // Metrics retention (keep last N entries)
        this.maxMetricsRetention = config.max_metrics_retention || 1000;
    }

    /**
     * Start system monitoring
     */
    async start() {
        try {
            if (this.isMonitoring) {
                this.logger.warn('⚠️ System monitoring is already running');
                return;
            }

            this.logger.info('📊 Starting system monitoring...');
            this.startTime = new Date();

            // Start metrics collection
            this.startMetricsCollection();

            // Start health checks
            this.startHealthChecks();

            // Start alert monitoring
            this.startAlertMonitoring();

            this.isMonitoring = true;
            this.logger.info('✅ System monitoring started successfully');

        } catch (error) {
            this.logger.error('❌ Failed to start system monitoring:', error);
            throw error;
        }
    }

    /**
     * Start metrics collection
     */
    startMetricsCollection() {
        this.metricsInterval = setInterval(async () => {
            await this.collectSystemMetrics();
        }, this.metricsFrequency);

        this.logger.debug('📈 Metrics collection started');
    }

    /**
     * Start health checks
     */
    startHealthChecks() {
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthChecks();
        }, this.healthCheckFrequency);

        this.logger.debug('💓 Health checks started');
    }

    /**
     * Start alert monitoring
     */
    startAlertMonitoring() {
        this.alertCheckInterval = setInterval(async () => {
            await this.checkAlerts();
        }, this.alertCheckFrequency);

        this.logger.debug('🚨 Alert monitoring started');
    }

    /**
     * Collect system metrics
     */
    async collectSystemMetrics() {
        try {
            const timestamp = new Date();

            // CPU metrics
            const cpuUsage = await this.getCPUUsage();

            // Memory metrics
            const memoryUsage = this.getMemoryUsage();

            // Process metrics
            const processMetrics = this.getProcessMetrics();

            // Network metrics (if available)
            const networkMetrics = this.getNetworkMetrics();

            const systemMetrics = {
                timestamp,
                cpu: cpuUsage,
                memory: memoryUsage,
                process: processMetrics,
                network: networkMetrics
            };

            this.addMetric('system', systemMetrics);

            // Emit metrics event
            this.emit('metrics', systemMetrics);

        } catch (error) {
            this.logger.error('❌ Failed to collect system metrics:', error);
        }
    }

    /**
     * Get CPU usage
     */
    async getCPUUsage() {
        return new Promise((resolve) => {
            const startMeasure = process.cpuUsage();
            const startTime = process.hrtime();

            setTimeout(() => {
                const endMeasure = process.cpuUsage(startMeasure);
                const endTime = process.hrtime(startTime);

                const totalTime = endTime[0] * 1000000 + endTime[1] / 1000; // microseconds
                const cpuTime = (endMeasure.user + endMeasure.system);
                const cpuPercent = (cpuTime / totalTime) * 100;

                resolve({
                    percent: Math.round(cpuPercent * 100) / 100,
                    user: endMeasure.user,
                    system: endMeasure.system
                });
            }, 100);
        });
    }

    /**
     * Get memory usage
     */
    getMemoryUsage() {
        const processMemory = process.memoryUsage();
        const systemMemory = {
            total: os.totalmem(),
            free: os.freemem()
        };

        const systemUsed = systemMemory.total - systemMemory.free;
        const systemPercent = (systemUsed / systemMemory.total) * 100;

        return {
            system: {
                total: systemMemory.total,
                used: systemUsed,
                free: systemMemory.free,
                percent: Math.round(systemPercent * 100) / 100
            },
            process: {
                rss: processMemory.rss,
                heapTotal: processMemory.heapTotal,
                heapUsed: processMemory.heapUsed,
                external: processMemory.external,
                arrayBuffers: processMemory.arrayBuffers
            }
        };
    }

    /**
     * Get process metrics
     */
    getProcessMetrics() {
        const uptime = process.uptime();
        const pid = process.pid;
        const version = process.version;
        const platform = process.platform;
        const arch = process.arch;

        return {
            pid,
            uptime,
            version,
            platform,
            arch,
            loadAverage: os.loadavg()
        };
    }

    /**
     * Get network metrics (basic)
     */
    getNetworkMetrics() {
        const networkInterfaces = os.networkInterfaces();
        const interfaces = {};

        for (const [name, addresses] of Object.entries(networkInterfaces)) {
            interfaces[name] = addresses.filter(addr => !addr.internal);
        }

        return {
            interfaces: Object.keys(interfaces).length,
            details: interfaces
        };
    }

    /**
     * Perform health checks on all components
     */
    async performHealthChecks() {
        try {
            const timestamp = new Date();

            // Check each component
            for (const component of Object.keys(this.componentHealth)) {
                const health = await this.checkComponentHealth(component);
                this.componentHealth[component] = {
                    status: health.status,
                    lastCheck: timestamp,
                    details: health.details
                };
            }

            // Emit health status
            this.emit('health', this.componentHealth);

        } catch (error) {
            this.logger.error('❌ Failed to perform health checks:', error);
        }
    }

    /**
     * Check individual component health
     */
    async checkComponentHealth(component) {
        try {
            // This would be implemented based on actual component interfaces
            // For now, return a basic health check
            return {
                status: 'healthy',
                details: {
                    responseTime: Math.random() * 100,
                    lastActivity: new Date()
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error.message,
                    lastError: new Date()
                }
            };
        }
    }

    /**
     * Check for alerts based on thresholds
     */
    async checkAlerts() {
        try {
            const latestMetrics = this.getLatestMetrics();
            if (!latestMetrics) return;

            const alerts = [];

            // CPU alert
            if (latestMetrics.cpu && latestMetrics.cpu.percent > this.thresholds.cpu) {
                alerts.push({
                    type: 'cpu',
                    level: 'warning',
                    message: `High CPU usage: ${latestMetrics.cpu.percent}%`,
                    value: latestMetrics.cpu.percent,
                    threshold: this.thresholds.cpu,
                    timestamp: new Date()
                });
            }

            // Memory alert
            if (latestMetrics.memory && latestMetrics.memory.system.percent > this.thresholds.memory) {
                alerts.push({
                    type: 'memory',
                    level: 'warning',
                    message: `High memory usage: ${latestMetrics.memory.system.percent}%`,
                    value: latestMetrics.memory.system.percent,
                    threshold: this.thresholds.memory,
                    timestamp: new Date()
                });
            }

            // Process alerts
            for (const alert of alerts) {
                this.addAlert(alert);
                this.emit('alert', alert);
            }

        } catch (error) {
            this.logger.error('❌ Failed to check alerts:', error);
        }
    }

    /**
     * Track operation performance
     */
    trackOperation(operation, duration, success = true) {
        if (!this.performanceData.operations.has(operation)) {
            this.performanceData.operations.set(operation, {
                count: 0,
                totalDuration: 0,
                averageDuration: 0,
                successCount: 0,
                failureCount: 0
            });
        }

        const opData = this.performanceData.operations.get(operation);
        opData.count++;
        opData.totalDuration += duration;
        opData.averageDuration = opData.totalDuration / opData.count;

        if (success) {
            opData.successCount++;
        } else {
            opData.failureCount++;
        }

        // Add to performance metrics
        this.addMetric('performance', {
            timestamp: new Date(),
            operation,
            duration,
            success
        });

        // Check for performance alerts
        if (duration > this.thresholds.responseTime) {
            this.addAlert({
                type: 'performance',
                level: 'warning',
                message: `Slow operation: ${operation} took ${duration}ms`,
                operation,
                duration,
                threshold: this.thresholds.responseTime,
                timestamp: new Date()
            });
        }
    }

    /**
     * Track error
     */
    trackError(error, context = {}) {
        const errorKey = error.message || 'Unknown Error';

        if (!this.performanceData.errors.has(errorKey)) {
            this.performanceData.errors.set(errorKey, {
                count: 0,
                firstOccurrence: new Date(),
                lastOccurrence: new Date(),
                contexts: []
            });
        }

        const errorData = this.performanceData.errors.get(errorKey);
        errorData.count++;
        errorData.lastOccurrence = new Date();
        errorData.contexts.push(context);

        // Keep only last 10 contexts
        if (errorData.contexts.length > 10) {
            errorData.contexts = errorData.contexts.slice(-10);
        }

        // Add to error metrics
        this.addMetric('errors', {
            timestamp: new Date(),
            error: errorKey,
            context,
            stack: error.stack
        });
    }

    /**
     * Add metric to storage
     */
    addMetric(type, metric) {
        if (!this.metrics[type]) {
            this.metrics[type] = [];
        }

        this.metrics[type].push(metric);

        // Maintain retention limit
        if (this.metrics[type].length > this.maxMetricsRetention) {
            this.metrics[type] = this.metrics[type].slice(-this.maxMetricsRetention);
        }
    }

    /**
     * Add alert
     */
    addAlert(alert) {
        this.alerts.push(alert);

        // Keep only last 100 alerts
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }

        this.logger.warn(`🚨 Alert: ${alert.message}`);
    }

    /**
     * Get latest metrics
     */
    getLatestMetrics() {
        const latest = {};

        for (const [type, metrics] of Object.entries(this.metrics)) {
            if (metrics.length > 0) {
                latest[type] = metrics[metrics.length - 1];
            }
        }

        return latest;
    }

    /**
     * Get system status summary
     */
    getSystemStatus() {
        const uptime = this.startTime ? Date.now() - this.startTime.getTime() : 0;
        const latestMetrics = this.getLatestMetrics();

        return {
            status: this.isMonitoring ? 'running' : 'stopped',
            uptime,
            startTime: this.startTime,
            components: this.componentHealth,
            metrics: latestMetrics,
            performance: {
                requests: this.performanceData.requests,
                operations: Object.fromEntries(this.performanceData.operations),
                errors: Object.fromEntries(this.performanceData.errors)
            },
            alerts: this.alerts.slice(-10) // Last 10 alerts
        };
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats() {
        const stats = {
            operations: {},
            errors: {},
            system: {}
        };

        // Operation statistics
        for (const [operation, data] of this.performanceData.operations) {
            stats.operations[operation] = {
                ...data,
                successRate: data.count > 0 ? (data.successCount / data.count) * 100 : 0
            };
        }

        // Error statistics
        for (const [error, data] of this.performanceData.errors) {
            stats.errors[error] = data;
        }

        // System statistics
        if (this.metrics.system.length > 0) {
            const recentMetrics = this.metrics.system.slice(-10);
            stats.system = {
                avgCpuUsage: recentMetrics.reduce((sum, m) => sum + (m.cpu?.percent || 0), 0) / recentMetrics.length,
                avgMemoryUsage: recentMetrics.reduce((sum, m) => sum + (m.memory?.system?.percent || 0), 0) / recentMetrics.length,
                dataPoints: recentMetrics.length
            };
        }

        return stats;
    }

    /**
     * Get current system metrics
     * @returns {Object} Current metrics snapshot
     */
    getCurrentMetrics() {
        return {
            timestamp: Date.now(),
            system: this.systemMetrics,
            performance: this.performanceMetrics,
            health: this.healthStatus,
            uptime: process.uptime()
        };
    }

    /**
     * Alias for getCurrentMetrics for backward compatibility
     * @returns {Object} Current metrics snapshot
     */
    getMetrics() {
        return this.getCurrentMetrics();
    }

    /**
     * Stop monitoring
     */
    async stop() {
        try {
            this.logger.info('🔄 Stopping system monitoring...');

            // Clear intervals
            if (this.metricsInterval) {
                clearInterval(this.metricsInterval);
                this.metricsInterval = null;
            }

            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }

            if (this.alertCheckInterval) {
                clearInterval(this.alertCheckInterval);
                this.alertCheckInterval = null;
            }

            this.isMonitoring = false;
            this.logger.info('✅ System monitoring stopped');

        } catch (error) {
            this.logger.error('❌ Error stopping system monitoring:', error);
            throw error;
        }
    }
}

module.exports = SystemMonitor;