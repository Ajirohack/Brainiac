# Script to set up and start Ollama with Docker
# Run this script with administrator privileges if needed

# Create the Docker network if it doesn't exist
$networkExists = docker network ls --filter name=^brainiac_network$ --format '{{.Name}}'
if (-not $networkExists) {
    Write-Host "Creating Docker network 'brainiac_network'..."
    docker network create brainiac_network
} else {
    Write-Host "Docker network 'brainiac_network' already exists."
}

# Build and start the Ollama service
Write-Host "Building and starting Ollama service..."
docker-compose -f docker-compose.ollama.yml up -d --build

# Wait for the service to start
Write-Host "Waiting for Ollama to initialize..."
Start-Sleep -Seconds 10

# Verify the service is running
$ollamaRunning = docker ps --filter "name=ollama" --format '{{.Names}}'
if ($ollamaRunning -eq "ollama") {
    Write-Host "Ollama service is running!"
    
    # Check if the model is available
    Write-Host "Checking for available models..."
    $models = docker exec ollama ollama list
    Write-Host $models
    
    # If no models found, pull the default one
    if (-not $models -or $models -notmatch "llama2") {
        Write-Host "Pulling the default model (llama2)..."
        docker exec ollama ollama pull llama2
    }
    
    Write-Host "\nOllama setup complete!"
    Write-Host "You can now access the Ollama API at: http://localhost:11434"
    Write-Host "To interact with the model, run: docker exec -it ollama ollama run llama2"
} else {
    Write-Host "Failed to start Ollama service. Check the logs with: docker logs ollama"
}
