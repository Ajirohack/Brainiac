/**
 * Logger Utility - Centralized logging system for the CAI Platform
 * 
 * Provides structured logging with different levels, formatting, and output options
 */

const fs = require('fs').promises;
const path = require('path');
const util = require('util');

class Logger {
    constructor(component = 'CAI-Platform', options = {}) {
        this.component = component;
        this.level = options.level || process.env.LOG_LEVEL || 'info';
        this.format = options.format || 'text'; // 'text' or 'json'
        this.logToFile = options.logToFile !== false;
        this.logToConsole = options.logToConsole !== false;
        this.logDir = options.logDir || 'logs';
        this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
        this.maxFiles = options.maxFiles || 5;

        // Log levels with numeric values for comparison
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            trace: 4
        };

        // Color codes for console output
        this.colors = {
            error: '\x1b[31m', // Red
            warn: '\x1b[33m',  // Yellow
            info: '\x1b[36m',  // Cyan
            debug: '\x1b[35m', // Magenta
            trace: '\x1b[37m', // White
            reset: '\x1b[0m'   // Reset
        };

        // Emoji indicators
        this.emojis = {
            error: '❌',
            warn: '⚠️',
            info: 'ℹ️',
            debug: '🔍',
            trace: '📝'
        };

        this.initializeLogDirectory();
    }

    async initializeLogDirectory() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
            await fs.mkdir(path.join(this.logDir, 'system'), { recursive: true });
            await fs.mkdir(path.join(this.logDir, 'errors'), { recursive: true });
            await fs.mkdir(path.join(this.logDir, 'performance'), { recursive: true });
        } catch (error) {
            console.error('Failed to create log directories:', error);
        }
    }

    /**
     * Check if a log level should be output
     */
    shouldLog(level) {
        return this.levels[level] <= this.levels[this.level];
    }

    /**
     * Format log message
     */
    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            component: this.component,
            message: typeof message === 'string' ? message : util.inspect(message),
            ...meta
        };

        if (this.format === 'json') {
            return JSON.stringify(logEntry);
        }

        // Text format
        const emoji = this.emojis[level] || '';
        const color = this.colors[level] || '';
        const reset = this.colors.reset;

        let formatted = `${timestamp} ${emoji} [${level.toUpperCase()}] [${this.component}] ${message}`;

        if (Object.keys(meta).length > 0) {
            formatted += ` ${util.inspect(meta, { colors: false, compact: true })}`;
        }

        return this.logToConsole ? `${color}${formatted}${reset}` : formatted;
    }

    /**
     * Write log to file
     */
    async writeToFile(level, formattedMessage) {
        if (!this.logToFile) return;

        try {
            const logFile = this.getLogFileName(level);
            const logPath = path.join(this.logDir, logFile);

            // Check file size and rotate if necessary
            await this.rotateLogIfNeeded(logPath);

            await fs.appendFile(logPath, formattedMessage + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    /**
     * Get log file name based on level and date
     */
    getLogFileName(level) {
        const date = new Date().toISOString().split('T')[0];

        if (level === 'error') {
            return `errors/error-${date}.log`;
        } else if (level === 'debug' || level === 'trace') {
            return `system/debug-${date}.log`;
        } else {
            return `system/app-${date}.log`;
        }
    }

    /**
     * Rotate log file if it exceeds max size
     */
    async rotateLogIfNeeded(logPath) {
        try {
            const stats = await fs.stat(logPath);

            if (stats.size > this.maxFileSize) {
                // Rotate existing files
                for (let i = this.maxFiles - 1; i > 0; i--) {
                    const oldFile = `${logPath}.${i}`;
                    const newFile = `${logPath}.${i + 1}`;

                    try {
                        await fs.rename(oldFile, newFile);
                    } catch (error) {
                        // File doesn't exist, continue
                    }
                }

                // Move current file to .1
                await fs.rename(logPath, `${logPath}.1`);
            }
        } catch (error) {
            // File doesn't exist yet, no rotation needed
        }
    }

    /**
     * Core logging method
     */
    async log(level, message, meta = {}) {
        if (!this.shouldLog(level)) return;

        const formattedMessage = this.formatMessage(level, message, meta);

        // Console output
        if (this.logToConsole) {
            console.log(formattedMessage);
        }

        // File output
        await this.writeToFile(level, formattedMessage.replace(/\x1b\[[0-9;]*m/g, ''));
    }

    /**
     * Error level logging
     */
    error(message, meta = {}) {
        return this.log('error', message, meta);
    }

    /**
     * Warning level logging
     */
    warn(message, meta = {}) {
        return this.log('warn', message, meta);
    }

    /**
     * Info level logging
     */
    info(message, meta = {}) {
        return this.log('info', message, meta);
    }

    /**
     * Debug level logging
     */
    debug(message, meta = {}) {
        return this.log('debug', message, meta);
    }

    /**
     * Trace level logging
     */
    trace(message, meta = {}) {
        return this.log('trace', message, meta);
    }

    /**
     * Performance logging
     */
    async performance(operation, duration, meta = {}) {
        const perfMessage = `Performance: ${operation} completed in ${duration}ms`;
        await this.info(perfMessage, { ...meta, performance: true, duration });

        // Also write to performance log
        if (this.logToFile) {
            const perfLogPath = path.join(this.logDir, 'performance', `perf-${new Date().toISOString().split('T')[0]}.log`);
            const perfEntry = {
                timestamp: new Date().toISOString(),
                operation,
                duration,
                ...meta
            };

            try {
                await fs.appendFile(perfLogPath, JSON.stringify(perfEntry) + '\n');
            } catch (error) {
                console.error('Failed to write performance log:', error);
            }
        }
    }

    /**
     * Create a child logger with additional context
     */
    child(additionalComponent, options = {}) {
        const childComponent = `${this.component}:${additionalComponent}`;
        return new Logger(childComponent, {
            level: this.level,
            format: this.format,
            logToFile: this.logToFile,
            logToConsole: this.logToConsole,
            logDir: this.logDir,
            ...options
        });
    }

    /**
     * Set log level dynamically
     */
    setLevel(level) {
        if (this.levels.hasOwnProperty(level)) {
            this.level = level;
            this.info(`Log level changed to: ${level}`);
        } else {
            this.warn(`Invalid log level: ${level}. Valid levels: ${Object.keys(this.levels).join(', ')}`);
        }
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return {
            component: this.component,
            level: this.level,
            format: this.format,
            logToFile: this.logToFile,
            logToConsole: this.logToConsole,
            logDir: this.logDir
        };
    }
}

module.exports = Logger;