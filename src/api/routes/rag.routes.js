const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { body, param, validationResult } = require('express-validator');
const { authenticateToken } = require('../../middleware/auth');
const { validateRequest } = require('../../middleware/validation');
const { getVectorStore } = require('../../services/vector-store');
const logger = require('../../utils/logger');
const { ValidationError, NotFoundError, UnauthorizedError, InternalServerError } = require('../../utils/errors');

// Maximum file size in bytes (100MB)
const MAX_FILE_SIZE = 100 * 1024 * 1024;
// Allowed file types
const ALLOWED_FILE_TYPES = ['.pdf', '.txt', '.md', '.zip'];
// Maximum number of files to process in a single batch
const MAX_BATCH_FILES = 10;
// Maximum number of chunks per file
const MAX_CHUNKS_PER_FILE = 1000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const uploadDir = path.join(process.cwd(), 'uploads');
      // Create upload directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
      }
      // Check write permissions
      fs.access(uploadDir, fs.constants.W_OK, (err) => {
        if (err) {
          logger.error(`No write permissions for upload directory: ${uploadDir}`, { error: err });
          return cb(new Error('Server configuration error: Cannot write to upload directory'));
        }
        cb(null, uploadDir);
      });
    } catch (error) {
      logger.error('Error configuring upload directory', { error });
      cb(new InternalServerError('Failed to configure file upload'));
    }
  },
  filename: (req, file, cb) => {
    try {
      // Sanitize filename to prevent path traversal
      const cleanName = file.originalname.replace(/[^\w\d\.\-_]/g, '_');
      const ext = path.extname(cleanName).toLowerCase();
      const baseName = path.basename(cleanName, ext);
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      cb(null, `${baseName}-${uniqueSuffix}${ext}`);
    } catch (error) {
      logger.error('Error generating filename', { error, originalname: file.originalname });
      cb(new Error('Failed to process filename'));
    }
  },
});

// Custom error handler for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        error: 'File too large',
        message: `File size exceeds the limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
      });
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ 
        error: 'Invalid file',
        message: 'Unexpected file field'
      });
    }
    return res.status(400).json({ 
      error: 'File upload error',
      message: err.message 
    });
  } else if (err) {
    // Handle other errors
    logger.error('File upload error', { error: err });
    return res.status(500).json({ 
      error: 'File upload failed',
      message: 'An error occurred while processing your file'
    });
  }
  next();
};

const upload = multer({
  storage,
  limits: { 
    fileSize: MAX_FILE_SIZE,
    files: 1, // Only allow one file per request
    fieldNameSize: 100, // Limit field name size
    fieldSize: 1024 * 100, // 100KB max for non-file fields
  },
  fileFilter: (req, file, cb) => {
    try {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_FILE_TYPES.includes(ext)) {
        return cb(new ValidationError(
          'Invalid file type', 
          `Only ${ALLOWED_FILE_TYPES.join(', ')} files are allowed`
        ));
      }
      
      // Additional file validation can be added here
      // For example, check MIME type, file signature, etc.
      
      cb(null, true);
    } catch (error) {
      logger.error('File filter error', { error, file: file.originalname });
      cb(new ValidationError('Invalid file', 'Failed to validate file'));
    }
  },
});

/**
 * @swagger
 * tags:
 *   name: RAG
 *   description: Retrieval-Augmented Generation operations
 */

/**
 * @swagger
 * /api/rag/upload:
 *   post:
 *     summary: Upload a file to the knowledge base
 *     tags: [RAG]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File to upload (PDF, TXT, MD, or ZIP)
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 type:
 *                   type: string
 *                 size:
 *                   type: number
 *                 status:
 *                   type: string
 *       400:
 *         description: Invalid file type or missing file
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
// Input validation for file upload
const validateFileUpload = [
  // Validate file exists
  (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No file provided',
        message: 'Please select a file to upload'
      });
    }
    next();
  },
  // Validate file size
  (req, res, next) => {
    if (req.file.size > MAX_FILE_SIZE) {
      return res.status(413).json({
        error: 'File too large',
        message: `File size exceeds the limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
      });
    }
    next();
  },
  // Sanitize and validate file name
  (req, res, next) => {
    try {
      const sanitizedName = req.file.originalname.replace(/[^\w\d\.\-_ ]/g, '_');
      req.file.originalname = sanitizedName.substring(0, 255); // Limit filename length
      next();
    } catch (error) {
      logger.error('Error sanitizing filename', { error, file: req.file });
      return res.status(400).json({
        error: 'Invalid filename',
        message: 'The provided filename contains invalid characters'
      });
    }
  }
];

