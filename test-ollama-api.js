const axios = require('axios');
const { execSync } = require('child_process');

async function testOllama() {
  try {
    console.log('Testing Ollama API...');
    
    // Test 1: Check API version
    const version = await axios.get('http://localhost:11434/api/version');
    console.log('✅ Ollama version:', version.data.version);
    
    // Test 2: List available models
    try {
      const models = await axios.get('http://localhost:11434/api/tags');
      console.log('\nAvailable models:', models.data.models.length > 0 ? 
        models.data.models.map(m => m.name).join(', ') : 'None');
    } catch (error) {
      console.log('⚠️  No models found or error listing models');
    }
    
    // Test 3: Try to generate text
    try {
      console.log('\nTesting text generation...');
      const response = await axios.post('http://localhost:11434/api/generate', {
        model: 'llama2',
        prompt: 'Hello, how are you?',
        stream: false
      }, { timeout: 30000 });
      
      console.log('✅ Text generation successful!');
      console.log('Response:', response.data.response.substring(0, 100) + '...');
    } catch (error) {
      console.error('❌ Text generation failed:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing Ollama API:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    // Check if container is running
    try {
      const containerStatus = execSync('docker ps -f name=ollama --format "{{.Status}}"').toString().trim();
      console.log('\nContainer status:', containerStatus || 'Not running');
      
      if (!containerStatus) {
        console.log('\nTrying to start the container...');
        execSync('docker-compose -f docker-compose.ollama.yml up -d');
        console.log('Container started. Please wait a few seconds and try again.');
      }
    } catch (e) {
      console.error('Error checking container status:', e.message);
    }
  }
}

testOllama();
