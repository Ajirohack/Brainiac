const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const { getLLMService } = require('../../services/llm/LLMService');
const logger = require('../../utils/logger');
const { authenticateToken } = require('../../middleware/auth');
const { validateRequest } = require('../../middleware/validation');

// Initialize LLM service
const llmService = getLLMService({ logger });

/**
 * @swagger
 * tags:
 *   name: LLM
 *   description: Large Language Model operations
 */

/**
 * @swagger
 * /api/llm/chat/completions:
 *   post:
 *     summary: Create a chat completion
 *     tags: [LLM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - messages
 *             properties:
 *               providerId:
 *                 type: string
 *                 description: ID of the provider to use
 *               model:
 *                 type: string
 *                 description: Model to use for completion
 *               messages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [system, user, assistant, function]
 *                     content:
 *                       type: string
 *                     name:
 *                       type: string
 *                     function_call:
 *                       type: object
 *               stream:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to stream the response
 *               options:
 *                 type: object
 *                 description: Additional options for the completion
 *                 properties:
 *                   temperature:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 2
 *                     default: 0.7
 *                   max_tokens:
 *                     type: integer
 *                     minimum: 1
 *                   top_p:
 *                     type: number
 *                     minimum: 0
 *                     maximum: 1
 *                   frequency_penalty:
 *                     type: number
 *                     minimum: -2
 *                     maximum: 2
 *                   presence_penalty:
 *                     type: number
 *                     minimum: -2
 *                     maximum: 2
 *                   stop:
 *                     type: array
 *                     items:
 *                       type: string
 *                   functions:
 *                     type: array
 *                     items:
 *                       type: object
 *                   function_call:
 *                     type: string | object
 *     responses:
 *       200:
 *         description: Chat completion response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 object:
 *                   type: string
 *                 created:
 *                   type: integer
 *                 model:
 *                   type: string
 *                 choices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       index:
 *                         type: integer
 *                       message:
 *                         type: object
 *                         properties:
 *                           role:
 *                             type: string
 *                           content:
 *                             type: string
 *                           function_call:
 *                             type: object
 *                       finish_reason:
 *                         type: string
 *                 usage:
 *                   type: object
 *                   properties:
 *                     prompt_tokens:
 *                       type: integer
 *                     completion_tokens:
 *                       type: integer
 *                     total_tokens:
 *                       type: integer
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  '/chat/completions',
  authenticateToken,
  [
    body('providerId').optional().isString().trim(),
    body('model').optional().isString().trim(),
    body('messages').isArray().withMessage('Messages must be an array'),
    body('messages.*.role').isIn(['system', 'user', 'assistant', 'function']).withMessage('Invalid role'),
    body('messages.*.content').isString().withMessage('Content must be a string'),
    body('stream').optional().isBoolean(),
    body('options').optional().isObject(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { providerId, model, messages, options = {}, stream = false } = req.body;
      
      // Handle streaming response
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // Create a stream to the LLM service
        await llmService.createChatCompletion({
          providerId,
          model,
          messages,
          options,
          stream: true,
          onData: (chunk) => {
            try {
              if (chunk.done) {
                res.write('data: [DONE]\n\n');
                res.end();
                return;
              }
              
              if (chunk.error) {
                logger.error('Error in chat completion stream:', chunk.error);
                res.status(500).json({ error: 'Error in chat completion stream' });
                return;
              }
              
              // Send the chunk as an SSE event
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            } catch (error) {
              logger.error('Error sending SSE chunk:', error);
              res.status(500).json({ error: 'Error streaming response' });
            }
          },
        });
        
        // Handle client disconnect
        req.on('close', () => {
          // Clean up resources if needed
          logger.info('Client disconnected from chat completion stream');
        });
        
        return;
      }
      
      // Handle non-streaming response
      const response = await llmService.createChatCompletion({
        providerId,
        model,
        messages,
        options,
        stream: false,
      });
      
      res.json(response);
      
    } catch (error) {
      logger.error('Chat completion error:', error);
      
      if (!res.headersSent) {
        const statusCode = error.statusCode || 500;
        res.status(statusCode).json({
          error: error.message || 'Failed to create chat completion',
          code: error.code,
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        });
      }
    }
  }
);

/**
 * @swagger
 * /api/llm/embeddings:
 *   post:
 *     summary: Create embeddings for the input text(s)
 *     tags: [LLM]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - input
 *             properties:
 *               providerId:
 *                 type: string
 *                 description: ID of the provider to use
 *               model:
 *                 type: string
 *                 description: Model to use for embeddings
 *               input:
 *                 type: string | array
 *                 description: Input text or array of texts to get embeddings for
 *     responses:
 *       200:
 *         description: Embeddings response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 object:
 *                   type: string
 *                   enum: [list]
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       object:
 *                         type: string
 *                         enum: [embedding]
 *                       embedding:
 *                         type: array
 *                         items:
 *                           type: number
 *                       index:
 *                         type: integer
 *                 model:
 *                   type: string
 *                 usage:
 *                   type: object
 *                   properties:
 *                     prompt_tokens:
 *                       type: integer
 *                     total_tokens:
 *                       type: integer
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  '/embeddings',
  authenticateToken,
  [
    body('providerId').optional().isString().trim(),
    body('model').optional().isString().trim(),
    body('input')
      .custom((value) => {
        return typeof value === 'string' || (Array.isArray(value) && value.every(item => typeof item === 'string'));
      })
      .withMessage('Input must be a string or an array of strings'),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { providerId, model, input } = req.body;
      
      const response = await llmService.createEmbedding({
        providerId,
        input,
        model,
      });
      
      res.json(response);
      
    } catch (error) {
      logger.error('Embedding creation error:', error);
      
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        error: error.message || 'Failed to create embeddings',
        code: error.code,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
);

/**
 * @swagger
 * /api/llm/models:
 *   get:
 *     summary: List available models
 *     tags: [LLM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: providerId
 *         schema:
 *           type: string
 *         description: Filter models by provider ID
 *     responses:
 *       200:
 *         description: List of available models
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   provider:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       provider_type:
 *                         type: string
 *                   is_chat_model:
 *                     type: boolean
 *                   is_embedding_model:
 *                     type: boolean
 *                   context_length:
 *                     type: integer
 *                   max_tokens:
 *                     type: integer
 *                   config:
 *                     type: object
 *                   capabilities:
 *                     type: array
 *                     items:
 *                       type: string
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   updated_at:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  '/models',
  authenticateToken,
  [
    param('providerId').optional().isString().trim(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { providerId } = req.query;
      
      const models = await llmService.listModels({
        providerId,
        activeOnly: true,
      });
      
      res.json(models);
      
    } catch (error) {
      logger.error('Failed to list models:', error);
      
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        error: error.message || 'Failed to list models',
        code: error.code,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
);

/**
 * @swagger
 * /api/llm/models/{modelId}:
 *   get:
 *     summary: Get model by ID
 *     tags: [LLM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the model to retrieve
 *     responses:
 *       200:
 *         description: Model details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 provider:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     provider_type:
 *                       type: string
 *                 is_chat_model:
 *                   type: boolean
 *                 is_embedding_model:
 *                   type: boolean
 *                 context_length:
 *                   type: integer
 *                 max_tokens:
 *                   type: integer
 *                 config:
 *                   type: object
 *                 capabilities:
 *                   type: array
 *                   items:
 *                     type: string
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Model not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/models/:modelId',
  authenticateToken,
  [
    param('modelId').isString().trim().notEmpty(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { modelId } = req.params;
      
      const model = await llmService.getModel(modelId);
      
      if (!model) {
        return res.status(404).json({
          error: 'Model not found',
        });
      }
      
      res.json(model);
      
    } catch (error) {
      logger.error(`Failed to get model ${req.params.modelId}:`, error);
      
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        error: error.message || 'Failed to get model',
        code: error.code,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
);

/**
 * @swagger
 * /api/llm/providers:
 *   get:
 *     summary: List available providers
 *     tags: [LLM]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available providers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   provider_type:
 *                     type: string
 *                   base_url:
 *                     type: string
 *                   is_active:
 *                     type: boolean
 *                   config:
 *                     type: object
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   updated_at:
 *                     type: string
 *                     format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  '/providers',
  authenticateToken,
  async (req, res) => {
    try {
      const providers = await llmService.listProviders({
        activeOnly: true,
      });
      
      res.json(providers);
      
    } catch (error) {
      logger.error('Failed to list providers:', error);
      
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        error: error.message || 'Failed to list providers',
        code: error.code,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
);

/**
 * @swagger
 * /api/llm/providers/{providerId}:
 *   get:
 *     summary: Get provider by ID
 *     tags: [LLM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the provider to retrieve
 *     responses:
 *       200:
 *         description: Provider details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 provider_type:
 *                   type: string
 *                 base_url:
 *                   type: string
 *                 is_active:
 *                   type: boolean
 *                 config:
 *                   type: object
 *                 created_at:
 *                   type: string
 *                   format: date-time
 *                 updated_at:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Provider not found
 *       500:
 *         description: Internal server error
 */
router.get(
  '/providers/:providerId',
  authenticateToken,
  [
    param('providerId').isString().trim().notEmpty(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { providerId } = req.params;
      
      const provider = await llmService.getProvider(providerId);
      
      if (!provider) {
        return res.status(404).json({
          error: 'Provider not found',
        });
      }
      
      res.json(provider);
      
    } catch (error) {
      logger.error(`Failed to get provider ${req.params.providerId}:`, error);
      
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        error: error.message || 'Failed to get provider',
        code: error.code,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
);

/**
 * @swagger
 * /api/llm/providers/{providerId}/sync:
 *   post:
 *     summary: Sync models for a provider
 *     tags: [LLM]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the provider to sync models for
 *     responses:
 *       200:
 *         description: Models synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Provider not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/providers/:providerId/sync',
  authenticateToken,
  [
    param('providerId').isString().trim().notEmpty(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      const { providerId } = req.params;
      
      const models = await llmService.syncProviderModels(providerId);
      
      res.json(models);
      
    } catch (error) {
      logger.error(`Failed to sync models for provider ${req.params.providerId}:`, error);
      
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        error: error.message || 'Failed to sync models',
        code: error.code,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
);

module.exports = router;
