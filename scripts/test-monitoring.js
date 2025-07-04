#!/usr/bin/env node

/**
 * Test script to verify the monitoring stack is working correctly
 * This script will:
 * 1. Test logging
 * 2. Test metrics collection
 * 3. Test tracing
 * 4. Test health check endpoints
 */

const http = require('http');
const https = require('https');
const { createAppLogger } = require('../src/utils/logger');
const metrics = require('../src/utils/metrics');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Configuration
const CONFIG = {
  serviceName: 'cai-platform-monitoring-test',
  port: 3001,
  testDuration: 10000, // 10 seconds
  logInterval: 1000,   // Log every second
  metricsInterval: 2000, // Collect metrics every 2 seconds
  tracer: trace.getTracer('monitoring-test'),
};

// Create logger
const logger = createAppLogger(CONFIG.serviceName, {
  lokiUrl: process.env.LOKI_HOST,
  lokiBasicAuth: process.env.LOKI_BASIC_AUTH,
});

// Test data
const testUsers = [
  { id: 1, name: 'Test User 1', email: 'test1@example.com' },
  { id: 2, name: 'Test User 2', email: 'test2@example.com' },
  { id: 3, name: 'Test User 3', email: 'test3@example.com' },
];

// Test functions
async function testLogging() {
  logger.info('Starting logging test');
  
  // Log different levels
  logger.debug('This is a debug message', { timestamp: new Date().toISOString() });
  logger.info('This is an info message', { service: CONFIG.serviceName });
  logger.warn('This is a warning message', { test: true });
  
  // Log errors
  try {
    throw new Error('This is a test error');
  } catch (error) {
    logger.error('Caught an error', { 
      error: error.message, 
      stack: error.stack 
    });
  }
  
  // Log with different data types
  logger.info('Logging different data types', {
    string: 'test',
    number: 42,
    boolean: true,
    array: [1, 2, 3],
    object: { key: 'value' },
    nullValue: null,
    undefinedValue: undefined,
  });
  
  logger.info('Logging test completed');
}

async function testMetrics() {
  logger.info('Starting metrics test');
  
  // Simulate HTTP requests
  const simulateHttpRequest = (endpoint, statusCode = 200, duration = 100) => {
    const start = Date.now();
    
    // Record request
    metrics.metrics.httpRequestsTotal.add(1, {
      method: 'GET',
      route: endpoint,
      status_code: statusCode,
    });
    
    // Record duration
    metrics.metrics.httpRequestDuration.record(duration, {
      method: 'GET',
      route: endpoint,
      status_code: statusCode,
    });
    
    // Simulate occasional errors
    if (Math.random() > 0.9) {
      metrics.metrics.httpRequestErrors.add(1, {
        method: 'GET',
        route: endpoint,
        status_code: 500,
      });
    }
    
    return { statusCode, duration };
  };
  
  // Simulate database queries
  const simulateDbQuery = (query, duration = 50) => {
    // Record query
    metrics.metrics.dbQueriesTotal.add(1, { query });
    
    // Record duration
    metrics.metrics.dbQueryDuration.record(duration, { query });
    
    // Simulate occasional errors
    if (Math.random() > 0.95) {
      metrics.metrics.dbErrors.add(1, { query });
      return { success: false, error: 'Database timeout' };
    }
    
    return { success: true, data: { id: 1, result: 'success' } };
  };
  
  // Simulate cache operations
  const simulateCache = (key, hit = true) => {
    if (hit) {
      metrics.metrics.cacheHits.add(1, { key });
    } else {
      metrics.metrics.cacheMisses.add(1, { key });
    }
    
    const duration = Math.floor(Math.random() * 10) + 1; // 1-10ms
    metrics.metrics.cacheDuration.record(duration, { key, hit });
    
    return { hit, duration };
  };
  
  // Run simulations
  const endpoints = ['/api/users', '/api/posts', '/api/comments', '/api/likes'];
  const queries = ['SELECT * FROM users', 'SELECT * FROM posts', 'SELECT * FROM comments'];
  const cacheKeys = ['user:1', 'post:42', 'comment:100', 'config:site'];
  
  const interval = setInterval(() => {
    // Simulate HTTP requests
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    const statusCode = Math.random() > 0.9 ? 500 : 200;
    const duration = Math.floor(Math.random() * 200) + 50; // 50-250ms
    simulateHttpRequest(endpoint, statusCode, duration);
    
    // Simulate DB queries
    const query = queries[Math.floor(Math.random() * queries.length)];
    simulateDbQuery(query);
    
    // Simulate cache
    const key = cacheKeys[Math.floor(Math.random() * cacheKeys.length)];
    const hit = Math.random() > 0.3; // 70% cache hit rate
    simulateCache(key, hit);
  }, 100);
  
  // Stop after test duration
  setTimeout(() => {
    clearInterval(interval);
    logger.info('Metrics test completed');
  }, CONFIG.testDuration);
}

