/**
 * Document Processor - Text chunking, preprocessing, and document management
 * 
 * Handles various document types and formats:
 * - Plain text
 * - Markdown
 * - PDF (via pdf-parse)
 * - Word documents (via mammoth)
 * - Web pages (via cheerio)
 * - Code files
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const Logger = require('../core/utils/logger');

class DocumentProcessor extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.logger = new Logger('DocumentProcessor');

        // Chunking configuration
        this.chunkSize = config.chunk_size || 1000;
        this.chunkOverlap = config.chunk_overlap || 200;
        this.minChunkSize = config.min_chunk_size || 100;
        this.maxChunkSize = config.max_chunk_size || 2000;

        // Supported file types
        this.supportedTypes = {
            text: ['.txt', '.md', '.markdown', '.rst'],
            code: ['.js', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html', '.xml', '.json', '.yaml', '.yml'],
            pdf: ['.pdf'],
            word: ['.docx', '.doc'],
            web: ['.html', '.htm']
        };

        // Text processing options
        this.preserveFormatting = config.preserve_formatting !== false;
        this.removeExtraWhitespace = config.remove_extra_whitespace !== false;
        this.normalizeUnicode = config.normalize_unicode !== false;

        // Metadata extraction
        this.extractMetadata = config.extract_metadata !== false;
        this.includeLineNumbers = config.include_line_numbers || false;

        // Performance tracking
        this.stats = {
            documentsProcessed: 0,
            chunksGenerated: 0,
            totalCharacters: 0,
            averageChunkSize: 0,
            processingTime: 0,
            errors: 0
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the document processor
     */
    async initialize() {
        try {
            this.logger.info('📄 Initializing Document Processor...');

            // Initialize text splitters
            this.initializeTextSplitters();

            // Test basic functionality
            await this.testProcessing();

            this.isInitialized = true;
            this.logger.info('✅ Document Processor initialized successfully');

            this.emit('initialized');

        } catch (error) {
            this.logger.error('❌ Failed to initialize Document Processor:', error);
            throw error;
        }
    }

    /**
     * Initialize text splitters for different content types
     */
    initializeTextSplitters() {
        this.splitters = {
            // Recursive character splitter (default)
            recursive: {
                separators: ['\n\n', '\n', '. ', ' ', ''],
                keepSeparator: true
            },

            // Code-aware splitter
            code: {
                separators: ['\nclass ', '\nfunction ', '\ndef ', '\n\n', '\n', ' ', ''],
                keepSeparator: true
            },

            // Markdown splitter
            markdown: {
                separators: ['\n## ', '\n### ', '\n#### ', '\n\n', '\n', '. ', ' ', ''],
                keepSeparator: true
            },

            // Sentence splitter
            sentence: {
                separators: ['. ', '! ', '? ', '\n', ' ', ''],
                keepSeparator: false
            }
        };
    }

    /**
     * Test basic processing functionality
     */
    async testProcessing() {
        try {
            this.logger.debug('🧪 Testing document processing...');

            const testText = 'This is a test document. It contains multiple sentences. Each sentence should be processed correctly.';
            const chunks = await this.chunkText(testText);

            if (chunks.length === 0) {
                throw new Error('Text chunking test failed');
            }

            this.logger.debug('✅ Document processing test passed');

        } catch (error) {
            this.logger.error('❌ Document processing test failed:', error);
            throw error;
        }
    }

    /**
     * Process a document from file path
     */
    async processFile(filePath, options = {}) {
        try {
            const startTime = Date.now();
            this.logger.debug(`📂 Processing file: ${filePath}`);

            // Check if file exists
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
                throw new Error(`Path is not a file: ${filePath}`);
            }

            // Determine file type
            const fileType = this.getFileType(filePath);

            // Extract text content
            const content = await this.extractContent(filePath, fileType);

            // Process the content
            const result = await this.processText(content, {
                ...options,
                source: filePath,
                fileType,
                fileSize: stats.size,
                lastModified: stats.mtime
            });

            const processingTime = Date.now() - startTime;
            this.updateStats(result.chunks.length, content.length, processingTime);

            this.logger.debug(`✅ Processed file ${filePath} (${result.chunks.length} chunks, ${processingTime}ms)`);

            return result;

        } catch (error) {
            this.stats.errors++;
            this.logger.error(`❌ Failed to process file ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Process text content directly
     */
    async processText(text, options = {}) {
        try {
            const startTime = Date.now();
            this.logger.debug(`📝 Processing text content (${text.length} characters)`);

            // Preprocess text
            const preprocessedText = this.preprocessText(text, options);

            // Extract metadata
            const metadata = this.extractDocumentMetadata(preprocessedText, options);

            // Chunk the text
            const chunks = await this.chunkText(preprocessedText, options);

            // Add metadata to chunks
            const enrichedChunks = chunks.map((chunk, index) => ({
                id: this.generateChunkId(options.source, index),
                text: chunk.text,
                chunkIndex: index,
                startChar: chunk.startChar,
                endChar: chunk.endChar,
                source: options.source || 'unknown',
                metadata: {
                    ...metadata,
                    chunkSize: chunk.text.length,
                    ...chunk.metadata,
                    ...options.metadata
                }
            }));

            const processingTime = Date.now() - startTime;

            return {
                document: {
                    id: this.generateDocumentId(options.source),
                    source: options.source || 'unknown',
                    content: preprocessedText,
                    metadata,
                    processedAt: new Date().toISOString(),
                    processingTime
                },
                chunks: enrichedChunks,
                stats: {
                    originalLength: text.length,
                    processedLength: preprocessedText.length,
                    chunkCount: chunks.length,
                    averageChunkSize: chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / chunks.length,
                    processingTime
                }
            };

        } catch (error) {
            this.stats.errors++;
            this.logger.error('❌ Failed to process text:', error);
            throw error;
        }
    }

    /**
     * Extract content from different file types
     */
    async extractContent(filePath, fileType) {
        switch (fileType) {
            case 'text':
            case 'code':
                return await this.extractTextContent(filePath);
            case 'pdf':
                return await this.extractPDFContent(filePath);
            case 'word':
                return await this.extractWordContent(filePath);
            case 'web':
                return await this.extractWebContent(filePath);
            default:
                throw new Error(`Unsupported file type: ${fileType}`);
        }
    }

    /**
     * Extract text content from plain text files
     */
    async extractTextContent(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return content;
        } catch (error) {
            throw new Error(`Failed to read text file: ${error.message}`);
        }
    }

    /**
     * Extract content from PDF files
     */
    async extractPDFContent(filePath) {
        try {
            // Note: In a real implementation, you would use the pdf-parse package
            // For now, we'll return a placeholder
            this.logger.warn('PDF extraction not implemented, returning placeholder');
            return `[PDF Content from ${path.basename(filePath)}]\n\nThis is a placeholder for PDF content extraction.`;
        } catch (error) {
            throw new Error(`Failed to extract PDF content: ${error.message}`);
        }
    }

    /**
     * Extract content from Word documents
     */
    async extractWordContent(filePath) {
        try {
            // Note: In a real implementation, you would use the mammoth package
            // For now, we'll return a placeholder
            this.logger.warn('Word document extraction not implemented, returning placeholder');
            return `[Word Document Content from ${path.basename(filePath)}]\n\nThis is a placeholder for Word document content extraction.`;
        } catch (error) {
            throw new Error(`Failed to extract Word content: ${error.message}`);
        }
    }

    /**
     * Extract content from web pages
     */
    async extractWebContent(filePath) {
        try {
            // Note: In a real implementation, you would use the cheerio package
            // For now, we'll read as text and strip basic HTML
            const htmlContent = await fs.readFile(filePath, 'utf8');

            // Basic HTML tag removal (very simple)
            const textContent = htmlContent
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            return textContent;
        } catch (error) {
            throw new Error(`Failed to extract web content: ${error.message}`);
        }
    }

    /**
     * Preprocess text content
     */
    preprocessText(text, options = {}) {
        let processed = text;

        // Normalize unicode
        if (this.normalizeUnicode) {
            processed = processed.normalize('NFKC');
        }

        // Remove extra whitespace
        if (this.removeExtraWhitespace) {
            processed = processed.replace(/\r\n/g, '\n'); // Normalize line endings
            processed = processed.replace(/\t/g, ' '); // Replace tabs with spaces

            if (!this.preserveFormatting) {
                processed = processed.replace(/\n\s*\n\s*\n/g, '\n\n'); // Remove excessive line breaks
                processed = processed.replace(/ +/g, ' '); // Remove multiple spaces
            }
        }

        // Trim
        processed = processed.trim();

        return processed;
    }

    /**
     * Extract document metadata
     */
    extractDocumentMetadata(text, options = {}) {
        const metadata = {
            length: text.length,
            wordCount: this.countWords(text),
            lineCount: text.split('\n').length,
            language: this.detectLanguage(text),
            encoding: 'utf8',
            ...options.metadata
        };

        // Add file-specific metadata
        if (options.source) {
            metadata.filename = path.basename(options.source);
            metadata.extension = path.extname(options.source);
            metadata.directory = path.dirname(options.source);
        }

        if (options.fileSize) {
            metadata.fileSize = options.fileSize;
        }

        if (options.lastModified) {
            metadata.lastModified = options.lastModified.toISOString();
        }

        if (options.fileType) {
            metadata.fileType = options.fileType;
        }

        return metadata;
    }

    /**
     * Chunk text into smaller pieces
     */
    async chunkText(text, options = {}) {
        try {
            const chunkSize = options.chunkSize || this.chunkSize;
            const chunkOverlap = options.chunkOverlap || this.chunkOverlap;
            const splitterType = options.splitterType || this.getSplitterType(options);

            this.logger.debug(`🔪 Chunking text (${text.length} chars, ${chunkSize} chunk size, ${chunkOverlap} overlap)`);

            const splitter = this.splitters[splitterType] || this.splitters.recursive;
            const chunks = this.recursiveTextSplit(text, splitter, chunkSize, chunkOverlap);

            // Filter out chunks that are too small
            const filteredChunks = chunks.filter(chunk =>
                chunk.text.trim().length >= this.minChunkSize
            );

            this.logger.debug(`✅ Generated ${filteredChunks.length} chunks`);

            return filteredChunks;

        } catch (error) {
            this.logger.error('❌ Failed to chunk text:', error);
            throw error;
        }
    }

    /**
     * Recursive text splitting algorithm
     */
    recursiveTextSplit(text, splitter, chunkSize, chunkOverlap) {
        const chunks = [];
        const separators = splitter.separators;

        // If text is small enough, return as single chunk
        if (text.length <= chunkSize) {
            return [{
                text: text.trim(),
                startChar: 0,
                endChar: text.length,
                metadata: {}
            }];
        }

        // Try each separator
        for (const separator of separators) {
            if (text.includes(separator)) {
                const splits = this.splitBySeparator(text, separator, splitter.keepSeparator);
                return this.mergeSplits(splits, chunkSize, chunkOverlap);
            }
        }

        // If no separator works, split by character count
        return this.splitByCharacterCount(text, chunkSize, chunkOverlap);
    }

    /**
     * Split text by separator
     */
    splitBySeparator(text, separator, keepSeparator) {
        const splits = text.split(separator);

        if (keepSeparator && separator !== '') {
            // Add separator back to splits (except the last one)
            for (let i = 0; i < splits.length - 1; i++) {
                splits[i] += separator;
            }
        }

        return splits.filter(split => split.trim().length > 0);
    }

    /**
     * Merge splits into chunks with overlap
     */
    mergeSplits(splits, chunkSize, chunkOverlap) {
        const chunks = [];
        let currentChunk = '';
        let currentStart = 0;

        for (let i = 0; i < splits.length; i++) {
            const split = splits[i];

            // If adding this split would exceed chunk size
            if (currentChunk.length + split.length > chunkSize && currentChunk.length > 0) {
                // Save current chunk
                chunks.push({
                    text: currentChunk.trim(),
                    startChar: currentStart,
                    endChar: currentStart + currentChunk.length,
                    metadata: {}
                });

                // Start new chunk with overlap
                const overlapText = this.getOverlapText(currentChunk, chunkOverlap);
                currentChunk = overlapText + split;
                currentStart = currentStart + currentChunk.length - overlapText.length - split.length;
            } else {
                // Add split to current chunk
                if (currentChunk.length === 0) {
                    currentStart = this.findTextPosition(splits, i);
                }
                currentChunk += split;
            }
        }

        // Add final chunk
        if (currentChunk.trim().length > 0) {
            chunks.push({
                text: currentChunk.trim(),
                startChar: currentStart,
                endChar: currentStart + currentChunk.length,
                metadata: {}
            });
        }

        return chunks;
    }

    /**
     * Split by character count when no separator works
     */
    splitByCharacterCount(text, chunkSize, chunkOverlap) {
        const chunks = [];
        let start = 0;

        while (start < text.length) {
            let end = Math.min(start + chunkSize, text.length);

            // Try to break at word boundary
            if (end < text.length) {
                const lastSpace = text.lastIndexOf(' ', end);
                if (lastSpace > start + chunkSize * 0.8) {
                    end = lastSpace;
                }
            }

            const chunkText = text.substring(start, end).trim();
            if (chunkText.length > 0) {
                chunks.push({
                    text: chunkText,
                    startChar: start,
                    endChar: end,
                    metadata: {}
                });
            }

            start = Math.max(start + chunkSize - chunkOverlap, end);
        }

        return chunks;
    }

    /**
     * Get overlap text from the end of a chunk
     */
    getOverlapText(text, overlapSize) {
        if (overlapSize <= 0 || text.length <= overlapSize) {
            return '';
        }

        const overlapText = text.substring(text.length - overlapSize);

        // Try to start at word boundary
        const firstSpace = overlapText.indexOf(' ');
        if (firstSpace > 0 && firstSpace < overlapSize * 0.5) {
            return overlapText.substring(firstSpace + 1);
        }

        return overlapText;
    }

    /**
     * Find text position in original text
     */
    findTextPosition(splits, index) {
        let position = 0;
        for (let i = 0; i < index; i++) {
            position += splits[i].length;
        }
        return position;
    }

    /**
     * Determine appropriate splitter type
     */
    getSplitterType(options) {
        if (options.splitterType) {
            return options.splitterType;
        }

        if (options.fileType === 'code') {
            return 'code';
        }

        if (options.source && options.source.endsWith('.md')) {
            return 'markdown';
        }

        return 'recursive';
    }

    /**
     * Get file type from extension
     */
    getFileType(filePath) {
        const ext = path.extname(filePath).toLowerCase();

        for (const [type, extensions] of Object.entries(this.supportedTypes)) {
            if (extensions.includes(ext)) {
                return type;
            }
        }

        return 'text'; // Default to text
    }

    /**
     * Count words in text
     */
    countWords(text) {
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    /**
     * Simple language detection
     */
    detectLanguage(text) {
        // Very basic language detection
        // In a real implementation, you might use a library like franc
        const sample = text.substring(0, 1000).toLowerCase();

        // Check for common English words
        const englishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        const englishCount = englishWords.reduce((count, word) =>
            count + (sample.split(word).length - 1), 0
        );

        if (englishCount > 5) {
            return 'en';
        }

        return 'unknown';
    }

    /**
     * Generate document ID
     */
    generateDocumentId(source) {
        if (source) {
            // Use source path as basis for ID
            const hash = this.simpleHash(source);
            return `doc_${hash}`;
        }
        return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Generate chunk ID
     */
    generateChunkId(source, index) {
        const docId = this.generateDocumentId(source);
        return `${docId}_chunk_${index}`;
    }

    /**
     * Simple hash function
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Update performance statistics
     */
    updateStats(chunkCount, characterCount, processingTime) {
        this.stats.documentsProcessed++;
        this.stats.chunksGenerated += chunkCount;
        this.stats.totalCharacters += characterCount;
        this.stats.processingTime += processingTime;

        // Update average chunk size
        this.stats.averageChunkSize = this.stats.totalCharacters / this.stats.chunksGenerated;
    }

    /**
     * Get performance statistics
     */
    getStats() {
        return {
            ...this.stats,
            averageProcessingTime: this.stats.processingTime / this.stats.documentsProcessed || 0,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Shutdown the document processor
     */
    async shutdown() {
        try {
            this.logger.info('🔄 Shutting down Document Processor...');

            this.isInitialized = false;
            this.logger.info('✅ Document Processor shutdown completed');

        } catch (error) {
            this.logger.error('❌ Error during Document Processor shutdown:', error);
            throw error;
        }
    }
}

module.exports = DocumentProcessor;