router.post(
  '/upload',
  authenticateToken,
  upload.single('file'),
  handleMulterError,
  validateFileUpload,
  async (req, res, next) => {
    try {
      const fileExt = path.extname(req.file.originalname).toLowerCase().substring(1);
      const fileType = ['pdf', 'txt', 'md'].includes(fileExt) ? fileExt : 'other';

      // Create file record in database within a transaction
      const transaction = await req.db.sequelize.transaction();
      
      try {
        const fileRecord = await req.db.KnowledgeFile.create({
          id: uuidv4(),
          name: req.file.originalname,
          type: fileType,
          size: req.file.size,
          path: req.file.path,
          status: 'processing',
          created_by: req.user.id,
        }, { transaction });

        // Commit the transaction
        await transaction.commit();

        // Process the file in the background
        processFile(fileRecord, req.db).catch((error) => {
          logger.error('Error processing file:', { 
            error: error.message, 
            stack: error.stack,
            fileId: fileRecord.id 
          });
          
          // Update file status to failed with error details
          req.db.KnowledgeFile.update(
            { 
              status: 'failed', 
              error: error.message,
              updated_at: new Date()
            },
            { 
              where: { id: fileRecord.id },
              silent: true // Don't update timestamps
            }
          ).catch(updateError => {
            logger.error('Failed to update file status to failed:', {
              fileId: fileRecord.id,
              error: updateError.message
            });
          });
        });

        // Return the file record without sensitive data
        const { path: _, ...fileData } = fileRecord.get({ plain: true });
        return res.status(202).json({
          ...fileData,
          message: 'File upload accepted and is being processed'
        });
      } catch (dbError) {
        // Rollback transaction on error
        await transaction.rollback();
        throw dbError;
      }
    } catch (error) {
      // Clean up uploaded file if database operation failed
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlink(req.file.path, (unlinkError) => {
          if (unlinkError) {
            logger.error('Failed to clean up file after error:', {
              path: req.file.path,
              error: unlinkError.message
            });
          }
        });
      }
      
      logger.error('File upload failed:', { 
        error: error.message, 
        stack: error.stack,
        userId: req.user?.id,
        file: req.file?.originalname
      });
      
      next(error);
    }
  }
);

/**
 * Process an uploaded file (chunking, embedding, and storing in vector DB)
 * @param {Object} fileRecord - File record from database
 * @param {Object} db - Database instance
 */
/**
 * Process an uploaded file (chunking, embedding, and storing in vector DB)
 * @param {Object} fileRecord - File record from database
 * @param {Object} db - Database instance
 */