async function testTracing() {
  logger.info('Starting tracing test');
  
  // Create a parent span
  const parentSpan = CONFIG.tracer.startSpan('monitoring-test-parent');
  
  // Set the active context
  const ctx = trace.setSpan(context.active(), parentSpan);
  
  // Simulate work with child spans
  await context.with(ctx, async () => {
    // Simulate a database operation
    const dbSpan = CONFIG.tracer.startSpan('database-query', {
      attributes: {
        'db.system': 'postgresql',
        'db.statement': 'SELECT * FROM users WHERE id = $1',
        'db.parameters': JSON.stringify(['user123']),
      },
    });
    
    try {
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Add events to the span
      dbSpan.addEvent('Found user in database', {
        'user.id': 'user123',
        'user.name': 'Test User',
      });
      
      // Set status
      dbSpan.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      // Record exception
      dbSpan.recordException(error);
      dbSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    } finally {
      // End the span
      dbSpan.end();
    }
    
    // Simulate an external API call
    const apiSpan = CONFIG.tracer.startSpan('external-api-call', {
      attributes: {
        'http.method': 'GET',
        'http.url': 'https://api.example.com/data',
        'http.status_code': 200,
      },
    });
    
    try {
      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 150));
      apiSpan.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      apiSpan.recordException(error);
      apiSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    } finally {
      apiSpan.end();
    }
  });
  
  // End the parent span
  parentSpan.end();
  
  logger.info('Tracing test completed');
}

async function testHealthChecks() {
  logger.info('Starting health check test');
  
  const endpoints = [
    { url: 'http://localhost:3001/health', name: 'Health Check' },
    { url: 'http://localhost:3001/metrics', name: 'Prometheus Metrics' },
    { url: 'http://localhost:3001/api/status', name: 'API Status' },
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.get(endpoint.url, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        });
        
        req.on('error', (error) => reject(error));
        req.end();
      });
      
      logger.info(`Health check ${endpoint.name} (${endpoint.url}): ${response.statusCode}`, {
        status: response.statusCode === 200 ? 'healthy' : 'unhealthy',
        response: response.data ? response.data.substring(0, 100) + '...' : 'No data',
      });
    } catch (error) {
      logger.error(`Health check ${endpoint.name} (${endpoint.url}) failed`, {
        error: error.message,
        stack: error.stack,
      });
    }
  }
  
  logger.info('Health check test completed');
}

// Main function
async function main() {
  logger.info('Starting monitoring test suite');
  
  try {
    // Run tests
    await testLogging();
    await testTracing();
    await testHealthChecks();
    
    // Run metrics test in the background
    testMetrics().catch(error => {
      logger.error('Metrics test failed', { error: error.message, stack: error.stack });
    });
    
    // Keep the process alive for metrics collection
    setTimeout(async () => {
      logger.info('Monitoring test suite completed');
      
      // Shutdown metrics
      await metrics.shutdown();
      
      // Exit with success
      process.exit(0);
    }, CONFIG.testDuration + 2000); // Add buffer for cleanup
    
  } catch (error) {
    logger.error('Monitoring test suite failed', { 
      error: error.message, 
      stack: error.stack,
    });
    
    // Exit with error
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error in monitoring test:', error);
  process.exit(1);
});
