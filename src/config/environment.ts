import { config } from 'dotenv';
config();

export const ACCESS_KEY_ID = process.env.ACCESS_KEY_ID!
export const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY!

export const DB_HOST = process.env.DB_HOST!
export const DB_USER = process.env.DB_USER!
export const DB_PASSWORD = process.env.DB_PASSWORD!
export const DB_DATABASE = process.env.DB_DATABASE!