const EventEmitter = require('events');

/**
 * Emotion Layer - Handles emotional processing, sentiment analysis, and affective computing
 * Manages emotional states, mood tracking, and emotional intelligence
 */
class EmotionLayer extends EventEmitter {
    constructor(config = {}, logger) {
        super();

        this.config = {
            enabled: true,
            processing_time: 150,
            emotion_model: 'plutchik', // plutchik, ekman, pam (Pleasure-Arousal-Dominance)
            sentiment_analysis: true,
            mood_tracking: true,
            emotional_memory: true,
            empathy_simulation: true,
            emotion_regulation: true,
            emotional_contagion: false,
            baseline_emotions: {
                joy: 0.3,
                trust: 0.4,
                fear: 0.1,
                surprise: 0.2,
                sadness: 0.1,
                disgust: 0.05,
                anger: 0.05,
                anticipation: 0.3
            },
            emotion_decay_rate: 0.1, // How quickly emotions fade
            mood_persistence: 0.8, // How long moods last
            empathy_threshold: 0.6,
            regulation_strategies: ['reappraisal', 'suppression', 'distraction', 'acceptance'],
            ...config
        };

        this.logger = logger || console;
        this.isInitialized = false;

        // Emotional state
        this.currentEmotions = new Map();
        this.currentMood = {
            valence: 0.5, // Positive/negative (0-1)
            arousal: 0.5, // Activation level (0-1)
            dominance: 0.5 // Control/power (0-1)
        };

        // Emotional history
        this.emotionalHistory = [];
        this.moodHistory = [];
        this.emotionalMemories = new Map();

        // Emotion processing components
        this.sentimentAnalyzer = null;
        this.emotionClassifier = null;
        this.empathyEngine = null;
        this.regulationEngine = null;

        // Emotion models
        this.emotionModels = new Map();
        this.emotionRules = new Map();
        this.emotionalTriggers = new Map();

        // Statistics
        this.stats = {
            totalEmotionalProcessing: 0,
            sentimentAnalysisCount: 0,
            emotionRegulationCount: 0,
            empathyActivations: 0,
            averageValence: 0.5,
            averageArousal: 0.5,
            emotionDistribution: {},
            moodStability: 0.8,
            regulationSuccess: 0
        };
    }

    /**
     * Initialize the emotion layer
     */
    async initialize() {
        try {
            if (!this.config.enabled) {
                this.logger.info('💝 Emotion Layer is disabled');
                return;
            }

            this.logger.info('💝 Initializing Emotion Layer...');

            // Initialize emotion models
            this.initializeEmotionModels();

            // Initialize emotional components
            this.initializeSentimentAnalyzer();
            this.initializeEmotionClassifier();
            this.initializeEmpathyEngine();
            this.initializeRegulationEngine();

            // Set baseline emotional state
            this.setBaselineEmotions();

            // Initialize emotional rules and triggers
            this.initializeEmotionalRules();
            this.initializeEmotionalTriggers();

            this.isInitialized = true;
            this.logger.info('✅ Emotion Layer initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Emotion Layer:', error);
            throw error;
        }
    }

