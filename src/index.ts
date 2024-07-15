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
      'SELECT id, acto, fecha FROM buzon__notificaciones_lista WHERE resumen IS NULL AND fecha LIKE "%07/2024" AND id != 40106 AND id != 40255 AND != 40256 limit 50',
      []
    );

    for (const notification of notifications) {
      const { id, acto, fecha } = notification;
      await addSummary(id, acto, fecha);
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

    const summaryLength = numberOfPages <= 3 ? 200 : 300;
    const settings =
      numberOfPages <= 3
        ? { k: 5, fetchK: 15, lambda: 0.5 }
        : { k: 10, fetchK: 20, lambda: 0.5 };

    const prompt = `Dame un resumen de ${summaryLength} palabras, sin añadidos ni doble saltos de linea.`;
    const summary = await generateResponse(blob, prompt, settings);

    console.log('Summary:', summary);
    console.log('Summary length:', summary.length);

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
