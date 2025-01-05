/* eslint-disable @typescript-eslint/no-var-requires */
// jest.setup.env.js
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from different .env files based on test environment
const testEnvPath = path.resolve(__dirname, '.env.test');
const defaultEnvPath = path.resolve(__dirname, '.env');

// First try to load .env.test, fall back to .env
dotenv.config({
    path: require('fs').existsSync(testEnvPath) 
        ? testEnvPath 
        : defaultEnvPath
});