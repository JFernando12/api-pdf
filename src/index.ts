import { db } from "./db";
import { generateResponse } from "./util/generateResponse";
import { RowDataPacket } from 'mysql2/promise';
import { config } from 'dotenv';
config();

interface INotification extends RowDataPacket {
  id: number;
  acto: string;
}

const start = async () => {
  try {
    console.log('Starting...');
    const notifications = await db.query<INotification[]>('SELECT id, acto FROM buzon__notificaciones_lista limit 1', []);
    console.log('Notifications:', notifications)

    for (const notification of notifications) {
      const { id, acto } = notification;
      await addSummary(id, acto);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

const addSummary = async (id: number, acto: string) => {
  console.log('Adding summary for:', id);
  const summary = await generateResponse(acto, 'Genera un resumen de 200 palabras');
  console.log('Summary:', summary);

  await db.query('UPDATE buzon__notificaciones_lista SET resumen = ? WHERE id = ?', [summary, id]);
}

start();