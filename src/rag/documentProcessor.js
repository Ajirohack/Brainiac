/**
 * Document Processor - Handles various document formats for RAG system
 * 
 * Supports PDF, Word documents, Markdown, and text files with
 * metadata extraction and error handling for corrupted files.
 */

const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const crypto = require('crypto');
const logger = require('../utils/logger');

class DocumentProcessor {
  constructor(config = {}) {
    this.config = {
      maxFileSize: config.maxFileSize || 50 * 1024 * 1024, // 50MB
      supportedFormats: config.supportedFormats || ['.pdf', '.docx', '.doc', '.txt', '.md'],
      chunkSize: config.chunkSize || 1000,
      overlapSize: config.overlapSize || 200,
      ...config
    };

    this.logger = logger;
    this.logger.info('📄 Document processor initialized');
  }

  /**
   * Process a document file
   * @param {string} filePath - Path to the document file
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processed document data
   */
  async processDocument(filePath, options = {}) {
    try {
      this.logger.debug(`📄 Processing document: ${filePath}`);

      // Validate file
      await this.validateFile(filePath);

      // Get file metadata
      const metadata = await this.extractMetadata(filePath);

      // Extract text content based on file type
      const content = await this.extractText(filePath, metadata);

      // Process the content
      const processedContent = await this.processContent(content, options);

      // Generate document ID
      const documentId = this.generateDocumentId(filePath, metadata);

      return {
        id: documentId,
        filePath,
        content: processedContent,
        metadata: {
          ...metadata,
          processedAt: new Date().toISOString(),
          processor: 'DocumentProcessor',
          version: '1.0.0'
        },
        chunks: this.createChunks(processedContent),
        status: 'processed'
      };

        } catch (error) {
      this.logger.error(`❌ Failed to process document: ${filePath}`, {
        error: error.message,
        stack: error.stack
      });

      return {
        id: this.generateDocumentId(filePath),
        filePath,
        content: '',
        metadata: {
          error: error.message,
          processedAt: new Date().toISOString(),
          status: 'failed'
        },
        chunks: [],
        status: 'failed'
      };
        }
    }

