/*
 * LLM Provider configuration.
 * Each provider entry may override defaults in client implementations.
 * Values are primarily sourced from environment variables so they can be
 * adjusted without code edits.
 */

module.exports = {
  /*
   * OpenAI provider defaults. These may be overridden per-provider entry
   * stored in the database or via environment variables.
   */
  openai: {
    /** Base URL for the API */
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',

    /** API version for Azure-style or future versioned endpoints */
    apiVersion: process.env.OPENAI_API_VERSION || '2023-05-15',
  },

  /*
   * Anthropic Claude – placeholder with sane defaults.
   */
  anthropic: {
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    apiVersion: process.env.ANTHROPIC_API_VERSION || '2023-06-01',
  },

  /*
   * You can add additional providers here (e.g., Google, Cohere, etc.).
   */
};
