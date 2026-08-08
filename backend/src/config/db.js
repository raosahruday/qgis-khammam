const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
      max: 20,
      idleTimeoutMillis: 10000, // Recycle idle connections after 10s before cloud gateway drops them
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000, // Send TCP keepalive packets every 10s to prevent cloud load balancer drops
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'cleaning_task_app',
      password: process.env.DB_PASSWORD || 'postgres',
      port: process.env.DB_PORT || 5432,
      max: 20,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };

const pool = new Pool(poolConfig);

// Catch unexpected connection terminations on idle clients without crashing Node.js
pool.on('error', (err, client) => {
  console.warn('[DB Pool] Idle client connection error (auto-handled by pool):', err.message || err);
});

// Test initial connection and immediately release client to prevent startup connection leak
pool.connect((err, client, release) => {
  if (err) {
    console.error('Database initial connection error:', err.stack);
  } else {
    console.log('Connected to PostgreSQL database pool successfully');
  }
  if (release) release();
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
    code === '08006' || // connection_failure
    code === '08003' || // connection_does_not_exist
    code === '08001' || // sqlclient_unable_to_establish_sqlconnection
    code === '08004' || // sqlserver_rejected_establishment_of_sqlconnection
    msg.includes('connection terminated') ||
    msg.includes('recovery mode') ||
    msg.includes('socket disconnected') ||
    msg.includes('econnreset') ||
    msg.includes('closed')
  );
};

const queryWithRetry = async (text, params, maxRetries = 3, delayMs = 300) => {
  let attempt = 0;
  while (true) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      attempt++;
      if (attempt <= maxRetries && isTransientError(err)) {
        const backoff = delayMs * Math.pow(2, attempt - 1);
        console.warn(`[DB Resiliency] Transient error on query (attempt ${attempt}/${maxRetries}): ${err.message}. Retrying in ${backoff}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      } else {
        throw err;
      }
    }
  }
};

module.exports = {
  query: (text, params) => queryWithRetry(text, params),
  queryWithRetry,
  pool,
};

