/**
 * Tool Agent - External Tool Integration and API Management
 * 
 * The Tool Agent specializes in:
 * - External API integration and management
 * - Tool discovery and selection
 * - API call orchestration and optimization
 * - Error handling and retry mechanisms
 * - Tool performance monitoring
 */

const EventEmitter = require('events');
const Logger = require('../../core/utils/logger');
const axios = require('axios');

class ToolAgent extends EventEmitter {
    constructor(config, memoryManager) {
        super();
        this.config = config;
        this.memoryManager = memoryManager;
        this.logger = new Logger('ToolAgent');
        
        // Tool registry and management
        this.toolRegistry = new Map();
        this.toolCategories = new Map();
        this.toolCapabilities = new Map();
        
        // API clients and connections
        this.apiClients = new Map();
        this.connectionPool = new Map();
        this.rateLimiters = new Map();
        
        // Tool execution engine
        this.executionEngine = null;
        this.orchestrator = null;
        this.errorHandler = null;
        
        // Performance monitoring
        this.performanceMonitor = null;
        this.healthChecker = null;
        this.usageTracker = null;
        
        // Security and authentication
        this.authManager = null;
        this.securityValidator = null;
        this.accessController = null;
        
        // Configuration thresholds
        this.maxRetries = config.max_retries || 3;
        this.timeoutMs = config.timeout_ms || 30000;
        this.rateLimitWindow = config.rate_limit_window || 60000;
        this.maxConcurrentCalls = config.max_concurrent_calls || 10;
        
        // Performance tracking
        this.stats = {
            totalToolCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            retriedCalls: 0,
            averageResponseTime: 0,
            totalResponseTime: 0,
            toolUsageDistribution: {},
            categoryUsageDistribution: {},
            errorDistribution: {},
            performanceMetrics: {
                fastest_call: Infinity,
                slowest_call: 0,
                success_rate: 0,
                retry_rate: 0
            }
        };
        
        this.isInitialized = false;
    }

    /**
     * Initialize the Tool Agent
     */
    async initialize() {
        try {
            this.logger.info('🔧 Initializing Tool Agent...');
            
            // Initialize tool registry
            await this.initializeToolRegistry();
            
            // Setup tool categories
            await this.setupToolCategories();
            
            // Initialize API clients
            await this.initializeAPIClients();
            
            // Setup execution engine
            await this.setupExecutionEngine();
            
            // Initialize performance monitoring
            await this.initializePerformanceMonitoring();
            
            // Setup security and authentication
            await this.setupSecurityAndAuth();
            
            // Initialize rate limiters
            await this.initializeRateLimiters();
            
            // Setup error handling
            await this.setupErrorHandling();
            
            this.isInitialized = true;
            this.logger.info('✅ Tool Agent initialized successfully');
            
        } catch (error) {
            this.logger.error('❌ Failed to initialize Tool Agent:', error);
            throw error;
        }
    }

