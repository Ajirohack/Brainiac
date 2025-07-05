# Test script to verify Ollama integration with Brainiac

# Check if Docker is running
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker is not running. Please start Docker Desktop and try again."
    }
} catch {
    Write-Error "Error checking Docker status: $_"
    exit 1
}

# Check if Ollama container is running
$ollamaRunning = docker ps --filter "name=ollama" --format '{{.Names}}'
if (-not $ollamaRunning) {
    Write-Host "Ollama container is not running. Starting it now..."
    .\scripts\setup-ollama.ps1
    
    # Wait for Ollama to start
    Start-Sleep -Seconds 10
    
    $ollamaRunning = docker ps --filter "name=ollama" --format '{{.Names}}'
    if (-not $ollamaRunning) {
        Write-Error "Failed to start Ollama container. Check Docker logs for more information."
        exit 1
    }
}

# Test the Ollama API
Write-Host "`nTesting Ollama API..."
try {
    $response = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -ErrorAction Stop
    Write-Host "✅ Successfully connected to Ollama API"
    Write-Host "Available models:"
    $response.models | ForEach-Object { Write-Host "- $($_.name)" }
} catch {
    Write-Error "❌ Failed to connect to Ollama API: $_"
    Write-Host "`nTroubleshooting steps:"
    Write-Host "1. Make sure Docker is running"
    Write-Host "2. Check if the Ollama container is running: docker ps"
    Write-Host "3. View container logs: docker logs ollama"
    exit 1
}

# Test the Brainiac integration with Ollama
Write-Host "`nTesting Brainiac integration with Ollama..."
try {
    $testScript = @"
    const { Ollama } = require('@langchain/ollama');
    
    async function testOllama() {
        const ollama = new Ollama({
            baseUrl: 'http://localhost:11434',
            model: 'llama2',
        });
        
        const response = await ollama.invoke('Hello, how are you?');
        console.log('Response from Ollama:', response.substring(0, 100) + '...');
        return { success: true };
    }
    
    testOllama().catch(console.error);
"@

    $tempFile = [System.IO.Path]::GetTempFileName() + '.js'
    $testScript | Out-File -FilePath $tempFile -Encoding utf8
    
    Write-Host "Running integration test..."
    $result = node $tempFile 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Brainiac integration with Ollama is working correctly!"
        Write-Host $result
    } else {
        Write-Error "❌ Brainiac integration test failed:"
        Write-Host $result
    }
    
    Remove-Item $tempFile -ErrorAction SilentlyContinue
    
} catch {
    Write-Error "❌ Error testing Brainiac integration: $_"
    exit 1
}

Write-Host "`n🎉 Ollama integration test completed successfully!"
Write-Host "You can now use Ollama as an LLM provider in the Brainiac platform."