async function processFile(fileRecord, db) {
  const transaction = await db.sequelize.transaction();
  let tempFilesToCleanup = [];
  
  try {
    // Update file status to processing
    await db.KnowledgeFile.update(
      { 
        status: 'processing',
        updated_at: new Date()
      },
      { 
        where: { id: fileRecord.id },
        transaction,
        silent: true // Don't update timestamps
      }
    );

    // Verify file exists and is accessible
    if (!fs.existsSync(fileRecord.path)) {
      throw new Error('File not found or inaccessible');
    }

    // Get file stats for validation
    const stats = fs.statSync(fileRecord.path);
    if (stats.size === 0) {
      throw new Error('File is empty');
    }

    // Process the file based on its type
    let chunks = [];
    
    try {
      switch (fileRecord.type) {
        case 'pdf':
          chunks = await processPdfFile(fileRecord.path);
          break;
        case 'txt':
        case 'md':
          chunks = await processTextFile(fileRecord.path);
          break;
        case 'zip':
          chunks = await processZipFile(fileRecord.path);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileRecord.type}`);
      }

      // Validate chunks
      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('No valid content could be extracted from the file');
      }

      if (chunks.length > MAX_CHUNKS_PER_FILE) {
        throw new Error(`File contains too many chunks (${chunks.length} > ${MAX_CHUNKS_PER_FILE}). Please split the file into smaller parts.`);
      }

      // Get vector store instance
      const vectorStore = getVectorStore();
      
      // Process chunks in batches to avoid memory issues
      const batchSize = 50; // Process 50 chunks at a time
      let processedCount = 0;
      const documentIds = [];
      
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchIds = await vectorStore.addDocuments(batch);
        documentIds.push(...batchIds);
        
        // Update progress periodically
        processedCount += batch.length;
        const progress = Math.round((processedCount / chunks.length) * 100);
        
        await db.KnowledgeFile.update(
          { 
            status: `processing (${progress}%)`,
            updated_at: new Date()
          },
          { 
            where: { id: fileRecord.id },
            transaction,
            silent: true
          }
        );
      }

      // Final update with processed status
      await db.KnowledgeFile.update(
        { 
          status: 'processed',
          chunks_count: documentIds.length,
          processed_at: new Date(),
          updated_at: new Date()
        },
        { 
          where: { id: fileRecord.id },
          transaction,
          silent: true
        }
      );

      // Commit the transaction
      await transaction.commit();

      logger.info('File processed successfully', { 
        fileId: fileRecord.id,
        chunks: documentIds.length,
        fileSize: fileRecord.size,
        duration: Date.now() - new Date(fileRecord.created_at).getTime()
      });
    } catch (processingError) {
      // If we have a processing error, clean up any created chunks
      try {
        const vectorStore = getVectorStore();
        if (chunks && chunks.length > 0) {
          await vectorStore.deleteDocuments({
            filter: { source: fileRecord.id }
          });
        }
      } catch (cleanupError) {
        logger.error('Error cleaning up failed processing', {
          fileId: fileRecord.id,
          error: cleanupError.message
        });
      }
      
      throw processingError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    // Rollback transaction on error
    await transaction.rollback();
    
    // Log the error with context
    logger.error('Error processing file', { 
      error: error.message,
      stack: error.stack,
      fileId: fileRecord.id,
      fileType: fileRecord.type,
      fileSize: fileRecord.size
    });
    
    // Update file status to failed in a new transaction
    try {
      await db.KnowledgeFile.update(
        { 
          status: 'failed',
          error: error.message,
          updated_at: new Date()
        },
        { 
          where: { id: fileRecord.id },
          silent: true
        }
      );
    } catch (updateError) {
      logger.error('Failed to update file status to failed', {
        fileId: fileRecord.id,
        error: updateError.message
      });
    }
    
    // Clean up any temporary files
    await cleanupTempFiles(tempFilesToCleanup);
  }
}

/**
 * Clean up temporary files
 * @param {Array} files - Array of file paths to clean up
 */
async function cleanupTempFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return;
  
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        await fs.promises.unlink(file);
      }
    } catch (error) {
      logger.error('Error cleaning up temporary file', {
        file,
        error: error.message
      });
    }
  }
}

/**
 * Process a PDF file and split it into chunks
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<Array>} Array of document chunks
 */
async function processPdfFile(filePath) {
  // Implementation for PDF processing
  // This would use a library like pdf-parse or pdf.js
  // For now, we'll return a mock implementation
  return [
    {
      content: 'This is a sample PDF chunk 1',
      metadata: { source: path.basename(filePath), page: 1 }
    },
    {
      content: 'This is a sample PDF chunk 2',
      metadata: { source: path.basename(filePath), page: 2 }
    }
  ];
}

/**
 * Process a text file and split it into chunks
 * @param {string} filePath - Path to the text file
 * @returns {Promise<Array>} Array of document chunks
 */
async function processTextFile(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  // Simple chunking by paragraphs
  const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
  
  return paragraphs.map((paragraph, index) => ({
    content: paragraph.trim(),
    metadata: { 
      source: path.basename(filePath),
      chunk: index + 1
    }
  }));
}

/**
 * Process a ZIP file and extract text from contained files
 * @param {string} filePath - Path to the ZIP file
 * @returns {Promise<Array>} Array of document chunks
 */
async function processZipFile(filePath) {
  // Implementation for ZIP processing
  // This would use a library like adm-zip
  // For now, we'll return a mock implementation
  return [
    {
      content: 'This is a sample chunk from a file in the ZIP',
      metadata: { 
        source: `zip:${path.basename(filePath)}/document1.txt`,
        chunk: 1
      }
    }
  ];
}

/**
 * @swagger
 * /api/rag/files:
 *   get:
 *     summary: List all uploaded knowledge files
 *     tags: [RAG]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [processing, processed, failed]
 *         description: Filter by file status
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [pdf, txt, md, zip, other]
 *         description: Filter by file type
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by filename
 *     responses:
 *       200:
 *         description: List of knowledge files
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/KnowledgeFile'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       description: Total number of items
 *                     page:
 *                       type: integer
 *                       description: Current page number
 *                     limit:
 *                       type: integer
 *                       description: Number of items per page
 *                     totalPages:
 *                       type: integer
 *                       description: Total number of pages
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  '/files',
  authenticateToken,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['processing', 'processed', 'failed']),
    query('type').optional().isIn(['pdf', 'txt', 'md', 'zip', 'other']),
    query('search').optional().trim().escape()
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        type, 
        search 
      } = req.query;
      
      const offset = (page - 1) * limit;
      
      // Build where clause
      const where = {};
      if (status) where.status = status;
      if (type) where.type = type;
      if (search) {
        where.name = { [req.db.Sequelize.Op.like]: `%${search}%` };
      }
      
      // Get total count
      const total = await req.db.KnowledgeFile.count({ where });
      
      // Get paginated results
      const files = await req.db.KnowledgeFile.findAll({
        where,
        attributes: { exclude: ['path'] }, // Don't expose file system paths
        order: [['created_at', 'DESC']],
        limit,
        offset,
        raw: true
      });
      
      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit);
      
      res.json({
        data: files,
        pagination: {
          total,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          totalPages
        }
      });
    } catch (error) {
      logger.error('Error fetching knowledge files', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
      });
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/rag/files:
 *   get:
 *     summary: List all knowledge base files
 *     tags: [RAG]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [uploading, processing, processed, failed]
 *         description: Filter files by status
 *     responses:
 *       200:
 *         description: List of knowledge base files
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/KnowledgeFile'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/files', authenticateToken, async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = {};
    
    if (status) {
      where.status = status;
    }
    
    const files = await req.db.KnowledgeFile.findAll({
      where,
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['path', 'error'] },
    });
    
    res.json(files);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/rag/files/{fileId}:
 *   get:
 *     summary: Get a knowledge base file by ID
 *     tags: [RAG]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the file to retrieve
 *     responses:
 *       200:
 *         description: The requested knowledge base file
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/KnowledgeFile'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: File not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/files/:fileId',
  authenticateToken,
  [
    param('fileId').isUUID().withMessage('Invalid file ID format')
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const file = await req.db.KnowledgeFile.findByPk(req.params.fileId, {
        attributes: { exclude: ['path'] },
      });
      
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      res.json(file);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/rag/files/{fileId}:
 *   delete:
 *     summary: Delete a knowledge base file
 *     tags: [RAG]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the file to delete
 *     responses:
 *       204:
 *         description: File deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: File not found
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/files/:fileId',
  authenticateToken,
  [
    param('fileId').isUUID().withMessage('Invalid file ID format')
  ],
  validateRequest,
  async (req, res, next) => {
    const t = await req.db.sequelize.transaction();
    
    try {
      const file = await req.db.KnowledgeFile.findByPk(req.params.fileId, {
        transaction: t
      });
      
      if (!file) {
        await t.rollback();
        return res.status(404).json({ error: 'File not found' });
      }
      
      // Delete file from storage
      if (fs.existsSync(file.path)) {
        await fs.promises.unlink(file.path);
      }
      
      // Delete associated vector embeddings
      const vectorStore = getVectorStore();
      await vectorStore.delete({ source: file.path });
      
      // Delete file record from database
      await file.destroy({ transaction: t });
      
      await t.commit();
      
      res.status(204).send();
    } catch (error) {
      await t.rollback();
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/rag/query:
 *   post:
 *     summary: Query the knowledge base
 *     tags: [RAG]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The search query
 *                 minLength: 3
 *                 maxLength: 1000
 *               k:
 *                 type: integer
 *                 description: Number of results to return (1-20)
 *                 default: 4
 *                 minimum: 1
 *                 maximum: 20
 *               filter:
 *                 type: object
 *                 description: Additional filters for the search
 *                 properties:
 *                   fileId:
 *                     type: string
 *                     format: uuid
 *                     description: Filter by file ID
 *                   minScore:
 *                     type: number
 *                     description: Minimum similarity score (0-1)
 *                     default: 0.7
 *                     minimum: 0
 *                     maximum: 1
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SearchResult'
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     query:
 *                       type: string
 *                     totalResults:
 *                       type: integer
 *                     processingTimeMs:
 *                       type: number
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  '/query',
  authenticateToken,
  [
    body('query')
      .trim()
      .isLength({ min: 3, max: 1000 })
      .withMessage('Query must be between 3 and 1000 characters'),
    body('k')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('k must be between 1 and 20'),
    body('filter')
      .optional()
      .isObject()
      .withMessage('Filter must be an object'),
    body('filter.fileId')
      .optional()
      .isUUID()
      .withMessage('fileId must be a valid UUID'),
    body('filter.minScore')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('minScore must be between 0 and 1')
  ],
  validateRequest,
  async (req, res, next) => {
    try {
      const { query, k = 4, filter = {} } = req.body;
      const startTime = Date.now();
      
      // Build filter for vector store
      const vectorFilter = {};
      if (filter.fileId) {
        vectorFilter.source = filter.fileId;
      }
      
      // Get vector store and perform similarity search
      const vectorStore = getVectorStore();
      const results = await vectorStore.similaritySearch(
        query, 
        k,
        vectorFilter,
        filter.minScore
      );
      
      const processingTimeMs = Date.now() - startTime;
      
      logger.info('Knowledge base query executed', {
        queryLength: query.length,
        results: results.length,
        processingTimeMs,
        userId: req.user.id
      });
      
      res.json({
        results,
        metadata: {
          query,
          totalResults: results.length,
          processingTimeMs
        }
      });
    } catch (error) {
      logger.error('Error querying knowledge base', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        query: req.body?.query?.substring(0, 100) // Log first 100 chars
      });
      
      next(error);
    }
  }
);

// Error handling middleware
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 100MB' });
    }
    return res.status(400).json({ error: err.message });
  } else if (err) {
    // An unknown error occurred
    logger.error('RAG route error:', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'An error occurred while processing your request' });
  }
  next();
});

module.exports = router;
