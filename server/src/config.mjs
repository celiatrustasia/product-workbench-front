import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.TZ = 'Asia/Shanghai';
export const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const database = env.MYSQL_DATABASE || 'friend_product_workbench';
if (!/^friend_[a-zA-Z0-9_]+$/.test(database)) throw new Error('MYSQL_DATABASE must be a project-specific friend_ database');
export const config = {
  host: env.HOST || '127.0.0.1', port: Number(env.PORT || 3001),
  production: env.NODE_ENV === 'production',
  origins: (env.APP_ORIGINS || 'http://127.0.0.1:5174').split(',').map(value => value.trim()),
  database,
  mysql: { host: env.MYSQL_HOST || '127.0.0.1', port: Number(env.MYSQL_PORT || 13306), user: env.MYSQL_USER || 'friend_dev', password: env.MYSQL_PASSWORD_FILE ? readFileSync(env.MYSQL_PASSWORD_FILE, 'utf8').trim() : env.MYSQL_PASSWORD },
  bootstrapUsername: env.BOOTSTRAP_USERNAME || 'celia', bootstrapName: env.BOOTSTRAP_NAME || 'Celia Wang',
  bootstrapPasswordFile: resolve(serverRoot, env.BOOTSTRAP_PASSWORD_FILE || '.runtime/bootstrap-admin.txt'),
  staticDir: env.STATIC_DIR ? resolve(serverRoot, env.STATIC_DIR) : undefined,
};
if (!config.mysql.password) throw new Error('Configure MYSQL_PASSWORD_FILE or MYSQL_PASSWORD');