    /**
   * Validate file before processing
   * @param {string} filePath - Path to the file
   * @private
   */
  async validateFile(filePath) {
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch (error) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size > this.config.maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${this.config.maxFileSize} bytes)`);
    }

    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    if (!this.config.supportedFormats.includes(ext)) {
      throw new Error(`Unsupported file format: ${ext}`);
        }
    }

    /**
   * Extract metadata from file
   * @param {string} filePath - Path to the file
   * @returns {Promise<Object>} File metadata
   * @private
   */
  async extractMetadata(filePath) {
            const stats = await fs.stat(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);

    return {
      fileName,
      fileExtension: ext,
      fileSize: stats.size,
      createdDate: stats.birthtime,
      modifiedDate: stats.mtime,
      mimeType: this.getMimeType(ext),
      encoding: 'utf-8'
    };
  }

  /**
   * Extract text content from file
   * @param {string} filePath - Path to the file
   * @param {Object} metadata - File metadata
   * @returns {Promise<string>} Extracted text content
   * @private
   */
  async extractText(filePath, metadata) {
    const ext = metadata.fileExtension;

    try {
      switch (ext) {
        case '.pdf':
          return await this.extractPdfText(filePath);
        case '.docx':
        case '.doc':
          return await this.extractWordText(filePath);
        case '.txt':
        case '.md':
          return await this.extractTextFile(filePath);
        default:
          throw new Error(`Unsupported file format: ${ext}`);
      }
    } catch (error) {
      this.logger.error(`❌ Text extraction failed for ${filePath}`, {
        error: error.message,
        extension: ext
      });
      throw new Error(`Text extraction failed: ${error.message}`);
        }
    }

    /**
   * Extract text from PDF file
   * @param {string} filePath - Path to PDF file
   * @returns {Promise<string>} Extracted text
   * @private
   */
  async extractPdfText(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);

            return {
        text: data.text,
        pages: data.numpages,
        info: data.info || {},
        metadata: {
          title: data.info?.Title || '',
          author: data.info?.Author || '',
          subject: data.info?.Subject || '',
          keywords: data.info?.Keywords || '',
          creator: data.info?.Creator || '',
          producer: data.info?.Producer || '',
          creationDate: data.info?.CreationDate || '',
          modDate: data.info?.ModDate || ''
        }
      };
        } catch (error) {
      throw new Error(`PDF processing failed: ${error.message}`);
        }
    }

    /**
   * Extract text from Word document
   * @param {string} filePath - Path to Word file
   * @returns {Promise<string>} Extracted text
   * @private
   */
  async extractWordText(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      
      return {
        text: result.value,
        messages: result.messages || [],
        metadata: {
          hasImages: result.messages?.some(msg => msg.type === 'image') || false,
          hasTables: result.messages?.some(msg => msg.type === 'table') || false
        }
      };
    } catch (error) {
      throw new Error(`Word document processing failed: ${error.message}`);
        }
    }

    /**
   * Extract text from plain text file
   * @param {string} filePath - Path to text file
   * @returns {Promise<string>} File content
   * @private
   */
  async extractTextFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        text: content,
        lines: content.split('\n').length,
        characters: content.length
      };
        } catch (error) {
      throw new Error(`Text file reading failed: ${error.message}`);
        }
    }

    /**
   * Process extracted content
   * @param {Object} content - Raw content object
   * @param {Object} options - Processing options
   * @returns {Promise<string>} Processed text
   * @private
   */
  async processContent(content, options = {}) {
    let text = content.text || '';

    // Clean and normalize text
    text = this.cleanText(text);

    // Apply text processing options
    if (options.removeHeaders) {
      text = this.removeHeaders(text);
    }

    if (options.removeFooters) {
      text = this.removeFooters(text);
    }

    if (options.normalizeWhitespace) {
      text = this.normalizeWhitespace(text);
    }

    return text;
  }

  /**
   * Clean and normalize text
   * @param {string} text - Raw text
   * @returns {string} Cleaned text
   * @private
   */
  cleanText(text) {
    return text
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\t/g, ' ') // Replace tabs with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Remove headers from text
   * @param {string} text - Text content
   * @returns {string} Text without headers
   * @private
   */
  removeHeaders(text) {
    const lines = text.split('\n');
    const filteredLines = lines.filter(line => {
      // Remove lines that look like headers (all caps, short lines)
      return !(line.length < 50 && line.toUpperCase() === line && line.trim().length > 0);
    });
    return filteredLines.join('\n');
  }

  /**
   * Remove footers from text
   * @param {string} text - Text content
   * @returns {string} Text without footers
   * @private
   */
  removeFooters(text) {
    const lines = text.split('\n');
    const filteredLines = lines.filter(line => {
      // Remove lines that look like footers (page numbers, etc.)
      return !(/^\s*\d+\s*$/.test(line.trim())); // Remove lines with just numbers
    });
    return filteredLines.join('\n');
  }

  /**
   * Normalize whitespace
   * @param {string} text - Text content
   * @returns {string} Text with normalized whitespace
   * @private
   */
  normalizeWhitespace(text) {
    return text
      .replace(/\n\s*\n/g, '\n\n') // Remove excessive blank lines
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  /**
   * Create chunks from text content
   * @param {string} text - Text content
   * @returns {Array} Array of text chunks
   * @private
   */
  createChunks(text) {
        const chunks = [];
    const words = text.split(/\s+/);
    
    for (let i = 0; i < words.length; i += this.config.chunkSize - this.config.overlapSize) {
      const chunk = words.slice(i, i + this.config.chunkSize).join(' ');
      if (chunk.trim()) {
                chunks.push({
          id: `chunk_${i}`,
          content: chunk,
          startIndex: i,
          endIndex: Math.min(i + this.config.chunkSize, words.length),
          wordCount: chunk.split(/\s+/).length
        });
      }
        }

        return chunks;
    }

    /**
   * Generate document ID
   * @param {string} filePath - File path
   * @param {Object} metadata - File metadata
   * @returns {string} Document ID
   * @private
   */
  generateDocumentId(filePath, metadata = {}) {
    const fileName = path.basename(filePath);
    const fileSize = metadata.fileSize || 0;
    const modifiedDate = metadata.modifiedDate || new Date();
    
    const hashInput = `${fileName}_${fileSize}_${modifiedDate.getTime()}`;
    return crypto.createHash('md5').update(hashInput).digest('hex');
  }

  /**
   * Get MIME type for file extension
   * @param {string} extension - File extension
   * @returns {string} MIME type
   * @private
   */
  getMimeType(extension) {
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.doc': 'application/msword',
      '.txt': 'text/plain',
      '.md': 'text/markdown'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Process multiple documents
   * @param {Array} filePaths - Array of file paths
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Array of processed documents
   */
  async processDocuments(filePaths, options = {}) {
    this.logger.info(`📄 Processing ${filePaths.length} documents`);

    const results = [];
    const errors = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.processDocument(filePath, options);
        results.push(result);
        
        if (result.status === 'failed') {
          errors.push({
            filePath,
            error: result.metadata.error
          });
        }
      } catch (error) {
        this.logger.error(`❌ Failed to process ${filePath}`, {
          error: error.message
        });
        errors.push({
          filePath,
          error: error.message
        });
      }
    }

    this.logger.info(`✅ Processed ${results.length} documents, ${errors.length} errors`);

    return {
      documents: results,
      errors,
      summary: {
        total: filePaths.length,
        successful: results.filter(r => r.status === 'processed').length,
        failed: errors.length
      }
    };
  }

  /**
   * Get processing statistics
   * @returns {Object} Processing statistics
     */
    getStats() {
        return {
      supportedFormats: this.config.supportedFormats,
      maxFileSize: this.config.maxFileSize,
      chunkSize: this.config.chunkSize,
      overlapSize: this.config.overlapSize
    };
  }
}

module.exports = DocumentProcessor;