    /**
     * Initialize tool registry
     */
    async initializeToolRegistry() {
        this.logger.info('📋 Initializing tool registry...');
        
        // Web search tools
        this.toolRegistry.set('google_search', {
            name: 'Google Search API',
            category: 'search',
            description: 'Search the web using Google Search API',
            capabilities: ['web_search', 'real_time_data', 'comprehensive_results'],
            endpoint: 'https://www.googleapis.com/customsearch/v1',
            auth_type: 'api_key',
            rate_limit: { requests: 100, window: 86400000 }, // 100 requests per day
            cost_per_call: 0.005,
            reliability: 0.98,
            response_time_avg: 500
        });
        
        this.toolRegistry.set('bing_search', {
            name: 'Bing Search API',
            category: 'search',
            description: 'Search the web using Bing Search API',
            capabilities: ['web_search', 'news_search', 'image_search'],
            endpoint: 'https://api.bing.microsoft.com/v7.0/search',
            auth_type: 'subscription_key',
            rate_limit: { requests: 1000, window: 86400000 },
            cost_per_call: 0.003,
            reliability: 0.96,
            response_time_avg: 400
        });
        
        // Knowledge and reference tools
        this.toolRegistry.set('wikipedia', {
            name: 'Wikipedia API',
            category: 'knowledge',
            description: 'Access Wikipedia articles and information',
            capabilities: ['encyclopedia_search', 'article_content', 'free_access'],
            endpoint: 'https://en.wikipedia.org/api/rest_v1',
            auth_type: 'none',
            rate_limit: { requests: 5000, window: 3600000 }, // 5000 requests per hour
            cost_per_call: 0,
            reliability: 0.99,
            response_time_avg: 300
        });
        
        this.toolRegistry.set('wolfram_alpha', {
            name: 'Wolfram Alpha API',
            category: 'computation',
            description: 'Computational knowledge engine',
            capabilities: ['mathematical_computation', 'data_analysis', 'factual_queries'],
            endpoint: 'https://api.wolframalpha.com/v2/query',
            auth_type: 'app_id',
            rate_limit: { requests: 2000, window: 86400000 },
            cost_per_call: 0.01,
            reliability: 0.97,
            response_time_avg: 800
        });
        
        // News and current events
        this.toolRegistry.set('news_api', {
            name: 'News API',
            category: 'news',
            description: 'Access current news articles and headlines',
            capabilities: ['current_news', 'historical_news', 'source_filtering'],
            endpoint: 'https://newsapi.org/v2',
            auth_type: 'api_key',
            rate_limit: { requests: 1000, window: 86400000 },
            cost_per_call: 0.002,
            reliability: 0.95,
            response_time_avg: 600
        });
        
        // Weather and environmental data
        this.toolRegistry.set('openweather', {
            name: 'OpenWeather API',
            category: 'weather',
            description: 'Weather data and forecasts',
            capabilities: ['current_weather', 'weather_forecast', 'historical_weather'],
            endpoint: 'https://api.openweathermap.org/data/2.5',
            auth_type: 'api_key',
            rate_limit: { requests: 1000, window: 3600000 },
            cost_per_call: 0.001,
            reliability: 0.98,
            response_time_avg: 200
        });
        
        // Translation and language tools
        this.toolRegistry.set('google_translate', {
            name: 'Google Translate API',
            category: 'language',
            description: 'Text translation between languages',
            capabilities: ['text_translation', 'language_detection', 'multiple_languages'],
            endpoint: 'https://translation.googleapis.com/language/translate/v2',
            auth_type: 'api_key',
            rate_limit: { requests: 100000, window: 86400000 },
            cost_per_call: 0.00002,
            reliability: 0.99,
            response_time_avg: 300
        });
        
        // Financial and market data
        this.toolRegistry.set('alpha_vantage', {
            name: 'Alpha Vantage API',
            category: 'finance',
            description: 'Financial market data and analysis',
            capabilities: ['stock_prices', 'market_data', 'financial_indicators'],
            endpoint: 'https://www.alphavantage.co/query',
            auth_type: 'api_key',
            rate_limit: { requests: 5, window: 60000 }, // 5 requests per minute
            cost_per_call: 0,
            reliability: 0.94,
            response_time_avg: 1000
        });
        
        // Code and development tools
        this.toolRegistry.set('github_api', {
            name: 'GitHub API',
            category: 'development',
            description: 'Access GitHub repositories and data',
            capabilities: ['repository_search', 'code_search', 'issue_tracking'],
            endpoint: 'https://api.github.com',
            auth_type: 'token',
            rate_limit: { requests: 5000, window: 3600000 },
            cost_per_call: 0,
            reliability: 0.99,
            response_time_avg: 400
        });
        
        // AI and ML services
        this.toolRegistry.set('huggingface', {
            name: 'Hugging Face API',
            category: 'ai_ml',
            description: 'Access AI models and inference',
            capabilities: ['model_inference', 'nlp_tasks', 'computer_vision'],
            endpoint: 'https://api-inference.huggingface.co',
            auth_type: 'bearer_token',
            rate_limit: { requests: 1000, window: 3600000 },
            cost_per_call: 0.001,
            reliability: 0.96,
            response_time_avg: 2000
        });
        
        this.logger.info(`✅ Initialized ${this.toolRegistry.size} tools in registry`);
    }

    /**
     * Setup tool categories
     */
    async setupToolCategories() {
        this.logger.info('📂 Setting up tool categories...');
        
        this.toolCategories.set('search', {
            name: 'Search Tools',
            description: 'Web search and information retrieval',
            priority: 1,
            use_cases: ['information_gathering', 'fact_checking', 'research'],
            tools: ['google_search', 'bing_search']
        });
        
        this.toolCategories.set('knowledge', {
            name: 'Knowledge Tools',
            description: 'Access to knowledge bases and encyclopedias',
            priority: 2,
            use_cases: ['factual_information', 'educational_content', 'reference'],
            tools: ['wikipedia', 'wolfram_alpha']
        });
        
        this.toolCategories.set('news', {
            name: 'News Tools',
            description: 'Current events and news information',
            priority: 3,
            use_cases: ['current_events', 'news_analysis', 'trend_monitoring'],
            tools: ['news_api']
        });
        
        this.toolCategories.set('weather', {
            name: 'Weather Tools',
            description: 'Weather data and environmental information',
            priority: 4,
            use_cases: ['weather_forecasts', 'climate_data', 'environmental_monitoring'],
            tools: ['openweather']
        });
        
        this.toolCategories.set('language', {
            name: 'Language Tools',
            description: 'Translation and language processing',
            priority: 5,
            use_cases: ['translation', 'language_detection', 'multilingual_support'],
            tools: ['google_translate']
        });
        
        this.toolCategories.set('finance', {
            name: 'Financial Tools',
            description: 'Financial market data and analysis',
            priority: 6,
            use_cases: ['market_analysis', 'financial_data', 'investment_research'],
            tools: ['alpha_vantage']
        });
        
        this.toolCategories.set('development', {
            name: 'Development Tools',
            description: 'Software development and code-related tools',
            priority: 7,
            use_cases: ['code_search', 'repository_analysis', 'development_support'],
            tools: ['github_api']
        });
        
        this.toolCategories.set('ai_ml', {
            name: 'AI/ML Tools',
            description: 'Artificial intelligence and machine learning services',
            priority: 8,
            use_cases: ['model_inference', 'ai_tasks', 'ml_processing'],
            tools: ['huggingface']
        });
        
        this.toolCategories.set('computation', {
            name: 'Computation Tools',
            description: 'Mathematical and computational services',
            priority: 9,
            use_cases: ['calculations', 'data_analysis', 'mathematical_queries'],
            tools: ['wolfram_alpha']
        });
        
        this.logger.info(`✅ Setup ${this.toolCategories.size} tool categories`);
    }

