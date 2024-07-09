import { createPool, Pool, RowDataPacket } from 'mysql2/promise';

const DB_HOST = process.env.DB_HOST!;
const DB_USER = process.env.DB_USER!;
const DB_PASSWORD = process.env.DB_PASSWORD!;
const DB_DATABASE = process.env.DB_DATABASE!;

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