import { db } from './db';
import { generateResponse } from './services/generateResponse';
import { RowDataPacket } from 'mysql2/promise';
import getPdfData from './util/getPdfData';

interface INotification extends RowDataPacket {
  id: number;
  acto: string;
}

const start = async () => {
  try {
    console.log('Starting...');
    const notifications = await db.query<INotification[]>(
      'SELECT id, acto FROM buzon__notificaciones_lista WHERE id=67 limit 50',
      []
    );

    for (const notification of notifications) {
      const { id, acto } = notification;
      await addSummary(id, acto);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
};

const addSummary = async (id: number, acto: string) => {
  try {
    console.log('Adding summary for:', acto);
    const { blob, numberOfPages } = await getPdfData(acto);

    const summaryLength = numberOfPages <= 3 ? 200 : 300;
    const settings =
      numberOfPages <= 3
        ? { k: 5, fetchK: 15, lambda: 0.5 }
        : { k: 10, fetchK: 20, lambda: 0.5 };

    const prompt = `Breve resumen de ${summaryLength} palabras, no escribas texto adicional en tu respuesta, solo el resumen.`;
    const summary = await generateResponse(blob, prompt, settings);

    console.log('Summary:', summary);

    if (summary.length < 500) {
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
