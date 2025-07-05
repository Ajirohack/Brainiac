// Environment Variable Validator
// Reads `.env.example` at project root, extracts variable names, and ensures each is defined in `process.env`.
// Throws a descriptive error listing missing variables so the application fails fast.

const fs = require('fs');
const path = require('path');

/**
 * Parse .env.example file to obtain the list of expected environment variables.
 * Lines beginning with `#` are ignored. Blank lines are skipped.
 * @returns {string[]} array of variable names
 */
function getExpectedVars() {
  const examplePath = path.resolve(process.cwd(), '.env.example');
  if (!fs.existsSync(examplePath)) {
    return { required: [], optional: [] };
  }

  const required = [];
  const optional = [];

  const content = fs.readFileSync(examplePath, 'utf8');
  content
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .forEach((line) => {
      const [key, value] = line.split('=');
      const trimmedKey = key.trim();
      if (!trimmedKey) return;
      if (value === undefined || value === '') {
        optional.push(trimmedKey);
      } else {
        required.push(trimmedKey);
      }
    });

  return { required, optional };
}

/**
 * Validate required env vars.
 * Throws an Error if any variable is undefined or empty.
 */
function validateEnv() {
  const { required } = getExpectedVars();
  if (!required.length) return; // nothing to validate

  const missing = required.filter((key) => !(key in process.env) || process.env[key] === '');
  if (missing.length) {
    const plural = missing.length > 1;
    throw new Error(
      `Missing required environment variable${plural ? 's' : ''}: ${missing.join(', ')}.\n` +
        'Please create a .env file (or export variables) based on .env.example before starting the server.'
    );
  }
}

module.exports = validateEnv;
