#!/bin/sh
set -e

# Set up logging
exec > >(tee -i /var/log/ollama/startup.log)
exec 2>&1

# Create log directory
mkdir -p /var/log/ollama

# Function to log messages
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Start Ollama server in the background
log "Starting Ollama server..."
/usr/bin/ollama serve &

# Wait for server to be ready
log "Waiting for Ollama server to start..."
MAX_RETRIES=30
RETRY_COUNT=0
while ! curl -s http://localhost:11434/api/version >/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT+1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        log "Error: Ollama server failed to start after $MAX_RETRIES attempts"
        exit 1
    fi
    sleep 2
    log "Waiting for Ollama server to be ready... (Attempt $RETRY_COUNT/$MAX_RETRIES)"
done

log "Ollama server is running"

# Check if model exists
log "Checking for existing models..."
if ! /usr/bin/ollama list | grep -q "llama2"; then
    log "Pulling llama2 model... This may take a while..."
    /usr/bin/ollama pull llama2
    
    if [ $? -ne 0 ]; then
        log "Error: Failed to pull llama2 model"
        exit 1
    fi
    log "Successfully pulled llama2 model"
else
    log "llama2 model already exists"
fi

# Verify model is working
log "Verifying model..."
/usr/bin/ollama list

log "Ollama is ready and running!"

# Keep container running
# Keep the container running
echo "Ollama is ready!"
tail -f /dev/null
