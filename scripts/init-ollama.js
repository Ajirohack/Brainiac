#!/usr/bin/env node

/**
 * Initialize Ollama with default models
 * Run this script after starting the Ollama service
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_MODELS = ['llama2', 'mistral'];

async function checkOllamaService() {
  try {
    const { stdout } = await execAsync('docker ps --filter "name=ollama" --format "{{.Names}}"');
    return stdout.trim() === 'ollama';
  } catch (error) {
    return false;
  }
}

async function pullModel(model) {
  console.log(`Pulling model: ${model}...`);
  try {
    const { stdout, stderr } = await execAsync(`docker exec ollama ollama pull ${model}`);
    console.log(`✅ Successfully pulled ${model}`);
    console.log(stdout);
    return true;
  } catch (error) {
    console.error(`❌ Failed to pull ${model}:`, error.stderr || error.message);
    return false;
  }
}

async function listModels() {
  try {
    const { stdout } = await execAsync('docker exec ollama ollama list');
    console.log('\nAvailable models:');
    console.log(stdout);
    return stdout;
  } catch (error) {
    console.error('Failed to list models:', error);
    return '';
  }
}

async function main() {
  console.log('🚀 Initializing Ollama with default models\n');
  
  // Check if Ollama container is running
  console.log('🔍 Checking if Ollama service is running...');
  const isRunning = await checkOllamaService();
  
  if (!isRunning) {
    console.log('ℹ️ Ollama container is not running. Starting it now...');
    try {
      await execAsync('docker-compose -f docker-compose.ollama.yml up -d');
      console.log('✅ Ollama service started');
      // Wait for the service to initialize
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.error('❌ Failed to start Ollama service:', error);
      process.exit(1);
    }
  } else {
    console.log('✅ Ollama service is running');
  }
  
  // Check available models
  const modelsList = await listModels();
  
  // Pull default models if they don't exist
  for (const model of DEFAULT_MODELS) {
    if (!modelsList.includes(model)) {
      await pullModel(model);
    } else {
      console.log(`ℹ️ Model ${model} already exists, skipping...`);
    }
  }
  
  // Final status
  console.log('\n✨ Ollama initialization complete!');
  console.log('You can now use Ollama with the following models:');
  await listModels();
  console.log('\n📡 Ollama API is available at:', OLLAMA_BASE_URL);
  console.log('💡 Try it with: curl', `${OLLAMA_BASE_URL}/api/generate`,
    '-d \'{"model": "llama2", "prompt": "Hello"}\'');
}

main().catch(console.error);
