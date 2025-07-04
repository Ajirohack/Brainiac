const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * Memory Layer - Manages information storage, retrieval, and context maintenance
 * Handles short-term, long-term, and working memory operations
 */
class MemoryLayer extends EventEmitter {
    constructor(config = {}, logger) {
        super();

        this.config = {
            enabled: true,
            processing_time: 200,
            memory_types: ['working', 'short_term', 'long_term', 'episodic'],
            working_memory_capacity: 7, // Miller's rule: 7±2 items
            short_term_duration: 30000, // 30 seconds
            long_term_threshold: 0.8, // Importance threshold for long-term storage
            episodic_retention: 100, // Number of episodes to retain
            enable_forgetting: true,
            forgetting_curve_factor: 0.1,
            consolidation_interval: 60000, // 1 minute
            persistence_enabled: true,
            memory_file: 'memory_store.json',
            ...config
        };

        this.logger = logger || console;
        this.isInitialized = false;

        // Memory stores
        this.workingMemory = new Map(); // Current active information
        this.shortTermMemory = new Map(); // Recent information with timestamps
        this.longTermMemory = new Map(); // Important persistent information
        this.episodicMemory = []; // Sequence of experiences/events
        this.semanticMemory = new Map(); // Factual knowledge and concepts

        // Memory management
        this.memoryIndex = new Map(); // Cross-reference index
        this.accessPatterns = new Map(); // Track access frequency
        this.consolidationQueue = [];

        // Timers
        this.consolidationTimer = null;
        this.forgettingTimer = null;

        // Statistics
        this.stats = {
            totalMemories: 0,
            workingMemoryUsage: 0,
            shortTermCount: 0,
            longTermCount: 0,
            episodicCount: 0,
            semanticCount: 0,
            retrievalCount: 0,
            storageCount: 0,
            consolidationCount: 0,
            forgettingCount: 0,
            averageRetrievalTime: 0
        };
    }

    /**
     * Initialize the memory layer
     */
    async initialize() {
        try {
            if (!this.config.enabled) {
                this.logger.info('🧠 Memory Layer is disabled');
                return;
            }

            this.logger.info('🧠 Initializing Memory Layer...');

            // Load persistent memory if enabled
            if (this.config.persistence_enabled) {
                await this.loadMemoryFromDisk();
            }

            // Start memory management processes
            this.startConsolidationProcess();

            if (this.config.enable_forgetting) {
                this.startForgettingProcess();
            }

            this.isInitialized = true;
            this.logger.info('✅ Memory Layer initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Memory Layer:', error);
            throw error;
        }
    }

