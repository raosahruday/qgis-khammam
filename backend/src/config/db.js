const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'cleaning_task_app',
      password: process.env.DB_PASSWORD || 'postgres',
      port: process.env.DB_PORT || 5432,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    };

const pool = new Pool(poolConfig);

// Add event listener to handle unexpected connection terminations on idle clients
pool.on('error', (err) => {
  console.warn('Unexpected database pool connection error (auto-reconnecting):', err.message || err);
});

pool.connect((err) => {
  if (err) {
    console.error('Database initial connection error:', err.stack);
  } else {
    console.log('Connected to PostgreSQL database pool successfully');
  }
});

// Resilient query wrapper that automatically retries transient connection & recovery mode errors
const isTransientError = (err) => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';
  return (
    code === '57P03' || // cannot_connect_now / in recovery mode
    code === '57P01' || // admin_shutdown
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    msg.includes('connection terminated') ||
    msg.includes('recovery mode') ||
    msg.includes('socket disconnected') ||
    msg.includes('econnreset')
  );
};

const queryWithRetry = async (text, params, maxRetries = 2, delayMs = 600) => {
  let attempt = 0;
  while (true) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      attempt++;
      if (attempt <= maxRetries && isTransientError(err)) {
        console.warn(`[DB Resiliency] Transient error on query (attempt ${attempt}/${maxRetries}): ${err.message}. Retrying in ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      } else {
        throw err;
      }
    }
  }
};

module.exports = {
  query: (text, params) => pool.query(text, params),
  queryWithRetry,
  pool,
};

