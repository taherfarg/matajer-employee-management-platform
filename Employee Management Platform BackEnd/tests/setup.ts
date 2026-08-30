/**
 * Runs before every test file, ahead of any application import.
 *
 * `dotenv` never overwrites a variable that is already set, so assigning these
 * here is what keeps the suite pointed at the throwaway test database instead of
 * the development one holding the demo data.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://ems:ems_local_password@localhost:5434/ems_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test_only_access_secret_0123456789abcdefghij';
process.env.JWT_REFRESH_SECRET = 'test_only_refresh_secret_9876543210zyxwvutsrq';
process.env.LOG_LEVEL = 'silent';
process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173';

/**
 * Forced empty so the suite never makes a live Gemini call, even on a machine
 * where a real key sits in .env. Tests must be deterministic, offline and free;
 * letter generation is exercised through its template path, and the model call
 * itself is verified manually.
 */
process.env.GOOGLE_API_KEY = '';