    /**
     * Initialize API clients
     */
    async initializeAPIClients() {
        this.logger.info('🔌 Initializing API clients...');
        
        // Create HTTP client with default configuration
        const defaultClient = axios.create({
            timeout: this.timeoutMs,
            headers: {
                'User-Agent': 'Brainiac-CAI-Platform/1.0',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        // Add request interceptor for logging
        defaultClient.interceptors.request.use(
            (config) => {
                this.logger.debug(`🔄 API Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                this.logger.error('❌ API Request Error:', error);
                return Promise.reject(error);
            }
        );
        
        // Add response interceptor for logging and error handling
        defaultClient.interceptors.response.use(
            (response) => {
                this.logger.debug(`✅ API Response: ${response.status} ${response.config.url}`);
                return response;
            },
            (error) => {
                this.logger.error(`❌ API Response Error: ${error.response?.status} ${error.config?.url}`);
                return Promise.reject(error);
            }
        );
        
        this.apiClients.set('default', defaultClient);
        
        // Create specialized clients for different tool types
        for (const [toolId, tool] of this.toolRegistry) {
            const client = axios.create({
                baseURL: tool.endpoint,
                timeout: this.timeoutMs,
                headers: {
                    'User-Agent': 'Brainiac-CAI-Platform/1.0',
                    'Accept': 'application/json'
                }
            });
            
            this.apiClients.set(toolId, client);
        }
        
        this.logger.info(`✅ Initialized ${this.apiClients.size} API clients`);
    }

    /**
     * Setup execution engine
     */
    async setupExecutionEngine() {
        this.logger.info('⚙️ Setting up execution engine...');
        
        this.executionEngine = {
            execution_strategies: {
                sequential: {
                    name: 'Sequential Execution',
                    description: 'Execute tools one after another',
                    use_case: 'When order matters or resources are limited'
                },
                parallel: {
                    name: 'Parallel Execution',
                    description: 'Execute multiple tools simultaneously',
                    use_case: 'When tools are independent and speed is important'
                },
                pipeline: {
                    name: 'Pipeline Execution',
                    description: 'Chain tools where output feeds into next tool',
                    use_case: 'When tools have dependencies'
                },
                conditional: {
                    name: 'Conditional Execution',
                    description: 'Execute tools based on conditions',
                    use_case: 'When execution depends on previous results'
                }
            },
            retry_strategies: {
                exponential_backoff: {
                    name: 'Exponential Backoff',
                    description: 'Increase delay exponentially between retries',
                    base_delay: 1000,
                    max_delay: 30000,
                    multiplier: 2
                },
                linear_backoff: {
                    name: 'Linear Backoff',
                    description: 'Increase delay linearly between retries',
                    base_delay: 1000,
                    increment: 1000
                },
                immediate: {
                    name: 'Immediate Retry',
                    description: 'Retry immediately without delay',
                    delay: 0
                }
            },
            circuit_breaker: {
                failure_threshold: 5,
                recovery_timeout: 60000,
                half_open_max_calls: 3
            }
        };
        
        this.orchestrator = {
            active_executions: new Map(),
            execution_queue: [],
            max_concurrent: this.maxConcurrentCalls,
            current_concurrent: 0
        };
        
        this.logger.info('✅ Execution engine setup complete');
    }

    /**
     * Initialize performance monitoring
     */
    async initializePerformanceMonitoring() {
        this.logger.info('📊 Initializing performance monitoring...');
        
        this.performanceMonitor = {
            metrics: {
                response_times: new Map(),
                success_rates: new Map(),
                error_rates: new Map(),
                throughput: new Map()
            },
            thresholds: {
                max_response_time: 10000,
                min_success_rate: 0.95,
                max_error_rate: 0.05
            },
            alerts: {
                enabled: true,
                channels: ['log', 'event']
            }
        };
        
        this.healthChecker = {
            check_interval: 300000, // 5 minutes
            health_endpoints: new Map(),
            last_check: new Map(),
            status: new Map()
        };
        
        this.usageTracker = {
            daily_usage: new Map(),
            monthly_usage: new Map(),
            cost_tracking: new Map(),
            quota_monitoring: new Map()
        };
        
        this.logger.info('✅ Performance monitoring initialized');
    }

    /**
     * Setup security and authentication
     */
    async setupSecurityAndAuth() {
        this.logger.info('🔐 Setting up security and authentication...');
        
        this.authManager = {
            credentials: new Map(),
            token_cache: new Map(),
            refresh_tokens: new Map(),
            auth_strategies: {
                api_key: this.handleAPIKeyAuth.bind(this),
                bearer_token: this.handleBearerTokenAuth.bind(this),
                oauth2: this.handleOAuth2Auth.bind(this),
                basic_auth: this.handleBasicAuth.bind(this)
            }
        };
        
        this.securityValidator = {
            input_sanitization: true,
            output_validation: true,
            rate_limit_enforcement: true,
            access_logging: true
        };
        
        this.accessController = {
            permissions: new Map(),
            role_based_access: true,
            audit_logging: true
        };
        
        // Load credentials from environment or config
        await this.loadCredentials();
        
        this.logger.info('✅ Security and authentication setup complete');
    }

    /**
     * Initialize rate limiters
     */
    async initializeRateLimiters() {
        this.logger.info('⏱️ Initializing rate limiters...');
        
        for (const [toolId, tool] of this.toolRegistry) {
            if (tool.rate_limit) {
                this.rateLimiters.set(toolId, {
                    requests: 0,
                    window_start: Date.now(),
                    max_requests: tool.rate_limit.requests,
                    window_size: tool.rate_limit.window,
                    queue: []
                });
            }
        }
        
        this.logger.info(`✅ Initialized ${this.rateLimiters.size} rate limiters`);
    }

    /**
     * Setup error handling
     */
    async setupErrorHandling() {
        this.logger.info('🚨 Setting up error handling...');
        
        this.errorHandler = {
            error_types: {
                network_error: {
                    retry: true,
                    max_retries: 3,
                    strategy: 'exponential_backoff'
                },
                rate_limit_error: {
                    retry: true,
                    max_retries: 5,
                    strategy: 'linear_backoff'
                },
                auth_error: {
                    retry: false,
                    action: 'refresh_credentials'
                },
                server_error: {
                    retry: true,
                    max_retries: 2,
                    strategy: 'exponential_backoff'
                },
                client_error: {
                    retry: false,
                    action: 'validate_input'
                }
            },
            fallback_strategies: {
                alternative_tool: 'Use alternative tool for same capability',
                cached_response: 'Return cached response if available',
                graceful_degradation: 'Provide limited functionality',
                error_response: 'Return structured error response'
            }
        };
        
        this.logger.info('✅ Error handling setup complete');
    }

    /**
     * Main processing method for tool operations
     */
    async process(input, context = {}) {
        if (!this.isInitialized) {
            throw new Error('Tool Agent not initialized');
        }
        
        const startTime = Date.now();
        const operationId = context.operationId || `tool_op_${Date.now()}`;
        
        try {
            this.logger.debug(`🔧 Processing tool request [${operationId}]`);
            
            // Analyze tool requirements
            const toolRequirements = await this.analyzeToolRequirements(input, context);
            
            // Select appropriate tools
            const selectedTools = await this.selectTools(toolRequirements, context);
            
            // Plan execution strategy
            const executionPlan = this.planExecution(selectedTools, toolRequirements);
            
            // Execute tools
            const executionResults = await this.executeTools(
                executionPlan, toolRequirements, context
            );
            
            // Process and aggregate results
            const aggregatedResults = await this.aggregateResults(
                executionResults, toolRequirements
            );
            
            // Validate and format output
            const formattedOutput = await this.formatToolOutput(
                aggregatedResults, toolRequirements
            );
            
            // Prepare tool output
            const toolOutput = {
                ...input,
                tool_execution: {
                    requirements: toolRequirements,
                    selected_tools: selectedTools.map(tool => tool.name),
                    execution_plan: executionPlan.strategy,
                    results: aggregatedResults,
                    performance_metrics: this.calculateExecutionMetrics(executionResults)
                },
                final_output: formattedOutput,
                success: aggregatedResults.success,
                tools_used: selectedTools.length,
                metadata: {
                    operation_id: operationId,
                    processing_time: Date.now() - startTime,
                    execution_strategy: executionPlan.strategy,
                    tools_executed: executionResults.length,
                    timestamp: new Date()
                }
            };
            
            // Update statistics
            this.updateStats(Date.now() - startTime, toolOutput);
            
            this.logger.debug(`✅ Tool processing completed [${operationId}] - Success: ${aggregatedResults.success}`);
            this.emit('tools_executed', toolOutput);
            
            return { output: toolOutput, metadata: toolOutput.metadata };
            
        } catch (error) {
            this.logger.error(`❌ Tool processing failed [${operationId}]:`, error);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Analyze tool requirements from input
     */
    async analyzeToolRequirements(input, context) {
        const requirements = {
            task_type: null,
            capabilities_needed: [],
            data_sources: [],
            output_format: 'json',
            priority: 'normal',
            constraints: {
                max_cost: context.max_cost || 1.0,
                max_time: context.max_time || 30000,
                preferred_tools: context.preferred_tools || [],
                excluded_tools: context.excluded_tools || []
            },
            quality_requirements: {
                accuracy: context.accuracy || 0.9,
                completeness: context.completeness || 0.8,
                freshness: context.freshness || 0.7
            }
        };

        // Analyze input content
        const content = input.content || input.query || input.text || '';
        const contentLower = content.toLowerCase();

        // Detect task type and required capabilities
        if (contentLower.includes('search') || contentLower.includes('find') || contentLower.includes('look up')) {
            requirements.task_type = 'search';
            requirements.capabilities_needed.push('web_search', 'information_retrieval');
        }

        if (contentLower.includes('weather') || contentLower.includes('temperature') || contentLower.includes('forecast')) {
            requirements.task_type = 'weather';
            requirements.capabilities_needed.push('weather_data', 'environmental_info');
        }

        if (contentLower.includes('translate') || contentLower.includes('translation')) {
            requirements.task_type = 'translation';
            requirements.capabilities_needed.push('text_translation', 'language_detection');
        }

        if (contentLower.includes('news') || contentLower.includes('current events')) {
            requirements.task_type = 'news';
            requirements.capabilities_needed.push('current_news', 'news_analysis');
        }

        if (contentLower.includes('calculate') || contentLower.includes('compute') || contentLower.includes('math')) {
            requirements.task_type = 'computation';
            requirements.capabilities_needed.push('mathematical_computation', 'data_analysis');
        }

        if (contentLower.includes('stock') || contentLower.includes('market') || contentLower.includes('finance')) {
            requirements.task_type = 'finance';
            requirements.capabilities_needed.push('market_data', 'financial_analysis');
        }

        // Default to search if no specific type detected
        if (!requirements.task_type) {
            requirements.task_type = 'search';
            requirements.capabilities_needed.push('web_search');
        }

        // Determine data sources based on requirements
        requirements.data_sources = this.identifyDataSources(requirements);

        return requirements;
    }

    /**
     * Select appropriate tools based on requirements
     */
    async selectTools(requirements, context) {
        const candidateTools = [];
        const selectedTools = [];

        // Find tools that match required capabilities
        for (const [toolId, tool] of this.toolRegistry) {
            if (this.toolMatchesRequirements(tool, requirements)) {
                candidateTools.push({ id: toolId, ...tool });
            }
        }

        // Sort candidates by suitability score
        candidateTools.sort((a, b) => {
            const scoreA = this.calculateToolSuitabilityScore(a, requirements);
            const scoreB = this.calculateToolSuitabilityScore(b, requirements);
            return scoreB - scoreA;
        });

        // Select best tools within constraints
        let totalCost = 0;
        for (const tool of candidateTools) {
            if (selectedTools.length >= 3) break; // Limit to 3 tools max
            if (totalCost + tool.cost_per_call > requirements.constraints.max_cost) continue;
            if (requirements.constraints.excluded_tools.includes(tool.id)) continue;

            selectedTools.push(tool);
            totalCost += tool.cost_per_call;
        }

        // Ensure at least one tool is selected
        if (selectedTools.length === 0 && candidateTools.length > 0) {
            selectedTools.push(candidateTools[0]);
        }

        return selectedTools;
    }

    /**
     * Plan execution strategy for selected tools
     */
    planExecution(selectedTools, requirements) {
        const plan = {
            strategy: 'sequential',
            tools: selectedTools,
            execution_order: [],
            parallel_groups: [],
            dependencies: new Map(),
            estimated_time: 0,
            estimated_cost: 0
        };

        // Calculate estimates
        plan.estimated_cost = selectedTools.reduce((sum, tool) => sum + tool.cost_per_call, 0);
        plan.estimated_time = selectedTools.reduce((sum, tool) => sum + tool.response_time_avg, 0);

        // Determine execution strategy
        if (selectedTools.length === 1) {
            plan.strategy = 'single';
            plan.execution_order = [selectedTools[0].id];
        } else if (this.canExecuteInParallel(selectedTools, requirements)) {
            plan.strategy = 'parallel';
            plan.parallel_groups = [selectedTools.map(tool => tool.id)];
            plan.estimated_time = Math.max(...selectedTools.map(tool => tool.response_time_avg));
        } else {
            plan.strategy = 'sequential';
            plan.execution_order = selectedTools.map(tool => tool.id);
        }

        return plan;
    }

    /**
     * Execute tools according to plan
     */
    async executeTools(executionPlan, requirements, context) {
        const results = [];
        const startTime = Date.now();

        try {
            if (executionPlan.strategy === 'parallel') {
                // Execute tools in parallel
                const promises = executionPlan.tools.map(tool => 
                    this.executeSingleTool(tool, requirements, context)
                );
                const parallelResults = await Promise.allSettled(promises);
                
                for (let i = 0; i < parallelResults.length; i++) {
                    const result = parallelResults[i];
                    if (result.status === 'fulfilled') {
                        results.push(result.value);
                    } else {
                        results.push({
                            tool_id: executionPlan.tools[i].id,
                            success: false,
                            error: result.reason,
                            execution_time: 0
                        });
                    }
                }
            } else {
                // Execute tools sequentially
                for (const tool of executionPlan.tools) {
                    try {
                        const result = await this.executeSingleTool(tool, requirements, context);
                        results.push(result);
                    } catch (error) {
                        results.push({
                            tool_id: tool.id,
                            success: false,
                            error: error.message,
                            execution_time: 0
                        });
                    }
                }
            }

            return results;

        } catch (error) {
            this.logger.error('❌ Tool execution failed:', error);
            throw error;
        }
    }

    /**
     * Execute a single tool
     */
    async executeSingleTool(tool, requirements, context) {
        const startTime = Date.now();
        const toolId = tool.id;

        try {
            // Check rate limits
            if (!this.checkRateLimit(toolId)) {
                throw new Error(`Rate limit exceeded for tool: ${toolId}`);
            }

            // Get API client
            const client = this.apiClients.get(toolId) || this.apiClients.get('default');

            // Prepare request
            const request = await this.prepareToolRequest(tool, requirements, context);

            // Execute with retry logic
            const response = await this.executeWithRetry(client, request, tool);

            // Process response
            const processedResult = await this.processToolResponse(response, tool, requirements);

            const executionTime = Date.now() - startTime;

            // Update rate limiter
            this.updateRateLimit(toolId);

            // Update tool usage stats
            this.updateToolUsageStats(toolId, executionTime, true);

            return {
                tool_id: toolId,
                tool_name: tool.name,
                success: true,
                data: processedResult,
                execution_time: executionTime,
                cost: tool.cost_per_call,
                metadata: {
                    request: request,
                    response_size: JSON.stringify(response.data).length,
                    timestamp: new Date()
                }
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.updateToolUsageStats(toolId, executionTime, false);
            
            this.logger.error(`❌ Tool execution failed [${toolId}]:`, error);
            
            return {
                tool_id: toolId,
                tool_name: tool.name,
                success: false,
                error: error.message,
                execution_time: executionTime,
                cost: 0
            };
        }
    }

    /**
     * Aggregate results from multiple tools
     */
    async aggregateResults(executionResults, requirements) {
        const aggregated = {
            success: false,
            data: {},
            sources: [],
            confidence: 0,
            completeness: 0,
            total_cost: 0,
            total_time: 0,
            successful_tools: 0,
            failed_tools: 0
        };

        // Calculate basic metrics
        for (const result of executionResults) {
            aggregated.total_cost += result.cost || 0;
            aggregated.total_time += result.execution_time || 0;
            
            if (result.success) {
                aggregated.successful_tools++;
                aggregated.sources.push(result.tool_name);
                
                // Merge data from successful tools
                if (result.data) {
                    aggregated.data[result.tool_id] = result.data;
                }
            } else {
                aggregated.failed_tools++;
            }
        }

        // Determine overall success
        aggregated.success = aggregated.successful_tools > 0;

        // Calculate confidence based on successful tools and their reliability
        if (aggregated.successful_tools > 0) {
            let totalReliability = 0;
            let reliabilityCount = 0;
            
            for (const result of executionResults) {
                if (result.success) {
                    const tool = this.toolRegistry.get(result.tool_id);
                    if (tool && tool.reliability) {
                        totalReliability += tool.reliability;
                        reliabilityCount++;
                    }
                }
            }
            
            aggregated.confidence = reliabilityCount > 0 ? totalReliability / reliabilityCount : 0.5;
        }

        // Calculate completeness
        aggregated.completeness = aggregated.successful_tools / executionResults.length;

        return aggregated;
    }

    /**
     * Format tool output for consumption
     */
    async formatToolOutput(aggregatedResults, requirements) {
        const formatted = {
            success: aggregatedResults.success,
            data: {},
            summary: '',
            sources: aggregatedResults.sources,
            confidence: aggregatedResults.confidence,
            metadata: {
                total_cost: aggregatedResults.total_cost,
                total_time: aggregatedResults.total_time,
                tools_used: aggregatedResults.successful_tools,
                completeness: aggregatedResults.completeness
            }
        };

        // Format data based on task type
        switch (requirements.task_type) {
            case 'search':
                formatted.data = this.formatSearchResults(aggregatedResults.data);
                formatted.summary = this.generateSearchSummary(formatted.data);
                break;
                
            case 'weather':
                formatted.data = this.formatWeatherResults(aggregatedResults.data);
                formatted.summary = this.generateWeatherSummary(formatted.data);
                break;
                
            case 'news':
                formatted.data = this.formatNewsResults(aggregatedResults.data);
                formatted.summary = this.generateNewsSummary(formatted.data);
                break;
                
            case 'translation':
                formatted.data = this.formatTranslationResults(aggregatedResults.data);
                formatted.summary = this.generateTranslationSummary(formatted.data);
                break;
                
            default:
                formatted.data = aggregatedResults.data;
                formatted.summary = 'Tool execution completed';
        }

        return formatted;
    }

    /**
     * Helper methods for tool management
     */
    
    toolMatchesRequirements(tool, requirements) {
        // Check if tool has required capabilities
        const hasRequiredCapabilities = requirements.capabilities_needed.some(capability => 
            tool.capabilities.includes(capability)
        );
        
        // Check if tool category matches task type
        const categoryMatches = tool.category === requirements.task_type;
        
        return hasRequiredCapabilities || categoryMatches;
    }

    calculateToolSuitabilityScore(tool, requirements) {
        let score = 0;
        
        // Capability match score (40%)
        const capabilityMatches = requirements.capabilities_needed.filter(capability => 
            tool.capabilities.includes(capability)
        ).length;
        score += (capabilityMatches / requirements.capabilities_needed.length) * 40;
        
        // Reliability score (25%)
        score += tool.reliability * 25;
        
        // Performance score (20%)
        const performanceScore = Math.max(0, 1 - (tool.response_time_avg / 5000)); // Normalize to 5s max
        score += performanceScore * 20;
        
        // Cost efficiency score (15%)
        const costScore = Math.max(0, 1 - (tool.cost_per_call / 0.1)); // Normalize to $0.1 max
        score += costScore * 15;
        
        return score;
    }

    canExecuteInParallel(tools, requirements) {
        // Check if tools can be executed in parallel
        // For now, assume all tools can be executed in parallel unless they have dependencies
        return tools.length > 1 && tools.length <= 3;
    }

    checkRateLimit(toolId) {
        const limiter = this.rateLimiters.get(toolId);
        if (!limiter) return true;
        
        const now = Date.now();
        
        // Reset window if needed
        if (now - limiter.window_start >= limiter.window_size) {
            limiter.requests = 0;
            limiter.window_start = now;
        }
        
        return limiter.requests < limiter.max_requests;
    }

    updateRateLimit(toolId) {
        const limiter = this.rateLimiters.get(toolId);
        if (limiter) {
            limiter.requests++;
        }
    }

    async prepareToolRequest(tool, requirements, context) {
        const request = {
            method: 'GET',
            url: tool.endpoint,
            headers: {},
            params: {},
            data: null
        };

        // Add authentication
        await this.addAuthentication(request, tool);

        // Add tool-specific parameters
        switch (tool.id) {
            case 'google_search':
                request.params = {
                    key: this.authManager.credentials.get('google_api_key'),
                    cx: this.authManager.credentials.get('google_search_engine_id'),
                    q: context.query || requirements.query || 'search query'
                };
                break;
                
            case 'wikipedia':
                request.url = `${tool.endpoint}/page/summary/${encodeURIComponent(context.query || 'search')}`;
                break;
                
            case 'openweather':
                request.params = {
                    appid: this.authManager.credentials.get('openweather_api_key'),
                    q: context.location || 'London',
                    units: 'metric'
                };
                request.url = `${tool.endpoint}/weather`;
                break;
                
            // Add more tool-specific configurations as needed
        }

        return request;
    }

    async executeWithRetry(client, request, tool) {
        let lastError;
        
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await client.request(request);
                return response;
            } catch (error) {
                lastError = error;
                
                if (attempt < this.maxRetries) {
                    const delay = this.calculateRetryDelay(attempt, error);
                    await this.sleep(delay);
                    this.stats.retriedCalls++;
                }
            }
        }
        
        throw lastError;
    }

    calculateRetryDelay(attempt, error) {
        // Exponential backoff with jitter
        const baseDelay = 1000;
        const maxDelay = 30000;
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = Math.random() * 0.1 * delay;
        return delay + jitter;
    }

    async processToolResponse(response, tool, requirements) {
        // Process response based on tool type
        switch (tool.id) {
            case 'google_search':
                return this.processGoogleSearchResponse(response.data);
            case 'wikipedia':
                return this.processWikipediaResponse(response.data);
            case 'openweather':
                return this.processWeatherResponse(response.data);
            default:
                return response.data;
        }
    }

    processGoogleSearchResponse(data) {
        if (!data.items) return { results: [] };
        
        return {
            results: data.items.map(item => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet,
                displayLink: item.displayLink
            })),
            searchInformation: data.searchInformation
        };
    }

    processWikipediaResponse(data) {
        return {
            title: data.title,
            extract: data.extract,
            url: data.content_urls?.desktop?.page,
            thumbnail: data.thumbnail?.source
        };
    }

    processWeatherResponse(data) {
        return {
            location: data.name,
            country: data.sys?.country,
            temperature: data.main?.temp,
            description: data.weather?.[0]?.description,
            humidity: data.main?.humidity,
            pressure: data.main?.pressure,
            windSpeed: data.wind?.speed
        };
    }

    // Format result methods
    formatSearchResults(data) {
        const results = [];
        for (const [toolId, toolData] of Object.entries(data)) {
            if (toolData.results) {
                results.push(...toolData.results);
            }
        }
        return { search_results: results };
    }

    formatWeatherResults(data) {
        const weatherData = Object.values(data)[0]; // Take first weather result
        return { weather: weatherData };
    }

    formatNewsResults(data) {
        const articles = [];
        for (const [toolId, toolData] of Object.entries(data)) {
            if (toolData.articles) {
                articles.push(...toolData.articles);
            }
        }
        return { news_articles: articles };
    }

    formatTranslationResults(data) {
        const translations = Object.values(data)[0]; // Take first translation result
        return { translation: translations };
    }

    // Summary generation methods
    generateSearchSummary(data) {
        const resultCount = data.search_results?.length || 0;
        return `Found ${resultCount} search results`;
    }

    generateWeatherSummary(data) {
        const weather = data.weather;
        if (!weather) return 'Weather data unavailable';
        return `Weather in ${weather.location}: ${weather.temperature}°C, ${weather.description}`;
    }

    generateNewsSummary(data) {
        const articleCount = data.news_articles?.length || 0;
        return `Retrieved ${articleCount} news articles`;
    }

    generateTranslationSummary(data) {
        return 'Translation completed successfully';
    }

    identifyDataSources(requirements) {
        const sources = [];
        
        switch (requirements.task_type) {
            case 'search':
                sources.push('web', 'search_engines');
                break;
            case 'weather':
                sources.push('weather_services', 'meteorological_data');
                break;
            case 'news':
                sources.push('news_apis', 'media_outlets');
                break;
            case 'knowledge':
                sources.push('encyclopedias', 'knowledge_bases');
                break;
            default:
                sources.push('web');
        }
        
        return sources;
    }

    calculateExecutionMetrics(executionResults) {
        const metrics = {
            total_tools: executionResults.length,
            successful_tools: 0,
            failed_tools: 0,
            average_execution_time: 0,
            total_cost: 0,
            success_rate: 0
        };

        let totalTime = 0;
        for (const result of executionResults) {
            if (result.success) {
                metrics.successful_tools++;
            } else {
                metrics.failed_tools++;
            }
            totalTime += result.execution_time || 0;
            metrics.total_cost += result.cost || 0;
        }

        metrics.average_execution_time = executionResults.length > 0 ? totalTime / executionResults.length : 0;
        metrics.success_rate = executionResults.length > 0 ? metrics.successful_tools / executionResults.length : 0;

        return metrics;
    }

    // Authentication methods
    async addAuthentication(request, tool) {
        const authStrategy = this.authManager.auth_strategies[tool.auth_type];
        if (authStrategy) {
            await authStrategy(request, tool);
        }
    }

    async handleAPIKeyAuth(request, tool) {
        const apiKey = this.authManager.credentials.get(`${tool.id}_api_key`);
        if (apiKey) {
            if (tool.id === 'google_search') {
                // API key goes in params for Google
                request.params.key = apiKey;
            } else {
                request.headers['X-API-Key'] = apiKey;
            }
        }
    }

    async handleBearerTokenAuth(request, tool) {
        const token = this.authManager.credentials.get(`${tool.id}_token`);
        if (token) {
            request.headers['Authorization'] = `Bearer ${token}`;
        }
    }

    async handleOAuth2Auth(request, tool) {
        // OAuth2 implementation would go here
        const token = this.authManager.token_cache.get(tool.id);
        if (token) {
            request.headers['Authorization'] = `Bearer ${token}`;
        }
    }

    async handleBasicAuth(request, tool) {
        const username = this.authManager.credentials.get(`${tool.id}_username`);
        const password = this.authManager.credentials.get(`${tool.id}_password`);
        if (username && password) {
            const auth = Buffer.from(`${username}:${password}`).toString('base64');
            request.headers['Authorization'] = `Basic ${auth}`;
        }
    }

    async loadCredentials() {
        // Load credentials from environment variables or config
        // This is a simplified version - in production, use secure credential storage
        
        const envCredentials = {
            'google_search_api_key': process.env.GOOGLE_SEARCH_API_KEY,
            'google_search_engine_id': process.env.GOOGLE_SEARCH_ENGINE_ID,
            'openweather_api_key': process.env.OPENWEATHER_API_KEY,
            'news_api_key': process.env.NEWS_API_KEY,
            'alpha_vantage_api_key': process.env.ALPHA_VANTAGE_API_KEY,
            'huggingface_token': process.env.HUGGINGFACE_TOKEN,
            'github_token': process.env.GITHUB_TOKEN
        };

        for (const [key, value] of Object.entries(envCredentials)) {
            if (value) {
                this.authManager.credentials.set(key, value);
            }
        }
    }

    updateToolUsageStats(toolId, executionTime, success) {
        // Update tool-specific stats
        if (!this.stats.toolUsageDistribution[toolId]) {
            this.stats.toolUsageDistribution[toolId] = {
                calls: 0,
                successes: 0,
                failures: 0,
                total_time: 0,
                average_time: 0
            };
        }

        const toolStats = this.stats.toolUsageDistribution[toolId];
        toolStats.calls++;
        toolStats.total_time += executionTime;
        toolStats.average_time = toolStats.total_time / toolStats.calls;

        if (success) {
            toolStats.successes++;
        } else {
            toolStats.failures++;
        }
    }

    updateStats(processingTime, output) {
        this.stats.totalToolCalls++;
        this.stats.totalResponseTime += processingTime;
        this.stats.averageResponseTime = this.stats.totalResponseTime / this.stats.totalToolCalls;

        if (output.success) {
            this.stats.successfulCalls++;
        } else {
            this.stats.failedCalls++;
        }

        // Update performance metrics
        this.stats.performanceMetrics.fastest_call = Math.min(
            this.stats.performanceMetrics.fastest_call, processingTime
        );
        this.stats.performanceMetrics.slowest_call = Math.max(
            this.stats.performanceMetrics.slowest_call, processingTime
        );
        this.stats.performanceMetrics.success_rate = this.stats.successfulCalls / this.stats.totalToolCalls;
        this.stats.performanceMetrics.retry_rate = this.stats.retriedCalls / this.stats.totalToolCalls;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get agent status
     */
    getStatus() {
        return {
            agent_type: 'ToolAgent',
            initialized: this.isInitialized,
            tools_registered: this.toolRegistry.size,
            categories_available: this.toolCategories.size,
            api_clients_active: this.apiClients.size,
            rate_limiters_active: this.rateLimiters.size,
            current_concurrent_executions: this.orchestrator?.current_concurrent || 0,
            max_concurrent_executions: this.maxConcurrentCalls,
            performance_metrics: this.stats.performanceMetrics,
            last_updated: new Date()
        };
    }

    /**
     * Get performance statistics
     */
    getStats() {
        return {
            ...this.stats,
            tool_registry_size: this.toolRegistry.size,
            category_count: this.toolCategories.size,
            active_rate_limiters: this.rateLimiters.size,
            uptime: this.isInitialized ? Date.now() - this.initTime : 0
        };
    }

    /**
     * Clear processing history
     */
    clearHistory() {
        // Reset statistics
        this.stats = {
            totalToolCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            retriedCalls: 0,
            averageResponseTime: 0,
            totalResponseTime: 0,
            toolUsageDistribution: {},
            categoryUsageDistribution: {},
            errorDistribution: {},
            performanceMetrics: {
                fastest_call: Infinity,
                slowest_call: 0,
                success_rate: 0,
                retry_rate: 0
            }
        };

        // Clear caches
        this.authManager?.token_cache?.clear();
        
        // Reset rate limiters
        for (const [toolId, limiter] of this.rateLimiters) {
            limiter.requests = 0;
            limiter.window_start = Date.now();
        }

        this.logger.info('🧹 Tool Agent history cleared');
    }

    /**
     * Shutdown the agent
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Tool Agent...');

            // Clear all active executions
            this.orchestrator?.active_executions?.clear();
            
            // Clear caches and connections
            this.authManager?.token_cache?.clear();
            this.authManager?.credentials?.clear();
            
            // Clear registries
            this.toolRegistry.clear();
            this.toolCategories.clear();
            this.apiClients.clear();
            this.rateLimiters.clear();

            // Reset state
            this.isInitialized = false;
            this.executionEngine = null;
            this.orchestrator = null;
            this.performanceMonitor = null;
            this.authManager = null;

            this.logger.info('✅ Tool Agent shutdown complete');

        } catch (error) {
            this.logger.error('❌ Error during Tool Agent shutdown:', error);
            throw error;
        }
    }
}

module.exports = ToolAgent;