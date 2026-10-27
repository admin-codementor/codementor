// Keeps tests that load the whole app away from real services.
//
// src/app.js reads backend/.env, which on a developer machine holds the real Redis and Firebase credentials. A test that makes requests
// would then use the real Redis (rate-limit counters, and the free daily command quota) and could reach the real database. Setting these
// BEFORE the app is loaded wins, because dotenv never overrides a variable that is already set.
//   - an empty Redis URL makes every limiter use its in-memory fallback and the cache report "unavailable" at once, with no network call
//   - an unreachable Firestore address means any accidental database call fails instead of touching production data
//   - throwaway secrets, so no real signing key is used
process.env.NODE_ENV = 'test';
process.env.UPSTASH_REDIS_REST_URL = '';
process.env.UPSTASH_REDIS_REST_TOKEN = '';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:1';
process.env.JWT_SECRET = 'test-secret-for-route-loading-only-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-route-loading-only-0123';
