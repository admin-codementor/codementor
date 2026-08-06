// Vercel serverless entry point. Wraps the same Express app used for local
// dev (../src/app.js) with serverless-http, per Vercel's Node function
// convention. See vercel.json for the route that maps /api/* here.
const serverless = require('serverless-http');
const app = require('../src/app');

module.exports = serverless(app);