    /**
     * Process emotional input
     */
    async process(input, context = {}) {
        try {
            if (!this.isInitialized || !this.config.enabled) {
                return {
                    success: false,
                    error: 'Emotion layer not initialized or disabled'
                };
            }

            const startTime = Date.now();

            this.logger.debug('💝 Processing emotional input...');

            // Analyze emotional content
            const emotionalAnalysis = await this.analyzeEmotionalContent(input, context);

            // Update emotional state
            await this.updateEmotionalState(emotionalAnalysis, context);

            // Apply empathy if enabled
            let empathyResponse = null;
            if (this.config.empathy_simulation && context.userEmotions) {
                empathyResponse = await this.processEmpathy(context.userEmotions);
            }

            // Apply emotion regulation if needed
            let regulationResult = null;
            if (this.config.emotion_regulation) {
                regulationResult = await this.applyEmotionRegulation();
            }

            // Update mood
            this.updateMood();

            // Store emotional memory
            if (this.config.emotional_memory) {
                this.storeEmotionalMemory(input, emotionalAnalysis, context);
            }

            const processingTime = Date.now() - startTime;

            // Update statistics
            this.updateStats(emotionalAnalysis, processingTime);

            const result = {
                emotions: this.getCurrentEmotions(),
                mood: this.currentMood,
                sentiment: emotionalAnalysis.sentiment,
                emotionalResponse: this.generateEmotionalResponse(emotionalAnalysis),
                empathy: empathyResponse,
                regulation: regulationResult,
                emotionalContext: this.getEmotionalContext()
            };

            this.logger.debug(`✅ Emotional processing completed in ${processingTime}ms`);

            return {
                success: true,
                result,
                processingTime,
                emotionStats: this.getEmotionStats()
            };

        } catch (error) {
            this.logger.error('❌ Emotional processing failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Analyze emotional content of input
     */
    async analyzeEmotionalContent(input, context) {
        const analysis = {
            sentiment: { polarity: 0, subjectivity: 0 },
            emotions: new Map(),
            intensity: 0,
            triggers: [],
            emotionalKeywords: []
        };

        const inputText = typeof input === 'string' ? input : JSON.stringify(input);

        // Sentiment analysis
        if (this.config.sentiment_analysis) {
            analysis.sentiment = this.analyzeSentiment(inputText);
        }

        // Emotion classification
        analysis.emotions = this.classifyEmotions(inputText, context);

        // Calculate overall emotional intensity
        analysis.intensity = this.calculateEmotionalIntensity(analysis.emotions);

        // Identify emotional triggers
        analysis.triggers = this.identifyEmotionalTriggers(inputText, context);

        // Extract emotional keywords
        analysis.emotionalKeywords = this.extractEmotionalKeywords(inputText);

        return analysis;
    }

    /**
     * Analyze sentiment of text
     */
    analyzeSentiment(text) {
        // Simple rule-based sentiment analysis (can be enhanced with ML models)
        const positiveWords = [
            'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'like',
            'happy', 'joy', 'pleased', 'satisfied', 'delighted', 'thrilled', 'excited'
        ];

        const negativeWords = [
            'bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'sad', 'angry',
            'frustrated', 'disappointed', 'upset', 'annoyed', 'worried', 'afraid', 'scared'
        ];

        const words = text.toLowerCase().split(/\s+/);
        let positiveScore = 0;
        let negativeScore = 0;
        let subjectivityScore = 0;

        for (const word of words) {
            if (positiveWords.includes(word)) {
                positiveScore++;
                subjectivityScore++;
            }
            if (negativeWords.includes(word)) {
                negativeScore++;
                subjectivityScore++;
            }
        }

        const totalEmotionalWords = positiveScore + negativeScore;
        const polarity = totalEmotionalWords > 0 ?
            (positiveScore - negativeScore) / totalEmotionalWords : 0;
        const subjectivity = words.length > 0 ? subjectivityScore / words.length : 0;

        return {
            polarity: Math.max(-1, Math.min(1, polarity)),
            subjectivity: Math.max(0, Math.min(1, subjectivity))
        };
    }

    /**
     * Classify emotions in text
     */
    classifyEmotions(text, context) {
        const emotions = new Map();
        const textLower = text.toLowerCase();

        // Plutchik's 8 basic emotions
        const emotionKeywords = {
            joy: ['happy', 'joy', 'cheerful', 'delighted', 'pleased', 'glad', 'elated'],
            trust: ['trust', 'faith', 'confidence', 'reliable', 'secure', 'safe'],
            fear: ['fear', 'afraid', 'scared', 'terrified', 'anxious', 'worried', 'nervous'],
            surprise: ['surprise', 'amazed', 'astonished', 'shocked', 'unexpected'],
            sadness: ['sad', 'depressed', 'melancholy', 'grief', 'sorrow', 'unhappy'],
            disgust: ['disgust', 'revolting', 'repulsive', 'sick', 'nauseated'],
            anger: ['angry', 'furious', 'rage', 'mad', 'irritated', 'annoyed', 'frustrated'],
            anticipation: ['excited', 'eager', 'anticipation', 'expectant', 'hopeful']
        };

        for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
            let score = 0;
            for (const keyword of keywords) {
                if (textLower.includes(keyword)) {
                    score += 0.2;
                }
            }

            // Context-based emotion detection
            if (context.previousEmotions) {
                const previousScore = context.previousEmotions.get(emotion) || 0;
                score += previousScore * 0.1; // Emotional continuity
            }

            if (score > 0) {
                emotions.set(emotion, Math.min(1, score));
            }
        }

        // If no emotions detected, use baseline
        if (emotions.size === 0) {
            emotions.set('trust', 0.3);
            emotions.set('anticipation', 0.2);
        }

        return emotions;
    }

    /**
     * Calculate emotional intensity
     */
    calculateEmotionalIntensity(emotions) {
        if (emotions.size === 0) return 0;

        let totalIntensity = 0;
        for (const [emotion, score] of emotions) {
            totalIntensity += score;
        }

        return Math.min(1, totalIntensity / emotions.size);
    }

    /**
     * Identify emotional triggers
     */
    identifyEmotionalTriggers(text, context) {
        const triggers = [];
        const textLower = text.toLowerCase();

        // Common emotional triggers
        const triggerPatterns = {
            'loss': ['lost', 'death', 'gone', 'missing', 'died'],
            'achievement': ['won', 'success', 'accomplished', 'achieved', 'completed'],
            'rejection': ['rejected', 'denied', 'refused', 'turned down'],
            'praise': ['praised', 'complimented', 'appreciated', 'recognized'],
            'criticism': ['criticized', 'blamed', 'fault', 'wrong', 'mistake'],
            'threat': ['danger', 'threat', 'risk', 'unsafe', 'harm']
        };

        for (const [trigger, patterns] of Object.entries(triggerPatterns)) {
            for (const pattern of patterns) {
                if (textLower.includes(pattern)) {
                    triggers.push({
                        type: trigger,
                        keyword: pattern,
                        intensity: 0.7
                    });
                    break;
                }
            }
        }

        return triggers;
    }

    /**
     * Extract emotional keywords
     */
    extractEmotionalKeywords(text) {
        const emotionalWords = [];
        const words = text.toLowerCase().split(/\s+/);

        const emotionLexicon = [
            'love', 'hate', 'happy', 'sad', 'angry', 'excited', 'calm', 'nervous',
            'confident', 'worried', 'proud', 'ashamed', 'grateful', 'jealous',
            'hopeful', 'disappointed', 'surprised', 'confused', 'relieved', 'frustrated'
        ];

        for (const word of words) {
            if (emotionLexicon.includes(word)) {
                emotionalWords.push(word);
            }
        }

        return emotionalWords;
    }

    /**
     * Update emotional state based on analysis
     */
    async updateEmotionalState(analysis, context) {
        // Apply emotional decay to current emotions
        this.applyEmotionalDecay();

        // Update emotions based on analysis
        for (const [emotion, score] of analysis.emotions) {
            const currentScore = this.currentEmotions.get(emotion) || 0;
            const newScore = Math.min(1, currentScore + score * 0.7);
            this.currentEmotions.set(emotion, newScore);
        }

        // Apply emotional contagion if enabled
        if (this.config.emotional_contagion && context.userEmotions) {
            this.applyEmotionalContagion(context.userEmotions);
        }

        // Record emotional state change
        this.emotionalHistory.push({
            timestamp: new Date().toISOString(),
            emotions: new Map(this.currentEmotions),
            triggers: analysis.triggers,
            intensity: analysis.intensity
        });

        // Limit history size
        if (this.emotionalHistory.length > 100) {
            this.emotionalHistory.shift();
        }
    }

    /**
     * Apply emotional decay
     */
    applyEmotionalDecay() {
        for (const [emotion, score] of this.currentEmotions) {
            const decayedScore = score * (1 - this.config.emotion_decay_rate);
            if (decayedScore < 0.05) {
                this.currentEmotions.delete(emotion);
            } else {
                this.currentEmotions.set(emotion, decayedScore);
            }
        }
    }

    /**
     * Apply emotional contagion
     */
    applyEmotionalContagion(userEmotions) {
        for (const [emotion, score] of userEmotions) {
            const currentScore = this.currentEmotions.get(emotion) || 0;
            const contagionEffect = score * 0.3; // 30% contagion effect
            const newScore = Math.min(1, currentScore + contagionEffect);
            this.currentEmotions.set(emotion, newScore);
        }
    }

    /**
     * Process empathy
     */
    async processEmpathy(userEmotions) {
        if (!userEmotions || userEmotions.size === 0) {
            return null;
        }

        const empathyResponse = {
            recognized: [],
            response: '',
            supportLevel: 0,
            suggestions: []
        };

        // Recognize user emotions
        for (const [emotion, intensity] of userEmotions) {
            if (intensity >= this.config.empathy_threshold) {
                empathyResponse.recognized.push({ emotion, intensity });
            }
        }

        if (empathyResponse.recognized.length > 0) {
            // Generate empathetic response
            empathyResponse.response = this.generateEmpathicResponse(empathyResponse.recognized);

            // Calculate support level
            empathyResponse.supportLevel = this.calculateSupportLevel(empathyResponse.recognized);

            // Generate suggestions
            empathyResponse.suggestions = this.generateSupportSuggestions(empathyResponse.recognized);

            this.stats.empathyActivations++;
        }

        return empathyResponse;
    }

    /**
     * Generate empathic response
     */
    generateEmpathicResponse(recognizedEmotions) {
        const responses = {
            sadness: "I can sense that you're feeling sad. That must be difficult for you.",
            anger: "I understand that you're feeling angry. It's natural to feel this way sometimes.",
            fear: "I can tell you're feeling anxious or fearful. It's okay to feel scared sometimes.",
            joy: "I can feel your happiness! It's wonderful to see you in such good spirits.",
            surprise: "You seem surprised! That must have been unexpected.",
            disgust: "I can sense your displeasure. That must be quite unpleasant.",
            trust: "I appreciate the trust you're showing. That means a lot.",
            anticipation: "I can feel your excitement and anticipation! That's energizing."
        };

        const primaryEmotion = recognizedEmotions.reduce((prev, current) =>
            prev.intensity > current.intensity ? prev : current
        );

        return responses[primaryEmotion.emotion] || "I can sense your emotions and I'm here to support you.";
    }

    /**
     * Calculate support level needed
     */
    calculateSupportLevel(recognizedEmotions) {
        const negativeEmotions = ['sadness', 'anger', 'fear', 'disgust'];
        let supportNeeded = 0;

        for (const { emotion, intensity } of recognizedEmotions) {
            if (negativeEmotions.includes(emotion)) {
                supportNeeded += intensity;
            }
        }

        return Math.min(1, supportNeeded / recognizedEmotions.length);
    }

    /**
     * Generate support suggestions
     */
    generateSupportSuggestions(recognizedEmotions) {
        const suggestions = [];

        for (const { emotion, intensity } of recognizedEmotions) {
            if (intensity >= 0.7) {
                switch (emotion) {
                    case 'sadness':
                        suggestions.push('Consider talking to someone you trust about how you\'re feeling');
                        suggestions.push('Engaging in activities you enjoy might help lift your mood');
                        break;
                    case 'anger':
                        suggestions.push('Taking deep breaths or counting to ten might help you calm down');
                        suggestions.push('Physical exercise can be a good way to release anger');
                        break;
                    case 'fear':
                        suggestions.push('Breaking down the situation into smaller, manageable parts might help');
                        suggestions.push('Remember that it\'s okay to ask for help when you need it');
                        break;
                    case 'stress':
                        suggestions.push('Try some relaxation techniques like deep breathing or meditation');
                        suggestions.push('Make sure you\'re getting enough rest and taking breaks');
                        break;
                }
            }
        }

        return suggestions;
    }

    /**
     * Apply emotion regulation
     */
    async applyEmotionRegulation() {
        const regulationResult = {
            applied: false,
            strategy: null,
            before: new Map(this.currentEmotions),
            after: null,
            effectiveness: 0
        };

        // Check if regulation is needed
        const needsRegulation = this.assessRegulationNeed();

        if (needsRegulation.required) {
            const strategy = this.selectRegulationStrategy(needsRegulation);

            regulationResult.applied = true;
            regulationResult.strategy = strategy;

            // Apply regulation strategy
            await this.applyRegulationStrategy(strategy, needsRegulation);

            regulationResult.after = new Map(this.currentEmotions);
            regulationResult.effectiveness = this.calculateRegulationEffectiveness(
                regulationResult.before,
                regulationResult.after
            );

            this.stats.emotionRegulationCount++;
            if (regulationResult.effectiveness > 0.5) {
                this.stats.regulationSuccess++;
            }
        }

        return regulationResult;
    }

    /**
     * Assess if emotion regulation is needed
     */
    assessRegulationNeed() {
        const assessment = {
            required: false,
            reason: '',
            targetEmotions: [],
            intensity: 0
        };

        // Check for overwhelming emotions
        for (const [emotion, score] of this.currentEmotions) {
            if (score > 0.8) {
                assessment.required = true;
                assessment.reason = 'high_intensity';
                assessment.targetEmotions.push(emotion);
                assessment.intensity = Math.max(assessment.intensity, score);
            }
        }

        // Check for negative emotion dominance
        const negativeEmotions = ['sadness', 'anger', 'fear', 'disgust'];
        let negativeScore = 0;
        let totalScore = 0;

        for (const [emotion, score] of this.currentEmotions) {
            totalScore += score;
            if (negativeEmotions.includes(emotion)) {
                negativeScore += score;
            }
        }

        if (totalScore > 0 && negativeScore / totalScore > 0.7) {
            assessment.required = true;
            assessment.reason = 'negative_dominance';
            assessment.intensity = negativeScore / totalScore;
        }

        return assessment;
    }

    /**
     * Select regulation strategy
     */
    selectRegulationStrategy(assessment) {
        const strategies = this.config.regulation_strategies;

        // Simple strategy selection based on assessment
        if (assessment.reason === 'high_intensity') {
            return 'suppression';
        }

        if (assessment.reason === 'negative_dominance') {
            return 'reappraisal';
        }

        // Default strategy
        return strategies[0] || 'acceptance';
    }

    /**
     * Apply regulation strategy
     */
    async applyRegulationStrategy(strategy, assessment) {
        switch (strategy) {
            case 'reappraisal':
                this.applyReappraisal(assessment);
                break;
            case 'suppression':
                this.applySuppression(assessment);
                break;
            case 'distraction':
                this.applyDistraction(assessment);
                break;
            case 'acceptance':
                this.applyAcceptance(assessment);
                break;
        }
    }

    /**
     * Apply reappraisal strategy
     */
    applyReappraisal(assessment) {
        // Reappraisal: Change the interpretation of the emotional situation
        for (const emotion of assessment.targetEmotions) {
            const currentScore = this.currentEmotions.get(emotion) || 0;
            const reducedScore = currentScore * 0.7; // 30% reduction
            this.currentEmotions.set(emotion, reducedScore);
        }

        // Boost positive emotions slightly
        const positiveEmotions = ['joy', 'trust', 'anticipation'];
        for (const emotion of positiveEmotions) {
            const currentScore = this.currentEmotions.get(emotion) || 0;
            const boostedScore = Math.min(1, currentScore + 0.1);
            this.currentEmotions.set(emotion, boostedScore);
        }
    }

    /**
     * Apply suppression strategy
     */
    applySuppression(assessment) {
        // Suppression: Reduce the expression/intensity of emotions
        for (const emotion of assessment.targetEmotions) {
            const currentScore = this.currentEmotions.get(emotion) || 0;
            const suppressedScore = currentScore * 0.5; // 50% reduction
            this.currentEmotions.set(emotion, suppressedScore);
        }
    }

    /**
     * Apply distraction strategy
     */
    applyDistraction(assessment) {
        // Distraction: Shift attention away from emotional triggers
        for (const emotion of assessment.targetEmotions) {
            const currentScore = this.currentEmotions.get(emotion) || 0;
            const distractedScore = currentScore * 0.8; // 20% reduction
            this.currentEmotions.set(emotion, distractedScore);
        }

        // Add some neutral emotions
        this.currentEmotions.set('trust', Math.min(1, (this.currentEmotions.get('trust') || 0) + 0.2));
    }

    /**
     * Apply acceptance strategy
     */
    applyAcceptance(assessment) {
        // Acceptance: Acknowledge emotions without trying to change them
        // This strategy doesn't change emotion levels but improves regulation effectiveness
        // by reducing emotional resistance
    }

    /**
     * Calculate regulation effectiveness
     */
    calculateRegulationEffectiveness(before, after) {
        let beforeIntensity = 0;
        let afterIntensity = 0;

        for (const [emotion, score] of before) {
            beforeIntensity += score;
        }

        for (const [emotion, score] of after) {
            afterIntensity += score;
        }

        if (beforeIntensity === 0) return 0;

        const reduction = (beforeIntensity - afterIntensity) / beforeIntensity;
        return Math.max(0, Math.min(1, reduction));
    }

    /**
     * Update mood based on current emotions
     */
    updateMood() {
        let valenceSum = 0;
        let arousalSum = 0;
        let dominanceSum = 0;
        let totalWeight = 0;

        // Emotion to mood mapping (simplified)
        const emotionMoodMap = {
            joy: { valence: 0.8, arousal: 0.6, dominance: 0.7 },
            trust: { valence: 0.6, arousal: 0.4, dominance: 0.6 },
            fear: { valence: 0.2, arousal: 0.8, dominance: 0.2 },
            surprise: { valence: 0.5, arousal: 0.9, dominance: 0.3 },
            sadness: { valence: 0.1, arousal: 0.3, dominance: 0.2 },
            disgust: { valence: 0.2, arousal: 0.5, dominance: 0.4 },
            anger: { valence: 0.2, arousal: 0.9, dominance: 0.8 },
            anticipation: { valence: 0.7, arousal: 0.7, dominance: 0.6 }
        };

        for (const [emotion, score] of this.currentEmotions) {
            const moodContribution = emotionMoodMap[emotion];
            if (moodContribution) {
                valenceSum += moodContribution.valence * score;
                arousalSum += moodContribution.arousal * score;
                dominanceSum += moodContribution.dominance * score;
                totalWeight += score;
            }
        }

        if (totalWeight > 0) {
            const newMood = {
                valence: valenceSum / totalWeight,
                arousal: arousalSum / totalWeight,
                dominance: dominanceSum / totalWeight
            };

            // Apply mood persistence
            this.currentMood = {
                valence: this.currentMood.valence * this.config.mood_persistence +
                    newMood.valence * (1 - this.config.mood_persistence),
                arousal: this.currentMood.arousal * this.config.mood_persistence +
                    newMood.arousal * (1 - this.config.mood_persistence),
                dominance: this.currentMood.dominance * this.config.mood_persistence +
                    newMood.dominance * (1 - this.config.mood_persistence)
            };
        }

        // Record mood history
        this.moodHistory.push({
            timestamp: new Date().toISOString(),
            mood: { ...this.currentMood }
        });

        // Limit mood history
        if (this.moodHistory.length > 50) {
            this.moodHistory.shift();
        }
    }

    /**
     * Store emotional memory
     */
    storeEmotionalMemory(input, analysis, context) {
        const memoryId = `emotion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const emotionalMemory = {
            id: memoryId,
            input,
            emotions: new Map(analysis.emotions),
            sentiment: analysis.sentiment,
            triggers: analysis.triggers,
            mood: { ...this.currentMood },
            context: context.emotionalContext || {},
            timestamp: new Date().toISOString()
        };

        this.emotionalMemories.set(memoryId, emotionalMemory);

        // Limit memory size
        if (this.emotionalMemories.size > 200) {
            const oldestKey = Array.from(this.emotionalMemories.keys())[0];
            this.emotionalMemories.delete(oldestKey);
        }
    }

    /**
     * Generate emotional response
     */
    generateEmotionalResponse(analysis) {
        const response = {
            tone: this.determineTone(),
            expressiveness: this.calculateExpressiveness(),
            emotionalColoring: this.getEmotionalColoring(),
            suggestions: this.generateEmotionalSuggestions(analysis)
        };

        return response;
    }

    /**
     * Determine response tone
     */
    determineTone() {
        const valence = this.currentMood.valence;
        const arousal = this.currentMood.arousal;

        if (valence > 0.7 && arousal > 0.6) return 'enthusiastic';
        if (valence > 0.6 && arousal < 0.4) return 'calm_positive';
        if (valence < 0.3 && arousal > 0.6) return 'agitated';
        if (valence < 0.4 && arousal < 0.4) return 'subdued';

        return 'neutral';
    }

    /**
     * Calculate expressiveness level
     */
    calculateExpressiveness() {
        const arousal = this.currentMood.arousal;
        const dominance = this.currentMood.dominance;

        return (arousal + dominance) / 2;
    }

    /**
     * Get emotional coloring for responses
     */
    getEmotionalColoring() {
        const dominantEmotion = this.getDominantEmotion();

        const coloringMap = {
            joy: 'warm and positive',
            trust: 'supportive and reliable',
            fear: 'cautious and careful',
            surprise: 'curious and engaged',
            sadness: 'gentle and understanding',
            disgust: 'critical but constructive',
            anger: 'firm but controlled',
            anticipation: 'excited and forward-looking'
        };

        return coloringMap[dominantEmotion] || 'balanced and thoughtful';
    }

    /**
     * Get dominant emotion
     */
    getDominantEmotion() {
        let dominantEmotion = 'trust';
        let maxScore = 0;

        for (const [emotion, score] of this.currentEmotions) {
            if (score > maxScore) {
                maxScore = score;
                dominantEmotion = emotion;
            }
        }

        return dominantEmotion;
    }

    /**
     * Generate emotional suggestions
     */
    generateEmotionalSuggestions(analysis) {
        const suggestions = [];

        // Based on sentiment
        if (analysis.sentiment.polarity < -0.5) {
            suggestions.push('Consider focusing on positive aspects of the situation');
        }

        // Based on emotional intensity
        if (analysis.intensity > 0.8) {
            suggestions.push('Take a moment to process these strong emotions');
        }

        // Based on triggers
        if (analysis.triggers.length > 0) {
            suggestions.push('Be aware of emotional triggers and their impact');
        }

        return suggestions;
    }

    /**
     * Initialize emotion models
     */
    initializeEmotionModels() {
        // Plutchik's Wheel of Emotions
        this.emotionModels.set('plutchik', {
            basic_emotions: ['joy', 'trust', 'fear', 'surprise', 'sadness', 'disgust', 'anger', 'anticipation'],
            opposites: {
                joy: 'sadness',
                trust: 'disgust',
                fear: 'anger',
                surprise: 'anticipation'
            },
            combinations: {
                love: ['joy', 'trust'],
                submission: ['trust', 'fear'],
                awe: ['fear', 'surprise'],
                disapproval: ['surprise', 'sadness'],
                remorse: ['sadness', 'disgust'],
                contempt: ['disgust', 'anger'],
                aggressiveness: ['anger', 'anticipation'],
                optimism: ['anticipation', 'joy']
            }
        });
    }

    /**
     * Initialize sentiment analyzer
     */
    initializeSentimentAnalyzer() {
        this.sentimentAnalyzer = {
            analyze: this.analyzeSentiment.bind(this)
        };
    }

    /**
     * Initialize emotion classifier
     */
    initializeEmotionClassifier() {
        this.emotionClassifier = {
            classify: this.classifyEmotions.bind(this)
        };
    }

    /**
     * Initialize empathy engine
     */
    initializeEmpathyEngine() {
        this.empathyEngine = {
            process: this.processEmpathy.bind(this),
            generateResponse: this.generateEmpathicResponse.bind(this)
        };
    }

    /**
     * Initialize regulation engine
     */
    initializeRegulationEngine() {
        this.regulationEngine = {
            assess: this.assessRegulationNeed.bind(this),
            apply: this.applyEmotionRegulation.bind(this)
        };
    }

    /**
     * Set baseline emotions
     */
    setBaselineEmotions() {
        for (const [emotion, score] of Object.entries(this.config.baseline_emotions)) {
            this.currentEmotions.set(emotion, score);
        }
    }

    /**
     * Initialize emotional rules
     */
    initializeEmotionalRules() {
        // Rules for emotional processing
        this.emotionRules.set('intensity_limit', {
            condition: (emotion, score) => score > 1.0,
            action: (emotion, score) => Math.min(1.0, score)
        });

        this.emotionRules.set('opposite_suppression', {
            condition: (emotion, score) => {
                const opposites = this.emotionModels.get('plutchik').opposites;
                const opposite = opposites[emotion];
                return opposite && this.currentEmotions.has(opposite);
            },
            action: (emotion, score) => {
                const opposites = this.emotionModels.get('plutchik').opposites;
                const opposite = opposites[emotion];
                const oppositeScore = this.currentEmotions.get(opposite) || 0;
                return Math.max(0, score - oppositeScore * 0.3);
            }
        });
    }

    /**
     * Initialize emotional triggers
     */
    initializeEmotionalTriggers() {
        this.emotionalTriggers.set('positive_feedback', {
            patterns: ['good job', 'well done', 'excellent', 'perfect'],
            emotions: { joy: 0.6, trust: 0.4 }
        });

        this.emotionalTriggers.set('negative_feedback', {
            patterns: ['wrong', 'bad', 'terrible', 'awful'],
            emotions: { sadness: 0.4, anger: 0.3 }
        });

        this.emotionalTriggers.set('uncertainty', {
            patterns: ['maybe', 'perhaps', 'not sure', 'confused'],
            emotions: { fear: 0.3, surprise: 0.2 }
        });
    }

    /**
     * Get current emotions
     */
    getCurrentEmotions() {
        return Object.fromEntries(this.currentEmotions);
    }

    /**
     * Get emotional context
     */
    getEmotionalContext() {
        return {
            dominantEmotion: this.getDominantEmotion(),
            emotionalIntensity: this.calculateEmotionalIntensity(this.currentEmotions),
            mood: this.currentMood,
            recentTriggers: this.emotionalHistory.slice(-3).flatMap(h => h.triggers),
            emotionalStability: this.calculateEmotionalStability()
        };
    }

    /**
     * Calculate emotional stability
     */
    calculateEmotionalStability() {
        if (this.emotionalHistory.length < 2) return 0.8;

        let totalVariation = 0;
        let comparisons = 0;

        for (let i = 1; i < this.emotionalHistory.length; i++) {
            const prev = this.emotionalHistory[i - 1];
            const curr = this.emotionalHistory[i];

            let variation = 0;
            const allEmotions = new Set([...prev.emotions.keys(), ...curr.emotions.keys()]);

            for (const emotion of allEmotions) {
                const prevScore = prev.emotions.get(emotion) || 0;
                const currScore = curr.emotions.get(emotion) || 0;
                variation += Math.abs(prevScore - currScore);
            }

            totalVariation += variation;
            comparisons++;
        }

        const averageVariation = comparisons > 0 ? totalVariation / comparisons : 0;
        return Math.max(0, 1 - averageVariation);
    }

    /**
     * Update statistics
     */
    updateStats(analysis, processingTime) {
        this.stats.totalEmotionalProcessing++;

        if (analysis.sentiment) {
            this.stats.sentimentAnalysisCount++;
        }

        // Update emotion distribution
        for (const [emotion, score] of analysis.emotions) {
            this.stats.emotionDistribution[emotion] =
                (this.stats.emotionDistribution[emotion] || 0) + score;
        }

        // Update average mood dimensions
        this.stats.averageValence =
            (this.stats.averageValence * (this.stats.totalEmotionalProcessing - 1) + this.currentMood.valence) /
            this.stats.totalEmotionalProcessing;

        this.stats.averageArousal =
            (this.stats.averageArousal * (this.stats.totalEmotionalProcessing - 1) + this.currentMood.arousal) /
            this.stats.totalEmotionalProcessing;

        // Update mood stability
        this.stats.moodStability = this.calculateEmotionalStability();
    }

    /**
     * Get emotion statistics
     */
    getEmotionStats() {
        return {
            ...this.stats,
            regulationSuccessRate: this.stats.emotionRegulationCount > 0 ?
                this.stats.regulationSuccess / this.stats.emotionRegulationCount : 0,
            currentEmotionalState: this.getCurrentEmotions(),
            currentMood: this.currentMood,
            emotionalMemorySize: this.emotionalMemories.size
        };
    }

    /**
     * Get layer status
     */
    getStatus() {
        return {
            name: 'Emotion Layer',
            enabled: this.config.enabled,
            initialized: this.isInitialized,
            emotionStats: this.getEmotionStats(),
            currentState: {
                emotions: this.getCurrentEmotions(),
                mood: this.currentMood,
                dominantEmotion: this.getDominantEmotion()
            },
            configuration: {
                emotionModel: this.config.emotion_model,
                sentimentAnalysis: this.config.sentiment_analysis,
                moodTracking: this.config.mood_tracking,
                empathySimulation: this.config.empathy_simulation,
                emotionRegulation: this.config.emotion_regulation
            }
        };
    }

    /**
     * Shutdown the emotion layer
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Emotion Layer...');

            this.isInitialized = false;

            this.logger.info('✅ Emotion Layer shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Emotion Layer shutdown:', error);
            throw error;
        }
    }
}

module.exports = EmotionLayer;