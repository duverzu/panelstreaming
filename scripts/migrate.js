/**
 * scripts/migrate.js — crea las tablas leyendo schema.sql
 * Uso:  npm run migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('✅ Migración completada: tablas creadas/verificadas');
  await pool.end();
}

migrate().catch((err) => {
  console.error('❌ Migración falló:', err.message);
  process.exit(1);
});
