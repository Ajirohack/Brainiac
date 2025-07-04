const { context, trace } = require('@opentelemetry/api');
const { recordException } = require('@opentelemetry/sdk-trace-base');
const { SemanticAttributes } = require('@opentelemetry/semantic-conventions');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates monitoring middleware for Express.js
 * @param {Object} logger - Logger instance
 * @param {Object} metrics - Metrics client
 * @returns {Function} Express middleware function
 */
function createMonitoringMiddleware(logger, metrics) {
  return (req, res, next) => {
    const startTime = process.hrtime();
    const traceId = trace.getSpan(context.active())?.spanContext().traceId || 'no-trace-id';
    const requestId = req.headers['x-request-id'] || uuidv4();
    
    // Add request ID to response headers
    res.setHeader('X-Request-ID', requestId);
    
    // Log request start
    logger.info('Request started', {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      query: req.query,
      traceId,
      requestId,
    });
    
    // Add request ID to the request object for later use
    req.requestId = requestId;
    
    // Store the original end function
    const originalEnd = res.end;
    
    // Create a buffer to store response chunks
    const chunks = [];
    
    // Override the end function to capture response data
    res.end = function (chunk, encoding) {
      if (chunk) {
        chunks.push(Buffer.from(chunk, encoding));
      }
      
      // Calculate response time
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const responseTimeMs = (seconds * 1000) + (nanoseconds / 1000000);
      
      // Get response body if content type is JSON
      let responseBody;
      const contentType = res.getHeader('content-type') || '';
      if (contentType.includes('application/json') && chunks.length > 0) {
        try {
          const buffer = Buffer.concat(chunks);
          responseBody = buffer.toString('utf8');
        } catch (error) {
          logger.error('Failed to parse response body', { error, requestId });
        }
      }
      
      // Log response
      const logData = {
        statusCode: res.statusCode,
        responseTime: responseTimeMs.toFixed(2) + 'ms',
        contentLength: res.getHeader('content-length') || 0,
        traceId,
        requestId,
        responseBody: responseBody ? JSON.parse(responseBody) : undefined,
      };
      
      if (res.statusCode >= 400) {
        logger.error('Request error', logData);
      } else {
        logger.info('Request completed', logData);
      }
      
      // Record metrics
      if (metrics) {
        const route = req.route ? req.route.path : req.path;
        const method = req.method;
        
        metrics.httpRequestDuration.record({
          method,
          route,
          status_code: res.statusCode,
        }, responseTimeMs);
        
        metrics.httpRequestsTotal.inc({
          method,
          route,
          status_code: res.statusCode,
        });
      }
      
      // Call the original end function
      return originalEnd.apply(res, arguments);
    };
    
    // Handle errors
    res.on('error', (error) => {
      logger.error('Response error', {
        error: error.message,
        stack: error.stack,
        requestId,
        traceId,
      });
      
      // Record exception in the active span
      const activeSpan = trace.getSpan(context.active());
      if (activeSpan) {
        recordException(error, {
          [SemanticAttributes.HTTP_METHOD]: req.method,
          [SemanticAttributes.HTTP_URL]: req.originalUrl,
          [SemanticAttributes.HTTP_STATUS_CODE]: res.statusCode,
          'request.id': requestId,
        });
      }
    });
    
    // Continue to the next middleware
    next();
  };
}

module.exports = { createMonitoringMiddleware };
