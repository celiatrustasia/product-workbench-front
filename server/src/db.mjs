import mysql from 'mysql2/promise';
import { config } from './config.mjs';

export const pool = mysql.createPool({ ...config.mysql, database: config.database, connectionLimit: 8, charset: 'utf8mb4', timezone: '+08:00', dateStrings: true, enableKeepAlive: true, connectTimeout: 10000, multipleStatements: false });
pool.on('connection', connection => connection.query("SET time_zone = '+08:00'"));
export async function rows(sql, values = [], connection = pool) {
  const [result] = await connection.execute(sql, values);
  return result;
}
export async function transaction(operation) {
  const connection = await pool.getConnection();
  try { await connection.beginTransaction(); const result = await operation(connection); await connection.commit(); return result; }
  catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
export async function createDatabase() {
  const connection = await mysql.createConnection(config.mysql);
  try { await connection.query(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`); }
  finally { await connection.end(); }
}
