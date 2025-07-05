const { test, expect, beforeAll, afterAll } = require('@jest/globals');
const axios = require('axios');
const { Ollama } = require('@langchain/ollama');
require('dotenv').config();

// Test configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const TEST_MODEL = process.env.OLLAMA_TEST_MODEL || 'llama2';

// Ollama client instance
let ollamaClient;

// Simple logger for tests
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args)
};

describe('Ollama Integration Tests', () => {
  beforeAll(async () => {
    // Initialize the Ollama client
    ollamaClient = new Ollama({
      baseUrl: OLLAMA_BASE_URL,
      model: TEST_MODEL,
    });
  });

  test('should connect to Ollama service', async () => {
    try {
      logger.info(`Connecting to Ollama service at ${OLLAMA_BASE_URL}`);
      const response = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, {
        timeout: 5000 // 5 second timeout
      });
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('models');
      logger.info(`Connected to Ollama service. Found ${response.data.models.length} models.`);
      return true;
    } catch (error) {
      const errorMsg = `Failed to connect to Ollama service at ${OLLAMA_BASE_URL}: ${error.message}`;
      logger.error(errorMsg);
      if (error.response) {
        logger.error('Response data:', error.response.data);
        logger.error('Status code:', error.response.status);
      }
      throw new Error(errorMsg);
    }
  });

  test('should generate text completion', async () => {
    const prompt = 'Explain quantum computing in simple terms';
    
    try {
      logger.info(`Generating text with model: ${TEST_MODEL}`);
      const response = await ollamaClient.invoke(prompt);
      
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
      
      const preview = response.length > 100 ? response.substring(0, 100) + '...' : response;
      logger.info(`Generated text (${response.length} chars): ${preview}`);
      return true;
    } catch (error) {
      const errorMsg = `Text generation failed: ${error.message}`;
      logger.error(errorMsg);
      if (error.response) {
        logger.error('Response data:', error.response.data);
      }
      throw new Error(errorMsg);
    }
  }, 60000); // Increased timeout for LLM response

  test('should generate embeddings', async () => {
    const text = 'This is a test sentence for embedding generation';
    
    try {
      logger.info(`Generating embeddings with model: ${TEST_MODEL}`);
      const response = await axios.post(
        `${OLLAMA_BASE_URL}/api/embeddings`,
        {
          model: TEST_MODEL,
          prompt: text,
        },
        {
          timeout: 10000, // 10 second timeout
          headers: { 'Content-Type': 'application/json' }
        }
      );
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data.embedding)).toBe(true);
      
      const embeddingLength = response.data.embedding.length;
      expect(embeddingLength).toBeGreaterThan(0);
      
      logger.info(`Generated embedding with ${embeddingLength} dimensions`);
      return true;
    } catch (error) {
      const errorMsg = `Embedding generation failed: ${error.message}`;
      logger.error(errorMsg);
      if (error.response) {
        logger.error('Response status:', error.response.status);
        logger.error('Response data:', error.response.data);
      }
      throw new Error(errorMsg);
    }
  });
});
