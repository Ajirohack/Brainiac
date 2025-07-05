# Ollama Integration with Docker

This document provides instructions for setting up and using Ollama with Docker in the Brainiac project.

## Prerequisites

- Docker installed and running
- Sufficient disk space for models (several GB per model)
- At least 8GB RAM (16GB+ recommended)

## Quick Start

1. Build and start the Ollama service:
   ```powershell
   .\scripts\setup-ollama.ps1
   ```

2. Verify the service is running:
   ```powershell
   docker ps  # Should show the ollama container
   ```

3. Test the API:
   ```powershell
   curl http://localhost:11434/api/tags
   ```

## Configuration

### Docker Compose

The `docker-compose.ollama.yml` file contains the Ollama service configuration. Key settings:

- **Ports**: Exposes Ollama on port 11434
- **Volumes**: Persists models in a Docker volume named `ollama_data`
- **Environment**: Sets `OLLAMA_HOST=0.0.0.0` to allow external connections

### Environment Variables

Add these to your `.env` file:

```env
# Ollama Configuration
OLLAMA_BASE_URL=http://ollama:11434
DEFAULT_LLM_PROVIDER=ollama
DEFAULT_LLM_MODEL=llama2
```

## Usage

### Pulling Models

To download additional models:

```powershell
docker exec ollama ollama pull <model-name>
```

Example models:
- `llama2`
- `mistral`
- `codellama`
- `gemma`

### Interacting with Models

1. Start an interactive session:
   ```powershell
   docker exec -it ollama ollama run llama2
   ```

2. Or use the API directly:
   ```powershell
   $body = @{
       model = "llama2"
       prompt = "Why is the sky blue?"
       stream = $false
   } | ConvertTo-Json
   
   Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body $body -ContentType "application/json"
   ```

## Integration with Brainiac

The Brainiac platform is configured to use Ollama as an LLM provider. The `OllamaClient` class handles communication with the Ollama API.

### Example Usage

```javascript
const { Ollama } = require('@langchain/ollama');

const ollama = new Ollama({
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  model: process.env.OLLAMA_MODEL || 'llama2',
});

async function generateText(prompt) {
  const response = await ollama.invoke(prompt);
  return response;
}
```

## Troubleshooting

### Common Issues

1. **Container fails to start**:
   - Check Docker logs: `docker logs ollama`
   - Ensure port 11434 is available
   - Verify sufficient disk space

2. **Model not found**:
   - Check if model is downloaded: `docker exec ollama ollama list`
   - Pull the model: `docker exec ollama ollama pull <model-name>`

3. **Performance issues**:
   - Allocate more CPU/memory to Docker
   - Use smaller models for less powerful hardware
   - Enable GPU acceleration if available

## References

- [Ollama Documentation](https://github.com/ollama/ollama/tree/main/docs)
- [Docker Setup](https://github.com/ollama/ollama/blob/main/docs/docker.md)
- [API Reference](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Troubleshooting](https://github.com/ollama/ollama/blob/main/docs/troubleshooting.md)
https://github.com/ollama/ollama
https://github.com/ollama/ollama/blob/main/docs/docker.md
https://github.com/ollama/ollama/blob/main/docs/windows.md
https://github.com/ollama/ollama/blob/main/docs/examples.md
https://github.com/ollama/ollama/blob/main/docs/api.md
https://github.com/ollama/ollama/blob/main/docs/troubleshooting.md
https://github.com/ollama/ollama/blob/main/docs/development.md
https://github.com/ollama/ollama-python
https://github.com/ollama/ollama-js