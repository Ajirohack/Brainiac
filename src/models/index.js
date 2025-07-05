/*
 * Central export for Objection.js models so they can be required via
 *   const { User } = require('../models');
 */

module.exports = {
  // Core auth / user
  User: require('./User'),

  // AI-related models (used by LLM subsystems)
  AIModel: require('./AIModel'),
  AIProvider: require('./AIProvider'),
  KnowledgeFile: require('./KnowledgeFile'),
  ModelCapability: require('./ModelCapability'),
  ProviderRateLimit: require('./ProviderRateLimit')
};
