# 🚀 Cognitive Agentic Intelligence (CAI) Platform - Deployment Guide

## 📋 Table of Contents

1. [Deployment Overview](#deployment-overview)
2. [Environment Setup](#environment-setup)
3. [Local Development](#local-development)
4. [Staging Deployment](#staging-deployment)
5. [Production Deployment](#production-deployment)
6. [Cloud Deployment](#cloud-deployment)
7. [Monitoring & Logging](#monitoring--logging)
8. [Security Configuration](#security-configuration)
9. [Backup & Recovery](#backup--recovery)
10. [Scaling Strategies](#scaling-strategies)
11. [Troubleshooting](#troubleshooting)

## 🎯 Deployment Overview

### Deployment Architecture

```mermaid
flowchart TB
    subgraph "Development Environment"
        A[👨‍💻 Local Development]
        B[🧪 Unit Testing]
        C[🔧 Integration Testing]
    end
    
    subgraph "Staging Environment"
        D[🎭 Staging Server]
        E[📊 Performance Testing]
        F[🔍 Security Testing]
    end
    
    subgraph "Production Environment"
        G[🌐 Load Balancer]
        H[🖥️ Application Servers]
        I[💾 Database Cluster]
        J[📚 Knowledge Base]
        K[🔄 Redis Cluster]
    end
    
    subgraph "Monitoring & Logging"
        L[📊 Prometheus]
        M[📈 Grafana]
        N[📝 ELK Stack]
        O[🚨 AlertManager]
    end
    
    A --> B
    B --> C
    C --> D
    D --> E
    E --> F
    F --> G
    
    G --> H
    H --> I
    H --> J
    H --> K
    
    H --> L
    L --> M
    H --> N
    L --> O
    
    style A fill:#e3f2fd
    style G fill:#ff9800
    style L fill:#4caf50
```

### Deployment Environments

| Environment | Purpose | Resources | Uptime SLA |
|-------------|---------|-----------|------------|
| **Development** | Local development and testing | Minimal | N/A |
| **Staging** | Pre-production testing | Medium | 95% |
| **Production** | Live system | High | 99.9% |

## 🛠️ Environment Setup

### Prerequisites

#### System Requirements

**Minimum Requirements (Development):**
```yaml
CPU: 4 cores
RAM: 16GB
Storage: 100GB SSD
Network: 100Mbps
OS: Ubuntu 20.04+ / macOS 11+ / Windows 10+
```

**Recommended Requirements (Production):**
```yaml
CPU: 16+ cores
RAM: 64GB+
Storage: 1TB+ NVMe SSD
Network: 1Gbps+
OS: Ubuntu 22.04 LTS
```

#### Software Dependencies

```bash
# Core Dependencies
Python: 3.9+
Node.js: 18+
Docker: 24+
Docker Compose: 2.0+
Kubernetes: 1.25+ (for production)

# Database Systems
PostgreSQL: 14+
Redis: 7+
Qdrant: 1.7+ (Vector Database)

# Monitoring
Prometheus: 2.40+
Grafana: 9.0+
Elasticsearch: 8.0+
```

### Installation Scripts

#### Ubuntu/Debian Setup
```bash
#!/bin/bash
# scripts/setup-ubuntu.sh

set -e

echo "🚀 Setting up CAI Platform on Ubuntu"

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Python 3.9+
sudo apt install -y python3.9 python3.9-pip python3.9-venv

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install additional tools
sudo apt install -y git curl wget htop vim

echo "✅ Setup completed! Please log out and back in to use Docker."
```

#### macOS Setup
```bash
#!/bin/bash
# scripts/setup-macos.sh

set -e

echo "🚀 Setting up CAI Platform on macOS"

# Install Homebrew if not present
if ! command -v brew &> /dev/null; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Install dependencies
brew install docker docker-compose python@3.9 node@18 git

# Start Docker Desktop
open -a Docker

echo "✅ Setup completed! Make sure Docker Desktop is running."
```

## 💻 Local Development

### Development Environment Setup

#### Clone and Setup
```bash
# Clone the repository
git clone https://github.com/your-org/cai-platform.git
cd cai-platform/Brainiac

# Create Python virtual environment
python3.9 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies
npm install

# Copy environment configuration
cp config/development/.env.example config/development/.env
```

#### Environment Configuration
```bash
# config/development/.env
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=DEBUG

# Database Configuration
DATABASE_URL=postgresql://cai_user:cai_pass@localhost:5432/cai_dev
REDIS_URL=redis://localhost:6379/0
VECTOR_DB_URL=http://localhost:6333

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
API_WORKERS=1

# Security
SECRET_KEY=your-secret-key-for-development
JWT_SECRET=your-jwt-secret-for-development

# External Services
OPENAI_API_KEY=your-openai-api-key
HUGGINGFACE_API_KEY=your-huggingface-api-key
```

#### Docker Compose for Development
```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: cai_dev
      POSTGRES_USER: cai_user
      POSTGRES_PASSWORD: cai_pass
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data
  
  qdrant:
    image: qdrant/qdrant:v1.7.0
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_dev_data:/qdrant/storage
  
  cai-platform:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=development
    volumes:
      - .:/app
      - /app/venv
    depends_on:
      - postgres
      - redis
      - qdrant
    command: python -m src.core.app

volumes:
  postgres_dev_data:
  redis_dev_data:
  qdrant_dev_data:
```

#### Development Dockerfile
```dockerfile
# Dockerfile.dev
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install development dependencies
COPY requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt

# Copy source code
COPY . .

# Set environment variables
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Expose port
EXPOSE 8000

# Development command with hot reload
CMD ["python", "-m", "uvicorn", "src.core.app:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

#### Start Development Environment
```bash
# Start all services
docker-compose -f docker-compose.dev.yml up -d

# Run database migrations
docker-compose -f docker-compose.dev.yml exec cai-platform alembic upgrade head

# Load sample data
docker-compose -f docker-compose.dev.yml exec cai-platform python scripts/load_sample_data.py

# View logs
docker-compose -f docker-compose.dev.yml logs -f cai-platform
```

### Development Workflow

```mermaid
flowchart LR
    A[💻 Code Changes] --> B[🧪 Unit Tests]
    B --> C[🔧 Integration Tests]
    C --> D[📊 Code Quality Check]
    D --> E[🔄 Git Commit]
    E --> F[📤 Push to Branch]
    F --> G[🔀 Pull Request]
    G --> H[👀 Code Review]
    H --> I[✅ Merge to Main]
    
    style A fill:#e3f2fd
    style I fill:#c8e6c9
```

#### Pre-commit Hooks
```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.4.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
  
  - repo: https://github.com/psf/black
    rev: 22.10.0
    hooks:
      - id: black
        language_version: python3.9
  
  - repo: https://github.com/pycqa/flake8
    rev: 5.0.4
    hooks:
      - id: flake8
  
  - repo: https://github.com/pycqa/isort
    rev: 5.10.1
    hooks:
      - id: isort
```

## 🎭 Staging Deployment

### Staging Environment Configuration

#### Staging Docker Compose
```yaml
# docker-compose.staging.yml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx/staging.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl/certs
    depends_on:
      - cai-platform
  
  cai-platform:
    image: cai-platform:staging
    environment:
      - ENVIRONMENT=staging
      - DATABASE_URL=postgresql://cai_user:${DB_PASSWORD}@postgres:5432/cai_staging
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - postgres
      - redis
      - qdrant
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 4G
          cpus: '2'
  
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: cai_staging
      POSTGRES_USER: cai_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_staging_data:/var/lib/postgresql/data
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_staging_data:/data
  
  qdrant:
    image: qdrant/qdrant:v1.7.0
    volumes:
      - qdrant_staging_data:/qdrant/storage
  
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus/staging.yml:/etc/prometheus/prometheus.yml
  
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
    volumes:
      - grafana_staging_data:/var/lib/grafana

volumes:
  postgres_staging_data:
  redis_staging_data:
  qdrant_staging_data:
  grafana_staging_data:
```

#### Staging Deployment Script
```bash
#!/bin/bash
# scripts/deploy-staging.sh

set -e

echo "🎭 Deploying to Staging Environment"

# Load environment variables
source config/staging/.env

# Build staging image
docker build -t cai-platform:staging .

# Stop existing services
docker-compose -f docker-compose.staging.yml down

# Start new services
docker-compose -f docker-compose.staging.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Run database migrations
docker-compose -f docker-compose.staging.yml exec cai-platform alembic upgrade head

# Run health check
echo "🏥 Running health check..."
if curl -f http://localhost/health; then
    echo "✅ Staging deployment successful!"
else
    echo "❌ Staging deployment failed!"
    exit 1
fi

# Run smoke tests
echo "🧪 Running smoke tests..."
python tests/smoke_tests.py --environment=staging

echo "🎉 Staging deployment completed successfully!"
```

## 🌐 Production Deployment

### Production Architecture

```mermaid
flowchart TB
    subgraph "Load Balancer Layer"
        LB[🌐 Load Balancer]
    end
    
    subgraph "Application Layer"
        APP1[🖥️ App Server 1]
        APP2[🖥️ App Server 2]
        APP3[🖥️ App Server 3]
    end
    
    subgraph "Database Layer"
        PG_PRIMARY[💾 PostgreSQL Primary]
        PG_REPLICA1[💾 PostgreSQL Replica 1]
        PG_REPLICA2[💾 PostgreSQL Replica 2]
    end
    
    subgraph "Cache Layer"
        REDIS1[🔄 Redis Master]
        REDIS2[🔄 Redis Replica]
    end
    
    subgraph "Vector Database"
        QDRANT1[📊 Qdrant Node 1]
        QDRANT2[📊 Qdrant Node 2]
        QDRANT3[📊 Qdrant Node 3]
    end
    
    subgraph "Monitoring"
        PROM[📊 Prometheus]
        GRAF[📈 Grafana]
        ELK[📝 ELK Stack]
    end
    
    LB --> APP1
    LB --> APP2
    LB --> APP3
    
    APP1 --> PG_PRIMARY
    APP2 --> PG_PRIMARY
    APP3 --> PG_PRIMARY
    
    PG_PRIMARY --> PG_REPLICA1
    PG_PRIMARY --> PG_REPLICA2
    
    APP1 --> REDIS1
    APP2 --> REDIS1
    APP3 --> REDIS1
    
    REDIS1 --> REDIS2
    
    APP1 --> QDRANT1
    APP2 --> QDRANT2
    APP3 --> QDRANT3
    
    APP1 --> PROM
    APP2 --> PROM
    APP3 --> PROM
    
    PROM --> GRAF
    APP1 --> ELK
    APP2 --> ELK
    APP3 --> ELK
    
    style LB fill:#ff9800
    style PG_PRIMARY fill:#4caf50
    style PROM fill:#2196f3
```

### Kubernetes Deployment

#### Namespace Configuration
```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: cai-platform
  labels:
    name: cai-platform
```

#### ConfigMap
```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cai-platform-config
  namespace: cai-platform
data:
  ENVIRONMENT: "production"
  LOG_LEVEL: "INFO"
  API_HOST: "0.0.0.0"
  API_PORT: "8000"
  DATABASE_HOST: "postgres-service"
  DATABASE_PORT: "5432"
  DATABASE_NAME: "cai_production"
  REDIS_HOST: "redis-service"
  REDIS_PORT: "6379"
  VECTOR_DB_HOST: "qdrant-service"
  VECTOR_DB_PORT: "6333"
```

#### Secrets
```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: cai-platform-secrets
  namespace: cai-platform
type: Opaque
data:
  DATABASE_PASSWORD: <base64-encoded-password>
  JWT_SECRET: <base64-encoded-jwt-secret>
  SECRET_KEY: <base64-encoded-secret-key>
  OPENAI_API_KEY: <base64-encoded-openai-key>
```

#### Application Deployment
```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cai-platform
  namespace: cai-platform
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cai-platform
  template:
    metadata:
      labels:
        app: cai-platform
    spec:
      containers:
      - name: cai-platform
        image: cai-platform:latest
        ports:
        - containerPort: 8000
        envFrom:
        - configMapRef:
            name: cai-platform-config
        - secretRef:
            name: cai-platform-secrets
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5
```

#### Service Configuration
```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: cai-platform-service
  namespace: cai-platform
spec:
  selector:
    app: cai-platform
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8000
  type: ClusterIP
```

#### Ingress Configuration
```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cai-platform-ingress
  namespace: cai-platform
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  tls:
  - hosts:
    - api.cai-platform.com
    secretName: cai-platform-tls
  rules:
  - host: api.cai-platform.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: cai-platform-service
            port:
              number: 80
```

#### Horizontal Pod Autoscaler
```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cai-platform-hpa
  namespace: cai-platform
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cai-platform
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Production Deployment Script
```bash
#!/bin/bash
# scripts/deploy-production.sh

set -e

echo "🌐 Deploying to Production Environment"

# Verify prerequisites
echo "🔍 Verifying prerequisites..."
kubectl cluster-info
helm version

# Create namespace if it doesn't exist
kubectl apply -f k8s/namespace.yaml

# Apply configurations
echo "⚙️ Applying configurations..."
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml

# Deploy database
echo "💾 Deploying database..."
helm upgrade --install postgres bitnami/postgresql \
  --namespace cai-platform \
  --set auth.postgresPassword=$POSTGRES_PASSWORD \
  --set primary.persistence.size=100Gi \
  --set readReplicas.replicaCount=2

# Deploy Redis
echo "🔄 Deploying Redis..."
helm upgrade --install redis bitnami/redis \
  --namespace cai-platform \
  --set auth.password=$REDIS_PASSWORD \
  --set replica.replicaCount=1

# Deploy Qdrant
echo "📊 Deploying Qdrant..."
kubectl apply -f k8s/qdrant/

# Deploy application
echo "🚀 Deploying application..."
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml

# Wait for deployment
echo "⏳ Waiting for deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/cai-platform -n cai-platform

# Run database migrations
echo "🗄️ Running database migrations..."
kubectl exec -n cai-platform deployment/cai-platform -- alembic upgrade head

# Verify deployment
echo "✅ Verifying deployment..."
kubectl get pods -n cai-platform
kubectl get services -n cai-platform
kubectl get ingress -n cai-platform

# Run health check
echo "🏥 Running health check..."
if curl -f https://api.cai-platform.com/health; then
    echo "🎉 Production deployment successful!"
else
    echo "❌ Production deployment failed!"
    exit 1
fi
```

## ☁️ Cloud Deployment

### AWS Deployment

#### EKS Cluster Setup
```bash
#!/bin/bash
# scripts/setup-eks.sh

set -e

echo "☁️ Setting up EKS cluster"

# Create EKS cluster
eksctl create cluster \
  --name cai-platform \
  --version 1.25 \
  --region us-west-2 \
  --nodegroup-name standard-workers \
  --node-type m5.xlarge \
  --nodes 3 \
  --nodes-min 1 \
  --nodes-max 10 \
  --managed

# Install AWS Load Balancer Controller
kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master"

helm repo add eks https://aws.github.io/eks-charts
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=cai-platform

# Install Cluster Autoscaler
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml

echo "✅ EKS cluster setup completed"
```

#### RDS Setup
```bash
#!/bin/bash
# scripts/setup-rds.sh

set -e

echo "💾 Setting up RDS instance"

# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier cai-platform-prod \
  --db-instance-class db.r5.xlarge \
  --engine postgres \
  --engine-version 14.9 \
  --master-username cai_admin \
  --master-user-password $DB_PASSWORD \
  --allocated-storage 100 \
  --storage-type gp2 \
  --vpc-security-group-ids $SECURITY_GROUP_ID \
  --db-subnet-group-name $DB_SUBNET_GROUP \
  --backup-retention-period 7 \
  --multi-az \
  --storage-encrypted

echo "✅ RDS instance creation initiated"
```

### Google Cloud Deployment

#### GKE Cluster Setup
```bash
#!/bin/bash
# scripts/setup-gke.sh

set -e

echo "☁️ Setting up GKE cluster"

# Create GKE cluster
gcloud container clusters create cai-platform \
  --zone us-central1-a \
  --machine-type n1-standard-4 \
  --num-nodes 3 \
  --enable-autoscaling \
  --min-nodes 1 \
  --max-nodes 10 \
  --enable-autorepair \
  --enable-autoupgrade

# Get credentials
gcloud container clusters get-credentials cai-platform --zone us-central1-a

echo "✅ GKE cluster setup completed"
```

### Azure Deployment

#### AKS Cluster Setup
```bash
#!/bin/bash
# scripts/setup-aks.sh

set -e

echo "☁️ Setting up AKS cluster"

# Create resource group
az group create --name cai-platform-rg --location eastus

# Create AKS cluster
az aks create \
  --resource-group cai-platform-rg \
  --name cai-platform \
  --node-count 3 \
  --node-vm-size Standard_D4s_v3 \
  --enable-cluster-autoscaler \
  --min-count 1 \
  --max-count 10 \
  --generate-ssh-keys

# Get credentials
az aks get-credentials --resource-group cai-platform-rg --name cai-platform

echo "✅ AKS cluster setup completed"
```

## 📊 Monitoring & Logging

### Prometheus Configuration
```yaml
# config/prometheus/production.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'cai-platform'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
```

### Alert Rules
```yaml
# config/prometheus/alert_rules.yml
groups:
  - name: cai-platform-alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate detected
          description: "Error rate is {{ $value }} errors per second"
      
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High response time detected
          description: "95th percentile response time is {{ $value }} seconds"
      
      - alert: PodCrashLooping
        expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: Pod is crash looping
          description: "Pod {{ $labels.pod }} is crash looping"
```

### Grafana Dashboard
```json
{
  "dashboard": {
    "id": null,
    "title": "CAI Platform Production Dashboard",
    "tags": ["cai-platform", "production"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m])) by (method, status)",
            "legendFormat": "{{method}} {{status}}"
          }
        ],
        "yAxes": [
          {
            "label": "Requests/sec"
          }
        ]
      },
      {
        "id": 2,
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "50th percentile"
          },
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "id": 3,
        "title": "System Resources",
        "type": "graph",
        "targets": [
          {
            "expr": "avg(rate(container_cpu_usage_seconds_total[5m])) by (pod)",
            "legendFormat": "CPU Usage - {{pod}}"
          },
          {
            "expr": "avg(container_memory_usage_bytes) by (pod) / 1024 / 1024 / 1024",
            "legendFormat": "Memory Usage - {{pod}}"
          }
        ]
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "refresh": "5s"
  }
}
```

## 🔒 Security Configuration

### SSL/TLS Configuration
```nginx
# config/nginx/production.conf
server {
    listen 80;
    server_name api.cai-platform.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.cai-platform.com;
    
    ssl_certificate /etc/ssl/certs/cai-platform.crt;
    ssl_certificate_key /etc/ssl/private/cai-platform.key;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    location / {
        proxy_pass http://cai-platform-service;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Network Policies
```yaml
# k8s/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: cai-platform-network-policy
  namespace: cai-platform
spec:
  podSelector:
    matchLabels:
      app: cai-platform
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 8000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
```

## 💾 Backup & Recovery

### Database Backup
```bash
#!/bin/bash
# scripts/backup-database.sh

set -e

BACKUP_DIR="/backups/$(date +%Y-%m-%d)"
S3_BUCKET="cai-platform-backups"

echo "💾 Starting database backup"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
kubectl exec -n cai-platform deployment/postgres -- pg_dump -U cai_admin cai_production > $BACKUP_DIR/postgres_backup.sql

# Backup Redis
kubectl exec -n cai-platform deployment/redis -- redis-cli BGSAVE
kubectl cp cai-platform/redis-pod:/data/dump.rdb $BACKUP_DIR/redis_backup.rdb

# Backup Qdrant
kubectl exec -n cai-platform deployment/qdrant -- tar -czf /tmp/qdrant_backup.tar.gz /qdrant/storage
kubectl cp cai-platform/qdrant-pod:/tmp/qdrant_backup.tar.gz $BACKUP_DIR/qdrant_backup.tar.gz

# Compress backup
tar -czf $BACKUP_DIR.tar.gz -C /backups $(basename $BACKUP_DIR)

# Upload to S3
aws s3 cp $BACKUP_DIR.tar.gz s3://$S3_BUCKET/

# Cleanup local backup
rm -rf $BACKUP_DIR $BACKUP_DIR.tar.gz

echo "✅ Database backup completed"
```

### Disaster Recovery
```bash
#!/bin/bash
# scripts/disaster-recovery.sh

set -e

BACKUP_FILE=$1
S3_BUCKET="cai-platform-backups"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup-file>"
    exit 1
fi

echo "🚑 Starting disaster recovery"

# Download backup from S3
aws s3 cp s3://$S3_BUCKET/$BACKUP_FILE /tmp/

# Extract backup
tar -xzf /tmp/$BACKUP_FILE -C /tmp/

# Restore PostgreSQL
kubectl exec -i -n cai-platform deployment/postgres -- psql -U cai_admin -d cai_production < /tmp/postgres_backup.sql

# Restore Redis
kubectl cp /tmp/redis_backup.rdb cai-platform/redis-pod:/data/dump.rdb
kubectl exec -n cai-platform deployment/redis -- redis-cli DEBUG RESTART

# Restore Qdrant
kubectl cp /tmp/qdrant_backup.tar.gz cai-platform/qdrant-pod:/tmp/
kubectl exec -n cai-platform deployment/qdrant -- tar -xzf /tmp/qdrant_backup.tar.gz -C /

# Restart services
kubectl rollout restart deployment/cai-platform -n cai-platform

# Wait for services to be ready
kubectl wait --for=condition=available --timeout=300s deployment/cai-platform -n cai-platform

echo "✅ Disaster recovery completed"
```

## 📈 Scaling Strategies

### Horizontal Scaling
```yaml
# k8s/hpa-advanced.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cai-platform-hpa-advanced
  namespace: cai-platform
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cai-platform
  minReplicas: 3
  maxReplicas: 50
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
      - type: Pods
        value: 5
        periodSeconds: 60
      selectPolicy: Max
```

### Vertical Scaling
```yaml
# k8s/vpa.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: cai-platform-vpa
  namespace: cai-platform
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cai-platform
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: cai-platform
      minAllowed:
        cpu: 500m
        memory: 1Gi
      maxAllowed:
        cpu: 4
        memory: 8Gi
      controlledResources: ["cpu", "memory"]
```

## 🔧 Troubleshooting

### Common Issues

#### Pod Startup Issues
```bash
# Check pod status
kubectl get pods -n cai-platform

# Describe problematic pod
kubectl describe pod <pod-name> -n cai-platform

# Check pod logs
kubectl logs <pod-name> -n cai-platform

# Check previous container logs
kubectl logs <pod-name> -n cai-platform --previous
```

#### Database Connection Issues
```bash
# Test database connectivity
kubectl exec -it deployment/cai-platform -n cai-platform -- python -c "
import psycopg2
try:
    conn = psycopg2.connect(host='postgres-service', database='cai_production', user='cai_admin', password='password')
    print('Database connection successful')
except Exception as e:
    print(f'Database connection failed: {e}')
"
```

#### Performance Issues
```bash
# Check resource usage
kubectl top pods -n cai-platform
kubectl top nodes

# Check HPA status
kubectl get hpa -n cai-platform

# Check metrics
curl http://prometheus:9090/api/v1/query?query=rate(http_requests_total[5m])
```

### Emergency Procedures

#### Emergency Scale Down
```bash
#!/bin/bash
# scripts/emergency-scale-down.sh

echo "🚨 Emergency scale down initiated"

# Scale down to minimum replicas
kubectl scale deployment cai-platform --replicas=1 -n cai-platform

# Disable HPA temporarily
kubectl patch hpa cai-platform-hpa -n cai-platform -p '{"spec":{"minReplicas":1,"maxReplicas":1}}'

echo "✅ Emergency scale down completed"
```

#### Emergency Rollback
```bash
#!/bin/bash
# scripts/emergency-rollback.sh

echo "🚨 Emergency rollback initiated"

# Rollback to previous version
kubectl rollout undo deployment/cai-platform -n cai-platform

# Wait for rollback to complete
kubectl rollout status deployment/cai-platform -n cai-platform

echo "✅ Emergency rollback completed"
```

This comprehensive deployment guide covers everything needed to successfully deploy and maintain the CAI Platform across different environments and cloud providers.