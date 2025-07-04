/**
 * Perception Layer
 * 
 * The first layer of the cognitive brain that processes raw input data
 * and converts it into structured information for higher-level processing.
 * Handles sensory input, pattern recognition, and initial data filtering.
 */

const EventEmitter = require('events');
const Logger = require('../core/utils/logger');

class PerceptionLayer extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            maxInputSize: 1024 * 1024, // 1MB
            enablePatternRecognition: true,
            enableNoiseFiltering: true,
            enableDataValidation: true,
            processingTimeout: 5000, // 5 seconds
            ...config
        };
        
        this.logger = new Logger('PerceptionLayer');
        
        // Input processors for different data types
        this.processors = {
            text: this.processTextInput.bind(this),
            image: this.processImageInput.bind(this),
            audio: this.processAudioInput.bind(this),
            json: this.processJsonInput.bind(this),
            binary: this.processBinaryInput.bind(this)
        };
        
        // Pattern recognition patterns
        this.patterns = {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
            phone: /^[\+]?[1-9][\d]{0,15}$/,
            date: /^\d{4}-\d{2}-\d{2}$/,
            time: /^\d{2}:\d{2}(:\d{2})?$/,
            number: /^-?\d+(\.\d+)?$/,
            ipAddress: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
        };
        
        // Processing statistics
        this.stats = {
            totalInputs: 0,
            processedInputs: 0,
            failedInputs: 0,
            averageProcessingTime: 0,
            patternsDetected: 0,
            noiseFiltered: 0
        };
        
        // Initialize layer
        this.initialize();
    }
    
    /**
     * Initialize the perception layer
     */
    async initialize() {
        try {
            this.logger.info('Initializing Perception Layer...');
            
            // Load any pre-trained models or configurations
            await this.loadModels();
            
            // Set up event listeners
            this.setupEventListeners();
            
            this.logger.info('Perception Layer initialized successfully');
            this.emit('initialized');
            
        } catch (error) {
            this.logger.error('Failed to initialize Perception Layer:', error);
            this.emit('error', error);
            throw error;
        }
    }
    
    /**
     * Load perception models and configurations
     */
    async loadModels() {
        // In a real implementation, this would load ML models
        // for pattern recognition, noise filtering, etc.
        this.logger.debug('Loading perception models...');
        
        // Simulate model loading
        await new Promise(resolve => setTimeout(resolve, 100));
        
        this.logger.debug('Perception models loaded');
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        this.on('input', this.processInput.bind(this));
        this.on('error', (error) => {
            this.logger.error('Perception Layer error:', error);
        });
    }
    
    /**
     * Process incoming input data
     */
    async processInput(inputData, metadata = {}) {
        const startTime = Date.now();
        this.stats.totalInputs++;
        
        try {
            // Validate input
            this.validateInput(inputData, metadata);
            
            // Determine input type
            const inputType = this.detectInputType(inputData, metadata);
            
            // Apply noise filtering if enabled
            let filteredData = inputData;
            if (this.config.enableNoiseFiltering) {
                filteredData = await this.filterNoise(inputData, inputType);
            }
            
            // Process based on input type
            const processor = this.processors[inputType] || this.processors.text;
            const processedData = await processor(filteredData, metadata);
            
            // Apply pattern recognition if enabled
            let patterns = [];
            if (this.config.enablePatternRecognition) {
                patterns = await this.recognizePatterns(processedData, inputType);
            }
            
            // Create perception result
            const result = {
                originalInput: inputData,
                processedData,
                inputType,
                patterns,
                metadata: {
                    ...metadata,
                    processingTime: Date.now() - startTime,
                    timestamp: new Date().toISOString(),
                    layerVersion: '1.0.0'
                },
                confidence: this.calculateConfidence(processedData, patterns)
            };
            
            this.stats.processedInputs++;
            this.stats.averageProcessingTime = 
                (this.stats.averageProcessingTime * (this.stats.processedInputs - 1) + 
                 (Date.now() - startTime)) / this.stats.processedInputs;
            
            this.logger.debug(`Input processed successfully in ${Date.now() - startTime}ms`);
            this.emit('processed', result);
            
            return result;
            
        } catch (error) {
            this.stats.failedInputs++;
            this.logger.error('Failed to process input:', error);
            this.emit('processingError', error, inputData);
            throw error;
        }
    }
    
    /**
     * Validate input data
     */
    validateInput(inputData, metadata) {
        if (!this.config.enableDataValidation) {
            return;
        }
        
        // Check input size
        const inputSize = this.getInputSize(inputData);
        if (inputSize > this.config.maxInputSize) {
            throw new Error(`Input size (${inputSize}) exceeds maximum allowed size (${this.config.maxInputSize})`);
        }
        
        // Check for null or undefined
        if (inputData === null || inputData === undefined) {
            throw new Error('Input data cannot be null or undefined');
        }
        
        // Additional validation based on metadata
        if (metadata.expectedType && typeof inputData !== metadata.expectedType) {
            throw new Error(`Expected input type ${metadata.expectedType}, got ${typeof inputData}`);
        }
    }
    
    /**
     * Detect input data type
     */
    detectInputType(inputData, metadata) {
        // Use metadata hint if available
        if (metadata.type) {
            return metadata.type;
        }
        
        // Auto-detect based on data characteristics
        if (typeof inputData === 'string') {
            // Check for JSON
            try {
                JSON.parse(inputData);
                return 'json';
            } catch (e) {
                // Check for base64 encoded data
                if (this.isBase64(inputData)) {
                    return 'binary';
                }
                return 'text';
            }
        } else if (typeof inputData === 'object') {
            return 'json';
        } else if (Buffer.isBuffer(inputData)) {
            // Check for image signatures
            if (this.isImageBuffer(inputData)) {
                return 'image';
            }
            // Check for audio signatures
            if (this.isAudioBuffer(inputData)) {
                return 'audio';
            }
            return 'binary';
        }
        
        return 'text';
    }
    
    /**
     * Filter noise from input data
     */
    async filterNoise(inputData, inputType) {
        switch (inputType) {
            case 'text':
                return this.filterTextNoise(inputData);
            case 'json':
                return this.filterJsonNoise(inputData);
            case 'image':
                return this.filterImageNoise(inputData);
            case 'audio':
                return this.filterAudioNoise(inputData);
            default:
                return inputData;
        }
    }
    
    /**
     * Filter noise from text input
     */
    filterTextNoise(text) {
        if (typeof text !== 'string') {
            return text;
        }
        
        let filtered = text;
        
        // Remove excessive whitespace
        filtered = filtered.replace(/\s+/g, ' ').trim();
        
        // Remove control characters (except newlines and tabs)
        filtered = filtered.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        // Remove repeated punctuation
        filtered = filtered.replace(/([.!?]){3,}/g, '$1$1$1');
        
        this.stats.noiseFiltered++;
        return filtered;
    }
    
    /**
     * Filter noise from JSON input
     */
    filterJsonNoise(jsonData) {
        try {
            const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            
            // Remove null values and empty strings
            const filtered = this.removeEmptyValues(parsed);
            
            this.stats.noiseFiltered++;
            return filtered;
            
        } catch (error) {
            return jsonData;
        }
    }
    
    /**
     * Process text input
     */
    async processTextInput(text, metadata) {
        const result = {
            content: text,
            length: text.length,
            wordCount: text.split(/\s+/).length,
            language: this.detectLanguage(text),
            encoding: 'utf-8',
            structure: this.analyzeTextStructure(text)
        };
        
        return result;
    }
    
    /**
     * Process JSON input
     */
    async processJsonInput(jsonData, metadata) {
        const parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        
        const result = {
            content: parsed,
            structure: this.analyzeJsonStructure(parsed),
            size: JSON.stringify(parsed).length,
            keys: this.extractJsonKeys(parsed),
            depth: this.calculateJsonDepth(parsed)
        };
        
        return result;
    }
    
    /**
     * Process image input
     */
    async processImageInput(imageData, metadata) {
        // Basic image processing
        const result = {
            content: imageData,
            format: this.detectImageFormat(imageData),
            size: this.getInputSize(imageData),
            metadata: this.extractImageMetadata(imageData)
        };
        
        return result;
    }
    
    /**
     * Process audio input
     */
    async processAudioInput(audioData, metadata) {
        // Basic audio processing
        const result = {
            content: audioData,
            format: this.detectAudioFormat(audioData),
            size: this.getInputSize(audioData),
            metadata: this.extractAudioMetadata(audioData)
        };
        
        return result;
    }
    
    /**
     * Process binary input
     */
    async processBinaryInput(binaryData, metadata) {
        const result = {
            content: binaryData,
            size: this.getInputSize(binaryData),
            encoding: 'binary',
            hash: this.calculateHash(binaryData)
        };
        
        return result;
    }
    
    /**
     * Recognize patterns in processed data
     */
    async recognizePatterns(processedData, inputType) {
        const patterns = [];
        
        if (inputType === 'text' && typeof processedData.content === 'string') {
            const text = processedData.content;
            
            // Check for known patterns
            for (const [patternName, regex] of Object.entries(this.patterns)) {
                const matches = text.match(regex);
                if (matches) {
                    patterns.push({
                        type: patternName,
                        value: matches[0],
                        confidence: 0.9,
                        position: text.indexOf(matches[0])
                    });
                    this.stats.patternsDetected++;
                }
            }
        }
        
        return patterns;
    }
    
    /**
     * Calculate confidence score for processed data
     */
    calculateConfidence(processedData, patterns) {
        let confidence = 0.5; // Base confidence
        
        // Increase confidence based on successful processing
        if (processedData && processedData.content) {
            confidence += 0.2;
        }
        
        // Increase confidence based on pattern recognition
        if (patterns && patterns.length > 0) {
            confidence += Math.min(patterns.length * 0.1, 0.3);
        }
        
        return Math.min(confidence, 1.0);
    }
    
    // Utility methods
    
    getInputSize(data) {
        if (typeof data === 'string') {
            return Buffer.byteLength(data, 'utf8');
        } else if (Buffer.isBuffer(data)) {
            return data.length;
        } else if (typeof data === 'object') {
            return Buffer.byteLength(JSON.stringify(data), 'utf8');
        }
        return 0;
    }
    
    isBase64(str) {
        try {
            return Buffer.from(str, 'base64').toString('base64') === str;
        } catch (err) {
            return false;
        }
    }
    
    isImageBuffer(buffer) {
        // Check for common image file signatures
        const signatures = {
            jpg: [0xFF, 0xD8, 0xFF],
            png: [0x89, 0x50, 0x4E, 0x47],
            gif: [0x47, 0x49, 0x46],
            bmp: [0x42, 0x4D]
        };
        
        for (const [format, signature] of Object.entries(signatures)) {
            if (buffer.length >= signature.length) {
                const match = signature.every((byte, index) => buffer[index] === byte);
                if (match) return true;
            }
        }
        
        return false;
    }
    
    isAudioBuffer(buffer) {
        // Check for common audio file signatures
        const signatures = {
            mp3: [0x49, 0x44, 0x33], // ID3
            wav: [0x52, 0x49, 0x46, 0x46], // RIFF
            ogg: [0x4F, 0x67, 0x67, 0x53] // OggS
        };
        
        for (const [format, signature] of Object.entries(signatures)) {
            if (buffer.length >= signature.length) {
                const match = signature.every((byte, index) => buffer[index] === byte);
                if (match) return true;
            }
        }
        
        return false;
    }
    
    detectLanguage(text) {
        // Simple language detection (in production, use a proper library)
        const patterns = {
            english: /^[a-zA-Z\s.,!?;:"'()\-]+$/,
            chinese: /[\u4e00-\u9fff]/,
            japanese: /[\u3040-\u309f\u30a0-\u30ff]/,
            korean: /[\uac00-\ud7af]/,
            arabic: /[\u0600-\u06ff]/,
            russian: /[\u0400-\u04ff]/
        };
        
        for (const [lang, pattern] of Object.entries(patterns)) {
            if (pattern.test(text)) {
                return lang;
            }
        }
        
        return 'unknown';
    }
    
    analyzeTextStructure(text) {
        return {
            sentences: text.split(/[.!?]+/).length - 1,
            paragraphs: text.split(/\n\s*\n/).length,
            lines: text.split('\n').length,
            hasMarkdown: /[#*_`\[\]()]/.test(text),
            hasHtml: /<[^>]+>/.test(text)
        };
    }
    
    analyzeJsonStructure(obj) {
        return {
            type: Array.isArray(obj) ? 'array' : 'object',
            keys: Object.keys(obj).length,
            hasNestedObjects: this.hasNestedObjects(obj),
            hasArrays: this.hasArrays(obj)
        };
    }
    
    extractJsonKeys(obj, prefix = '') {
        const keys = [];
        
        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            keys.push(fullKey);
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                keys.push(...this.extractJsonKeys(value, fullKey));
            }
        }
        
        return keys;
    }
    
    calculateJsonDepth(obj, currentDepth = 0) {
        if (typeof obj !== 'object' || obj === null) {
            return currentDepth;
        }
        
        let maxDepth = currentDepth;
        
        for (const value of Object.values(obj)) {
            if (typeof value === 'object' && value !== null) {
                const depth = this.calculateJsonDepth(value, currentDepth + 1);
                maxDepth = Math.max(maxDepth, depth);
            }
        }
        
        return maxDepth;
    }
    
    hasNestedObjects(obj) {
        return Object.values(obj).some(value => 
            typeof value === 'object' && value !== null && !Array.isArray(value)
        );
    }
    
    hasArrays(obj) {
        return Object.values(obj).some(value => Array.isArray(value));
    }
    
    removeEmptyValues(obj) {
        if (Array.isArray(obj)) {
            return obj.filter(item => item !== null && item !== undefined && item !== '')
                     .map(item => typeof item === 'object' ? this.removeEmptyValues(item) : item);
        } else if (typeof obj === 'object' && obj !== null) {
            const filtered = {};
            for (const [key, value] of Object.entries(obj)) {
                if (value !== null && value !== undefined && value !== '') {
                    filtered[key] = typeof value === 'object' ? this.removeEmptyValues(value) : value;
                }
            }
            return filtered;
        }
        return obj;
    }
    
    detectImageFormat(imageData) {
        // Simple format detection based on file signatures
        if (Buffer.isBuffer(imageData)) {
            if (imageData[0] === 0xFF && imageData[1] === 0xD8) return 'jpeg';
            if (imageData[0] === 0x89 && imageData[1] === 0x50) return 'png';
            if (imageData[0] === 0x47 && imageData[1] === 0x49) return 'gif';
            if (imageData[0] === 0x42 && imageData[1] === 0x4D) return 'bmp';
        }
        return 'unknown';
    }
    
    detectAudioFormat(audioData) {
        // Simple format detection based on file signatures
        if (Buffer.isBuffer(audioData)) {
            if (audioData[0] === 0x49 && audioData[1] === 0x44) return 'mp3';
            if (audioData[0] === 0x52 && audioData[1] === 0x49) return 'wav';
            if (audioData[0] === 0x4F && audioData[1] === 0x67) return 'ogg';
        }
        return 'unknown';
    }
    
    extractImageMetadata(imageData) {
        // Basic metadata extraction (in production, use proper image libraries)
        return {
            format: this.detectImageFormat(imageData),
            size: this.getInputSize(imageData)
        };
    }
    
    extractAudioMetadata(audioData) {
        // Basic metadata extraction (in production, use proper audio libraries)
        return {
            format: this.detectAudioFormat(audioData),
            size: this.getInputSize(audioData)
        };
    }
    
    calculateHash(data) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(data).digest('hex');
    }
    
    /**
     * Get processing statistics
     */
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.totalInputs > 0 ? 
                (this.stats.processedInputs / this.stats.totalInputs * 100).toFixed(2) + '%' : '0%'
        };
    }
    
    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalInputs: 0,
            processedInputs: 0,
            failedInputs: 0,
            averageProcessingTime: 0,
            patternsDetected: 0,
            noiseFiltered: 0
        };
    }
    
    /**
     * Shutdown the perception layer
     */
    async shutdown() {
        this.logger.info('Shutting down Perception Layer...');
        this.removeAllListeners();
        this.logger.info('Perception Layer shutdown complete');
    }
}

module.exports = PerceptionLayer;