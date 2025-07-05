# Ollama LLM Integration Guide

This document provides a comprehensive guide for setting up and using Ollama LLMs with the Brainiac platform in a Docker environment.

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Docker Compose Configuration](#docker-compose-configuration)
- [Available Models](#available-models)
- [API Integration](#api-integration)
- [Troubleshooting](#troubleshooting)
- [Performance Tuning](#performance-tuning)
- [Security Considerations](#security-considerations)

## Overview

Ollama provides an easy way to run large language models locally. This guide explains how to integrate Ollama with the Brainiac platform using Docker for containerization.

## Prerequisites

- Docker 20.10.0 or higher
- Docker Compose 2.0.0 or higher
- Minimum 16GB RAM (32GB recommended for larger models)
- NVIDIA GPU with CUDA support (recommended)

## Quick Start

1. Clone the Brainiac repository:
   ```bash
   git clone https://github.com/your-org/brainiac.git
   cd brainiac
   ```

2. Start the Ollama service:
   ```bash
   docker-compose -f docker-compose.ollama.yml up -d
   ```

3. Pull a model (e.g., llama2):
   ```bash
   docker exec -it ollama ollama pull llama2
   ```

4. Verify the installation:
   ```bash
   curl http://localhost:11434/api/tags
   ```

## Docker Compose Configuration

The `docker-compose.ollama.yml` file contains the following configuration:

```yaml
version: '3.8'

services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped

volumes:
  ollama_data:
```

### Configuration Options

- **Ports**: Change the host port mapping if 11434 is already in use
- **Volumes**: Persist model data in the `ollama_data` volume
- **GPU**: Remove the `deploy` section if you don't have an NVIDIA GPU

## Available Models

Ollama supports various models. Here are some popular ones:

| Model Name     | Description                          | RAM Required |
|----------------|--------------------------------------|--------------|
| llama2         | Meta's LLaMA 2 (7B parameters)      | 8GB+         |
| mistral        | Mistral 7B                          | 8GB+         |
| codellama      | Code generation model               | 8GB+         |
| orca-mini      | Small, fast model                   | 4GB+         |
| vicuna         | Fine-tuned LLaMA for chat           | 8GB+         |

To see all available models:
```bash
docker exec -it ollama ollama list
```

## API Integration

The Ollama service provides a REST API at `http://localhost:11434`. Here's how to use it with the Brainiac platform:

### 1. Update Environment Variables

In your `.env` file, add:
```
# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_LLM_PROVIDER=ollama
DEFAULT_LLM_MODEL=llama2
```

### 2. Example API Usage

```javascript
// Using fetch
const response = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'llama2',
    prompt: 'Explain how the brain works',
    stream: false
  })
});

const data = await response.json();
console.log(data.response);
```

### 3. Streaming Responses

For streaming responses, set `stream: true` and handle the server-sent events:

```javascript
const eventSource = new EventSource('http://localhost:11434/api/generate?prompt=Tell%20me%20a%20story&stream=true');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.done) {
    eventSource.close();
    return;
  }
  process.stdout.write(data.response);
};
```

## Troubleshooting

### Common Issues

1. **CUDA Out of Memory**
   - Try a smaller model
   - Reduce the context window size
   - Close other GPU applications

2. **Model Not Found**
   ```bash
   docker exec -it ollama ollama pull <model-name>
   ```

3. **Slow Performance**
   - Enable GPU acceleration if available
   - Reduce the context window size
   - Use a smaller model

### Checking Logs

```bash
docker logs ollama
```

## Performance Tuning

### GPU Acceleration

For optimal performance with NVIDIA GPUs:

1. Install the NVIDIA Container Toolkit:
   ```bash
   distribution=$(. /etc/os-release;echo $ID$VERSION_ID) \
   && curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add - \
   && curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
   
   sudo apt-get update
   sudo apt-get install -y nvidia-docker2
   sudo systemctl restart docker
   ```

2. Verify GPU access:
   ```bash
   docker run --gpus all nvidia/cuda:11.0-base nvidia-smi
   ```

### Memory Management

- Monitor memory usage: `docker stats ollama`
- Set memory limits in `docker-compose.ollama.yml`:
  ```yaml
  deploy:
    resources:
      limits:
        memory: 16G
  ```

## Security Considerations

1. **Network Security**
   - Don't expose the Ollama API (port 11434) to the internet
   - Use a reverse proxy with authentication
   - Enable TLS/SSL for production use

2. **Model Security**
   - Only download models from trusted sources
   - Verify model checksums
   - Keep the Ollama container updated

3. **Data Privacy**
   - Process sensitive data only in secure environments
   - Review model licenses and usage restrictions

## Next Steps

- [Explore more models](https://ollama.ai/library)
- [Advanced configuration options](https://github.com/ollama/ollama)
- [API documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
