const { test, expect, beforeAll, afterAll } = require('@jest/globals');
const { Ollama } = require('@langchain/ollama');
const ollamaConfig = require('../../src/config/ollama.config');

// Increase timeout for integration tests
jest.setTimeout(60000);

describe('Ollama Integration', () => {
  let ollama;

  beforeAll(() => {
    // Initialize Ollama client
    ollama = new Ollama({
      baseUrl: ollamaConfig.baseUrl,
      model: ollamaConfig.model,
      temperature: ollamaConfig.temperature,
      ...ollamaConfig.modelOptions,
    });
  });

  test('should connect to Ollama service', async () => {
    // Simple ping test
    const response = await fetch(`${ollamaConfig.baseUrl}/api/tags`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('models');
    console.log('Available models:', data.models.map(m => m.name).join(', '));
  });

  test('should generate text using Ollama', async () => {
    const prompt = 'Explain quantum computing in one sentence.';
    const response = await ollama.invoke(prompt);
    
    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
    console.log('Generated text:', response.substring(0, 100) + '...');
  });

  test('should handle streaming responses', async () => {
    const prompt = 'Tell me a short story about AI.';
    const stream = await ollama.stream(prompt);
    
    let chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    const response = chunks.join('');
    expect(response.length).toBeGreaterThan(0);
    console.log('Streamed response length:', response.length);
  });

  test('should handle errors gracefully', async () => {
    // Test with invalid model
    const invalidOllama = new Ollama({
      baseUrl: ollamaConfig.baseUrl,
      model: 'non-existent-model',
    });
    
    await expect(invalidOllama.invoke('Hello')).rejects.toThrow();
  });
});
