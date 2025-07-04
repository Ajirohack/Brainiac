const winston = require('winston');
const { LokiTransport } = require('winston-loki');
const { v4: uuidv4 } = require('uuid');
const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, json, errors } = format;

// Custom format that includes error stack traces
const errorStackFormat = format((info) => {
  if (info instanceof Error) {
    return {
      ...info,
      stack: info.stack,
      message: info.message,
    };
  }
  return info;
});

// Define log format
const logFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level.toUpperCase()}] ${message}`;
  
  if (Object.keys(metadata).length > 0) {
    msg += ' ' + JSON.stringify(metadata, null, 2);
  }
  
  return msg;
});

// Create a logger instance
function createAppLogger(serviceName, options = {}) {
  const { lokiUrl, lokiBasicAuth } = options;
  const transportsList = [];
  
  // Console transport for development
  if (process.env.NODE_ENV !== 'production') {
    transportsList.push(
      new transports.Console({
        format: combine(
          format.colorize(),
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          logFormat
        ),
      })
    );
  }
  
  // File transport for production
  if (process.env.NODE_ENV === 'production') {
    transportsList.push(
      new transports.File({ 
        filename: 'logs/error.log', 
        level: 'error',
        format: combine(
          timestamp(),
          json()
        )
      }),
      new transports.File({ 
        filename: 'logs/combined.log',
        format: combine(
          timestamp(),
          json()
        )
      })
    );
  }
  
  // Loki transport if URL is provided
  if (lokiUrl) {
    try {
      const lokiConfig = {
        host: lokiUrl,
        json: true,
        batching: true,
        interval: 5,
        replaceTimestamp: true,
        onConnectionError: (err) => console.error('Loki connection error:', err),
        labels: {
          job: 'cai_platform',
          service: serviceName,
          environment: process.env.NODE_ENV || 'development',
          instance: process.env.HOSTNAME || uuidv4(),
        },
        format: combine(
          errors({ stack: true }),
          errorStackFormat(),
          json()
        ),
      };
      
      if (lokiBasicAuth) {
        lokiConfig.basicAuth = lokiBasicAuth;
      }
      
      transportsList.push(new LokiTransport(lokiConfig));
    } catch (error) {
      console.error('Failed to initialize Loki transport:', error);
    }
  }
  
  // Create the logger
  const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      timestamp(),
      errorStackFormat(),
      json()
    ),
    defaultMeta: {
      service: serviceName,
      environment: process.env.NODE_ENV || 'development',
      instance: process.env.HOSTNAME || uuidv4(),
    },
    transports: transportsList,
    exitOnError: false, // Don't exit on handled exceptions
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error });
    setTimeout(() => process.exit(1), 1000);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, at: promise });
  });
  
  return logger;
}

module.exports = { createAppLogger };
