// Imported before application modules: never connect tests to the developer database.
require('dotenv').config({ quiet: true });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://unused:unused@127.0.0.1:1/missing_test_database';