    /**
     * Process memory operations
     */
    async process(input, context = {}) {
        try {
            if (!this.isInitialized || !this.config.enabled) {
                return {
                    success: false,
                    error: 'Memory layer not initialized or disabled'
                };
            }

            const startTime = Date.now();

            this.logger.debug('🧠 Processing memory operations...');

            // Parse memory operation
            const operation = this.parseMemoryOperation(input, context);

            let result;
            switch (operation.type) {
                case 'store':
                    result = await this.storeMemory(operation.data, operation.options);
                    break;
                case 'retrieve':
                    result = await this.retrieveMemory(operation.query, operation.options);
                    break;
                case 'update':
                    result = await this.updateMemory(operation.id, operation.data, operation.options);
                    break;
                case 'forget':
                    result = await this.forgetMemory(operation.id, operation.options);
                    break;
                case 'consolidate':
                    result = await this.consolidateMemories(operation.options);
                    break;
                case 'search':
                    result = await this.searchMemories(operation.query, operation.options);
                    break;
                default:
                    // Default: store input as episodic memory and retrieve relevant context
                    result = await this.processDefaultMemoryOperation(input, context);
            }

            const processingTime = Date.now() - startTime;

            // Update statistics
            this.updateStats(operation.type, processingTime);

            this.logger.debug(`✅ Memory processing completed in ${processingTime}ms`);

            return {
                success: true,
                result,
                processingTime,
                memoryStats: this.getMemoryStats()
            };

        } catch (error) {
            this.logger.error('❌ Memory processing failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Parse memory operation from input
     */
    parseMemoryOperation(input, context) {
        // Check if explicit memory operation is specified
        if (context.memoryOperation) {
            return context.memoryOperation;
        }

        // Analyze input to determine operation type
        const inputStr = typeof input === 'string' ? input.toLowerCase() : JSON.stringify(input).toLowerCase();

        if (inputStr.includes('remember') || inputStr.includes('store')) {
            return {
                type: 'store',
                data: input,
                options: context.memoryOptions || {}
            };
        }

        if (inputStr.includes('recall') || inputStr.includes('retrieve')) {
            return {
                type: 'retrieve',
                query: input,
                options: context.memoryOptions || {}
            };
        }

        if (inputStr.includes('forget') || inputStr.includes('delete')) {
            return {
                type: 'forget',
                id: context.memoryId,
                options: context.memoryOptions || {}
            };
        }

        if (inputStr.includes('search') || inputStr.includes('find')) {
            return {
                type: 'search',
                query: input,
                options: context.memoryOptions || {}
            };
        }

        // Default operation
        return {
            type: 'default',
            data: input,
            options: context.memoryOptions || {}
        };
    }

    /**
     * Store memory with appropriate type classification
     */
    async storeMemory(data, options = {}) {
        try {
            const memoryItem = this.createMemoryItem(data, options);

            // Determine memory type based on importance and options
            const memoryType = this.classifyMemoryType(memoryItem, options);

            // Store in appropriate memory system
            switch (memoryType) {
                case 'working':
                    this.storeInWorkingMemory(memoryItem);
                    break;
                case 'short_term':
                    this.storeInShortTermMemory(memoryItem);
                    break;
                case 'long_term':
                    this.storeInLongTermMemory(memoryItem);
                    break;
                case 'episodic':
                    this.storeInEpisodicMemory(memoryItem);
                    break;
                case 'semantic':
                    this.storeInSemanticMemory(memoryItem);
                    break;
            }

            // Update index
            this.updateMemoryIndex(memoryItem);

            this.stats.storageCount++;
            this.stats.totalMemories++;

            this.logger.debug(`💾 Stored memory in ${memoryType}: ${memoryItem.id}`);

            return {
                id: memoryItem.id,
                type: memoryType,
                timestamp: memoryItem.timestamp
            };

        } catch (error) {
            this.logger.error('❌ Memory storage failed:', error);
            throw error;
        }
    }

    /**
     * Retrieve memory by query or ID
     */
    async retrieveMemory(query, options = {}) {
        try {
            const startTime = Date.now();

            let results = [];

            // Search in different memory systems based on options
            const searchSystems = options.systems || ['working', 'short_term', 'long_term', 'episodic', 'semantic'];

            for (const system of searchSystems) {
                const systemResults = await this.searchMemorySystem(system, query, options);
                results = results.concat(systemResults);
            }

            // Sort by relevance and recency
            results.sort((a, b) => {
                const relevanceScore = (b.relevance || 0) - (a.relevance || 0);
                if (Math.abs(relevanceScore) > 0.1) {
                    return relevanceScore;
                }
                return new Date(b.timestamp) - new Date(a.timestamp);
            });

            // Limit results
            const limit = options.limit || 10;
            results = results.slice(0, limit);

            // Update access patterns
            for (const result of results) {
                this.updateAccessPattern(result.id);
            }

            const retrievalTime = Date.now() - startTime;
            this.stats.retrievalCount++;
            this.stats.averageRetrievalTime =
                (this.stats.averageRetrievalTime * (this.stats.retrievalCount - 1) + retrievalTime) /
                this.stats.retrievalCount;

            this.logger.debug(`🔍 Retrieved ${results.length} memories in ${retrievalTime}ms`);

            return results;

        } catch (error) {
            this.logger.error('❌ Memory retrieval failed:', error);
            throw error;
        }
    }

    /**
     * Create memory item with metadata
     */
    createMemoryItem(data, options = {}) {
        const id = options.id || this.generateMemoryId();
        const timestamp = new Date().toISOString();

        return {
            id,
            content: data,
            timestamp,
            importance: options.importance || this.calculateImportance(data),
            tags: options.tags || this.extractTags(data),
            context: options.context || {},
            source: options.source || 'unknown',
            accessCount: 0,
            lastAccessed: timestamp,
            metadata: options.metadata || {}
        };
    }

    /**
     * Classify memory type based on content and options
     */
    classifyMemoryType(memoryItem, options = {}) {
        // Explicit type specification
        if (options.type && this.config.memory_types.includes(options.type)) {
            return options.type;
        }

        // Automatic classification
        if (memoryItem.importance >= this.config.long_term_threshold) {
            return 'long_term';
        }

        if (this.isFactualKnowledge(memoryItem.content)) {
            return 'semantic';
        }

        if (this.isExperienceOrEvent(memoryItem.content)) {
            return 'episodic';
        }

        if (this.workingMemory.size < this.config.working_memory_capacity) {
            return 'working';
        }

        return 'short_term';
    }

    /**
     * Store in working memory
     */
    storeInWorkingMemory(memoryItem) {
        // Manage capacity
        if (this.workingMemory.size >= this.config.working_memory_capacity) {
            // Remove least recently used item
            const oldestKey = this.findOldestMemory(this.workingMemory);
            if (oldestKey) {
                const oldItem = this.workingMemory.get(oldestKey);
                this.workingMemory.delete(oldestKey);

                // Move to short-term memory
                this.storeInShortTermMemory(oldItem);
            }
        }

        this.workingMemory.set(memoryItem.id, memoryItem);
        this.stats.workingMemoryUsage = this.workingMemory.size;
    }

    /**
     * Store in short-term memory
     */
    storeInShortTermMemory(memoryItem) {
        this.shortTermMemory.set(memoryItem.id, memoryItem);
        this.stats.shortTermCount = this.shortTermMemory.size;

        // Schedule for potential consolidation
        this.consolidationQueue.push(memoryItem.id);
    }

    /**
     * Store in long-term memory
     */
    storeInLongTermMemory(memoryItem) {
        this.longTermMemory.set(memoryItem.id, memoryItem);
        this.stats.longTermCount = this.longTermMemory.size;
    }

    /**
     * Store in episodic memory
     */
    storeInEpisodicMemory(memoryItem) {
        this.episodicMemory.push(memoryItem);

        // Maintain capacity
        if (this.episodicMemory.length > this.config.episodic_retention) {
            this.episodicMemory.shift();
        }

        this.stats.episodicCount = this.episodicMemory.length;
    }

    /**
     * Store in semantic memory
     */
    storeInSemanticMemory(memoryItem) {
        // Use content-based key for semantic memory
        const semanticKey = this.generateSemanticKey(memoryItem.content);
        this.semanticMemory.set(semanticKey, memoryItem);
        this.stats.semanticCount = this.semanticMemory.size;
    }

    /**
     * Search specific memory system
     */
    async searchMemorySystem(system, query, options = {}) {
        const results = [];
        let memoryStore;

        switch (system) {
            case 'working':
                memoryStore = this.workingMemory;
                break;
            case 'short_term':
                memoryStore = this.shortTermMemory;
                break;
            case 'long_term':
                memoryStore = this.longTermMemory;
                break;
            case 'semantic':
                memoryStore = this.semanticMemory;
                break;
            case 'episodic':
                return this.searchEpisodicMemory(query, options);
            default:
                return results;
        }

        for (const [id, memory] of memoryStore) {
            const relevance = this.calculateRelevance(memory, query);
            if (relevance > (options.threshold || 0.3)) {
                results.push({
                    ...memory,
                    relevance,
                    system
                });
            }
        }

        return results;
    }

    /**
     * Search episodic memory
     */
    searchEpisodicMemory(query, options = {}) {
        const results = [];

        for (const memory of this.episodicMemory) {
            const relevance = this.calculateRelevance(memory, query);
            if (relevance > (options.threshold || 0.3)) {
                results.push({
                    ...memory,
                    relevance,
                    system: 'episodic'
                });
            }
        }

        return results;
    }

    /**
     * Calculate relevance score between memory and query
     */
    calculateRelevance(memory, query) {
        const queryStr = typeof query === 'string' ? query.toLowerCase() : JSON.stringify(query).toLowerCase();
        const contentStr = typeof memory.content === 'string' ?
            memory.content.toLowerCase() :
            JSON.stringify(memory.content).toLowerCase();

        // Simple keyword matching (can be enhanced with semantic similarity)
        const queryWords = queryStr.split(/\s+/).filter(word => word.length > 2);
        const contentWords = contentStr.split(/\s+/);

        let matches = 0;
        for (const queryWord of queryWords) {
            if (contentWords.some(contentWord => contentWord.includes(queryWord))) {
                matches++;
            }
        }

        const baseRelevance = queryWords.length > 0 ? matches / queryWords.length : 0;

        // Boost relevance based on importance and recency
        const importanceBoost = (memory.importance || 0.5) * 0.2;
        const recencyBoost = this.calculateRecencyBoost(memory.timestamp) * 0.1;
        const accessBoost = Math.min((memory.accessCount || 0) / 10, 0.1);

        return Math.min(baseRelevance + importanceBoost + recencyBoost + accessBoost, 1.0);
    }

    /**
     * Calculate importance score for content
     */
    calculateImportance(content) {
        // Simple heuristics for importance calculation
        let importance = 0.5; // Base importance

        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

        // Length factor
        if (contentStr.length > 200) importance += 0.1;
        if (contentStr.length > 500) importance += 0.1;

        // Keyword-based importance
        const importantKeywords = ['important', 'critical', 'urgent', 'remember', 'key', 'essential'];
        for (const keyword of importantKeywords) {
            if (contentStr.toLowerCase().includes(keyword)) {
                importance += 0.1;
            }
        }

        // Structure factor (objects/arrays might be more important)
        if (typeof content === 'object') {
            importance += 0.1;
        }

        return Math.min(importance, 1.0);
    }

    /**
     * Extract tags from content
     */
    extractTags(content) {
        const tags = [];
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

        // Simple tag extraction based on keywords
        const tagPatterns = {
            'question': /\?|what|how|why|when|where|who/i,
            'task': /task|todo|action|do|complete/i,
            'fact': /is|are|was|were|fact|true|false/i,
            'emotion': /feel|emotion|happy|sad|angry|excited/i,
            'time': /today|tomorrow|yesterday|now|later|time/i,
            'location': /here|there|place|location|where/i
        };

        for (const [tag, pattern] of Object.entries(tagPatterns)) {
            if (pattern.test(contentStr)) {
                tags.push(tag);
            }
        }

        return tags;
    }

    /**
     * Check if content represents factual knowledge
     */
    isFactualKnowledge(content) {
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        const factualPatterns = [
            /is|are|was|were/,
            /definition|meaning|concept/,
            /fact|truth|reality/,
            /always|never|typically/
        ];

        return factualPatterns.some(pattern => pattern.test(contentStr.toLowerCase()));
    }

    /**
     * Check if content represents an experience or event
     */
    isExperienceOrEvent(content) {
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        const experiencePatterns = [
            /happened|occurred|experienced/,
            /yesterday|today|last|ago/,
            /went|came|saw|did|said/,
            /event|meeting|conversation/
        ];

        return experiencePatterns.some(pattern => pattern.test(contentStr.toLowerCase()));
    }

    /**
     * Process default memory operation
     */
    async processDefaultMemoryOperation(input, context) {
        // Store input as episodic memory
        const storeResult = await this.storeMemory(input, {
            type: 'episodic',
            context,
            source: 'input'
        });

        // Retrieve relevant context
        const relevantMemories = await this.retrieveMemory(input, {
            limit: 5,
            threshold: 0.4
        });

        return {
            stored: storeResult,
            context: relevantMemories,
            workingMemory: Array.from(this.workingMemory.values())
        };
    }

    /**
     * Start memory consolidation process
     */
    startConsolidationProcess() {
        this.consolidationTimer = setInterval(() => {
            this.performConsolidation();
        }, this.config.consolidation_interval);
    }

    /**
     * Perform memory consolidation
     */
    async performConsolidation() {
        try {
            const now = new Date();
            const consolidatedCount = 0;

            // Process consolidation queue
            while (this.consolidationQueue.length > 0) {
                const memoryId = this.consolidationQueue.shift();
                const memory = this.shortTermMemory.get(memoryId);

                if (!memory) continue;

                const age = now - new Date(memory.timestamp);

                // Check if memory should be consolidated to long-term
                if (this.shouldConsolidateToLongTerm(memory, age)) {
                    this.shortTermMemory.delete(memoryId);
                    this.storeInLongTermMemory(memory);
                    this.stats.consolidationCount++;

                    this.logger.debug(`🔄 Consolidated memory to long-term: ${memoryId}`);
                }
                // Check if memory should be forgotten
                else if (age > this.config.short_term_duration && memory.importance < 0.3) {
                    this.shortTermMemory.delete(memoryId);
                    this.stats.forgettingCount++;

                    this.logger.debug(`🗑️ Forgot short-term memory: ${memoryId}`);
                }
            }

            this.stats.shortTermCount = this.shortTermMemory.size;

        } catch (error) {
            this.logger.error('❌ Memory consolidation error:', error);
        }
    }

    /**
     * Check if memory should be consolidated to long-term
     */
    shouldConsolidateToLongTerm(memory, age) {
        // High importance memories
        if (memory.importance >= this.config.long_term_threshold) {
            return true;
        }

        // Frequently accessed memories
        if (memory.accessCount >= 3) {
            return true;
        }

        // Memories with specific tags
        if (memory.tags && memory.tags.includes('important')) {
            return true;
        }

        return false;
    }

    /**
     * Start forgetting process
     */
    startForgettingProcess() {
        this.forgettingTimer = setInterval(() => {
            this.performForgetting();
        }, this.config.consolidation_interval * 2);
    }

    /**
     * Perform memory forgetting based on forgetting curve
     */
    async performForgetting() {
        try {
            const now = new Date();

            // Apply forgetting to short-term memory
            for (const [id, memory] of this.shortTermMemory) {
                const age = now - new Date(memory.timestamp);
                const forgettingProbability = this.calculateForgettingProbability(memory, age);

                if (Math.random() < forgettingProbability) {
                    this.shortTermMemory.delete(id);
                    this.stats.forgettingCount++;

                    this.logger.debug(`🌫️ Forgot memory due to forgetting curve: ${id}`);
                }
            }

            this.stats.shortTermCount = this.shortTermMemory.size;

        } catch (error) {
            this.logger.error('❌ Forgetting process error:', error);
        }
    }

    /**
     * Calculate forgetting probability based on Ebbinghaus forgetting curve
     */
    calculateForgettingProbability(memory, age) {
        const ageInHours = age / (1000 * 60 * 60);
        const importance = memory.importance || 0.5;
        const accessCount = memory.accessCount || 0;

        // Base forgetting curve: R = e^(-t/S)
        // Where R is retention, t is time, S is strength
        const strength = importance * (1 + accessCount * 0.1);
        const retention = Math.exp(-ageInHours * this.config.forgetting_curve_factor / strength);

        return 1 - retention;
    }

    /**
     * Update memory index for cross-referencing
     */
    updateMemoryIndex(memoryItem) {
        // Index by tags
        for (const tag of memoryItem.tags || []) {
            if (!this.memoryIndex.has(tag)) {
                this.memoryIndex.set(tag, new Set());
            }
            this.memoryIndex.get(tag).add(memoryItem.id);
        }

        // Index by content keywords
        const keywords = this.extractKeywords(memoryItem.content);
        for (const keyword of keywords) {
            if (!this.memoryIndex.has(keyword)) {
                this.memoryIndex.set(keyword, new Set());
            }
            this.memoryIndex.get(keyword).add(memoryItem.id);
        }
    }

    /**
     * Extract keywords from content
     */
    extractKeywords(content) {
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        const words = contentStr.toLowerCase()
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3);

        // Remove common stop words
        const stopWords = new Set(['this', 'that', 'with', 'have', 'will', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time']);

        return words.filter(word => !stopWords.has(word)).slice(0, 10);
    }

    /**
     * Update access pattern for memory
     */
    updateAccessPattern(memoryId) {
        const pattern = this.accessPatterns.get(memoryId) || {
            count: 0,
            lastAccess: null,
            frequency: 0
        };

        pattern.count++;
        pattern.lastAccess = new Date();
        pattern.frequency = pattern.count / ((Date.now() - new Date(pattern.lastAccess || Date.now())) / (1000 * 60 * 60 * 24) + 1);

        this.accessPatterns.set(memoryId, pattern);

        // Update memory access count
        const updateMemoryAccess = (memoryStore) => {
            const memory = memoryStore.get(memoryId);
            if (memory) {
                memory.accessCount = (memory.accessCount || 0) + 1;
                memory.lastAccessed = new Date().toISOString();
            }
        };

        updateMemoryAccess(this.workingMemory);
        updateMemoryAccess(this.shortTermMemory);
        updateMemoryAccess(this.longTermMemory);
        updateMemoryAccess(this.semanticMemory);
    }

    /**
     * Calculate recency boost for relevance scoring
     */
    calculateRecencyBoost(timestamp) {
        const age = Date.now() - new Date(timestamp).getTime();
        const ageInHours = age / (1000 * 60 * 60);

        // Exponential decay: more recent = higher boost
        return Math.exp(-ageInHours / 24); // 24-hour half-life
    }

    /**
     * Find oldest memory in a memory store
     */
    findOldestMemory(memoryStore) {
        let oldestKey = null;
        let oldestTime = Date.now();

        for (const [key, memory] of memoryStore) {
            const timestamp = new Date(memory.lastAccessed || memory.timestamp).getTime();
            if (timestamp < oldestTime) {
                oldestTime = timestamp;
                oldestKey = key;
            }
        }

        return oldestKey;
    }

    /**
     * Generate unique memory ID
     */
    generateMemoryId() {
        return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate semantic key for content
     */
    generateSemanticKey(content) {
        const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
        const keywords = this.extractKeywords(contentStr);
        return keywords.slice(0, 3).sort().join('_');
    }

    /**
     * Update statistics
     */
    updateStats(operationType, processingTime) {
        switch (operationType) {
            case 'store':
                this.stats.storageCount++;
                break;
            case 'retrieve':
            case 'search':
                this.stats.retrievalCount++;
                this.stats.averageRetrievalTime =
                    (this.stats.averageRetrievalTime * (this.stats.retrievalCount - 1) + processingTime) /
                    this.stats.retrievalCount;
                break;
        }
    }

    /**
     * Get memory statistics
     */
    getMemoryStats() {
        return {
            ...this.stats,
            memoryDistribution: {
                working: this.workingMemory.size,
                shortTerm: this.shortTermMemory.size,
                longTerm: this.longTermMemory.size,
                episodic: this.episodicMemory.length,
                semantic: this.semanticMemory.size
            },
            indexSize: this.memoryIndex.size,
            accessPatternsTracked: this.accessPatterns.size
        };
    }

    /**
     * Load memory from disk
     */
    async loadMemoryFromDisk() {
        try {
            const memoryPath = path.join(process.cwd(), this.config.memory_file);

            try {
                const data = await fs.readFile(memoryPath, 'utf8');
                const memoryData = JSON.parse(data);

                // Restore memory stores
                if (memoryData.longTermMemory) {
                    this.longTermMemory = new Map(memoryData.longTermMemory);
                }

                if (memoryData.semanticMemory) {
                    this.semanticMemory = new Map(memoryData.semanticMemory);
                }

                if (memoryData.episodicMemory) {
                    this.episodicMemory = memoryData.episodicMemory;
                }

                this.logger.info('📁 Memory loaded from disk successfully');

            } catch (fileError) {
                if (fileError.code !== 'ENOENT') {
                    throw fileError;
                }
                this.logger.info('📁 No existing memory file found, starting fresh');
            }

        } catch (error) {
            this.logger.error('❌ Failed to load memory from disk:', error);
        }
    }

    /**
     * Save memory to disk
     */
    async saveMemoryToDisk() {
        try {
            if (!this.config.persistence_enabled) return;

            const memoryData = {
                longTermMemory: Array.from(this.longTermMemory.entries()),
                semanticMemory: Array.from(this.semanticMemory.entries()),
                episodicMemory: this.episodicMemory,
                timestamp: new Date().toISOString()
            };

            const memoryPath = path.join(process.cwd(), this.config.memory_file);
            await fs.writeFile(memoryPath, JSON.stringify(memoryData, null, 2));

            this.logger.debug('💾 Memory saved to disk');

        } catch (error) {
            this.logger.error('❌ Failed to save memory to disk:', error);
        }
    }

    /**
     * Get layer status
     */
    getStatus() {
        return {
            name: 'Memory Layer',
            enabled: this.config.enabled,
            initialized: this.isInitialized,
            memoryStats: this.getMemoryStats(),
            configuration: {
                workingMemoryCapacity: this.config.working_memory_capacity,
                shortTermDuration: this.config.short_term_duration,
                longTermThreshold: this.config.long_term_threshold,
                episodicRetention: this.config.episodic_retention,
                forgettingEnabled: this.config.enable_forgetting,
                persistenceEnabled: this.config.persistence_enabled
            }
        };
    }

    /**
     * Shutdown the memory layer
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Memory Layer...');

            // Stop timers
            if (this.consolidationTimer) {
                clearInterval(this.consolidationTimer);
            }

            if (this.forgettingTimer) {
                clearInterval(this.forgettingTimer);
            }

            // Save memory to disk
            await this.saveMemoryToDisk();

            this.isInitialized = false;
            this.logger.info('✅ Memory Layer shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Memory Layer shutdown:', error);
            throw error;
        }
    }
}

module.exports = MemoryLayer;