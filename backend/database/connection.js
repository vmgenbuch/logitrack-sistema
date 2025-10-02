const { Pool } = require('pg');
require('dotenv').config();

console.log('DATABASE_URL desde .env:', process.env.DATABASE_URL); // Debug

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://abraham@localhost:5432/logistica_mty',
    ssl: false
});

pool.on('connect', () => {
    console.log('✅ Conectado a PostgreSQL');
});

module.exports = pool;