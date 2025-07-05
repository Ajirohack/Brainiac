const axios = require('axios');
require('dotenv').config();

async function testOllamaConnection() {
  const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const TEST_MODEL = process.env.OLLAMA_TEST_MODEL || 'llama2';

  console.log('=== Testing Ollama Connection ===');
  console.log(`Base URL: ${OLLAMA_BASE_URL}`);
  console.log(`Test Model: ${TEST_MODEL}`);

  try {
    // Test 1: Check if Ollama service is running
    console.log('\n1. Checking Ollama service status...');
    const statusResponse = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 5000 });
    console.log('✅ Ollama service is running');
    console.log('Available models:', statusResponse.data.models.map(m => m.name).join(', '));

    // Test 2: Generate text completion
    console.log('\n2. Testing text generation...');
    const completionResponse = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: TEST_MODEL,
        prompt: 'Hello, how are you?',
        stream: false
      },
      { timeout: 30000 }
    );
    console.log('✅ Text generation successful');
    console.log('Response:', completionResponse.data.response.substring(0, 100) + '...');

    // Test 3: Generate embeddings
    console.log('\n3. Testing embedding generation...');
    const embeddingResponse = await axios.post(
      `${OLLAMA_BASE_URL}/api/embeddings`,
      {
        model: TEST_MODEL,
        prompt: 'This is a test sentence.'
      },
      { timeout: 10000 }
    );
    console.log('✅ Embedding generation successful');
    console.log(`Generated embedding with ${embeddingResponse.data.embedding.length} dimensions`);

    console.log('\n✅ All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else if (error.request) {
      console.error('No response received:', error.message);
      console.error('Is the Ollama service running?');
      console.error(`Try running: docker-compose -f docker-compose.ollama.yml up -d`);
    } else {
      console.error('Error:', error.message);
    }
    
    process.exit(1);
  }
}

testOllamaConnection();
