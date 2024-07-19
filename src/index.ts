import { db } from './db';
import { generateResponse } from './services/generateResponse';
import { RowDataPacket } from 'mysql2/promise';
import getPdfData from './util/getPdfData';
import verifyURL from './util/verifyURL';

interface INotification extends RowDataPacket {
  id: number;
  acto: string;
  fecha: string;
}

// 40106
// 40255
// 40256

const start = async () => {
  try {
    console.log('Starting...');
    const notifications = await db.query<INotification[]>(
      'SELECT id, acto, fecha FROM buzon__notificaciones_lista WHERE id = 38812 limit 1',
      []
    );

    const chunkSize = 10; // Number of concurrent tasks
    for (let i = 0; i < notifications.length; i += chunkSize) {
      const chunk = notifications.slice(i, i + chunkSize);
      await Promise.all(chunk.map(({ id, acto, fecha }) => addSummary(id, acto, fecha)));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
};

const addSummary = async (id: number, acto: string, fecha: string) => {
  try {
    console.log(`Adding summary for: ${id} - ${fecha} - ${acto}`);
    const isURL = verifyURL(acto);
    
    if (!isURL) {
      console.log(`Acto with ID ${id} is not a valid URL`);
      await db.query(
        'UPDATE buzon__notificaciones_lista SET resumen = ? WHERE id = ?',
        ['Sin resumen', id]
      );
      return;
    }

    const { blob, numberOfPages } = await getPdfData(acto);

    const summaryLength = numberOfPages <= 3 ? 200 : (numberOfPages <= 10 ? 300 : 500);
    const settings =
      numberOfPages <= 3
        ? { k: 10, fetchK: 20, lambda: 0.5 }
        : { k: 15, fetchK: 25, lambda: 0.5 };

    const prompt = `Dame un resumen de ${summaryLength} palabras, incluye todas la fechas que encuentres, solo quiero el resumen, sin añadidos tipo "Resumen: " o "En resumen".`;
    const summary = await generateResponse(blob, prompt, settings);

    console.log(`Sumary ${id}:`, summary);
    console.log(`Summary ${id} length:`, summary.length);

    if (summary.length < 650) {
      console.log(`Summary for acto with ID ${id} is not possible`);
      await db.query(
        'UPDATE buzon__notificaciones_lista SET resumen = ? WHERE id = ?',
        ['Sin resumen', id]
      );
      return;
    }

    await db.query(
      'UPDATE buzon__notificaciones_lista SET resumen = ? WHERE id = ?',
      [summary, id]
    );
    console.log(`Summary added successfully for acto with ID ${id}`);
  } catch (error) {
    console.error(`Failed to add summary for acto with ID ${id}:`, error);
  }
};

start();
