import { createPool, Pool, RowDataPacket } from 'mysql2/promise';
import { DB_DATABASE, DB_HOST, DB_PASSWORD, DB_USER } from '../config/environment';
export class Database {
  private pool: Pool;

  constructor() {
    this.pool = createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_DATABASE,
    });
  }

  async query<T extends RowDataPacket[]>(sql: string, values: any[]) {
    const connection = await this.pool.getConnection();
    const [rows] = await connection.query<T>(sql, values);
    connection.release();
    return rows;
  }

  async close() {
    await this.pool.end();
  }
}

export const db = new Database();