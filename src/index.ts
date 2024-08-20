import { db } from './db';
import { generateResponse } from './services/generateResponse';
import { RowDataPacket } from 'mysql2/promise';
import getPdfData from './util/getPdfData';
import verifyURL from './util/verifyURL';
import { generateResponse3 } from './services/generateResponse3';

interface INotification extends RowDataPacket {
  id: number;
  acto: string;
  fecha: string;
}

//Procesados: 08, 07, 06, 05

const start = async () => {
  try {
    console.log('Starting...');
    const notifications = await db.query<INotification[]>(
      'SELECT id, acto, fecha FROM buzon__notificaciones_lista WHERE id=48072',
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

    let summaryLength = 200;
    let settings = { k: 5, fetchK: 15, lambda: 0.5 };

    if (numberOfPages > 3 && numberOfPages <= 10) {
      summaryLength = 300;
      settings = { k: 12, fetchK: 17, lambda: 0.5 };
    } else if (numberOfPages > 10 && numberOfPages <= 30) {
      summaryLength = 500;
      settings = { k: 12, fetchK: 17, lambda: 0.5 };
    } else if (numberOfPages > 30) {
      summaryLength = 1000;
      settings = { k: 3, fetchK: 10, lambda: 0.5 };
    }

    console.log(`Summary length: ${summaryLength}`);
    const prompt = `Dame un resumen de aproximadamente ${summaryLength} palabras, incluye todos los entregables y fechas importantes de ser posible.`;
    const format = 'IMPORTANTE: Dame todo en formato HTML, sin son listas utiliza el tag ol (p, b, br, ol, li, etc.). IMPORTANTE: Solo devuelve el contenido del resumen, sin titulos tipo <h2>Resumen</h2> o </body>.';
    const summary = await generateResponse(blob, prompt, format, settings);

    console.log(`Sumary ${id}:`, summary);
    console.log(`Summary ${id} characters:`, summary.length);
    if (summary.length < 600) {
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

    const summaryBlob = [{ id: '1', pageContent: summary, metadata: {} }];
    const deliverablesJson = await generateResponse3(summaryBlob, 'Ordena los entregables en formato JSON { "Entregable 1": "{{Descripcion1}}", "Entregable 2": "{{Descripcion2}}" }. IMPORTANTE: Solo devuelve el JSON', settings);
    console.log(`Deliverables JSON ${id}:`, deliverablesJson);
    
    // Check if deliverables are valid JSON
    try {
      const deliverables = JSON.parse(deliverablesJson);
      console.log('Deriverables:', deliverables);

      // Getting the parragraphs of each deliverable
      let deliverablesParagraphs = [];
      let order = 0;
      for (const key in deliverables) {
        const entregable = deliverables[key];
        const format = 'IMPORTANTE: Solo devuelve el contenido, sin agregados tipo "El párrafo que contiene este entregable es:"';
        const parrafo = await generateResponse(blob, `Dame el parrafo que contiene este entregable: ${entregable}`, format, settings);
        deliverablesParagraphs.push({ order, entregable, parrafo });
        order++;
      }
      console.log('Deliverables paragraphs:', deliverablesParagraphs);
    } catch (error) {
      console.error(`Deliverables for acto with ID ${id} are not valid JSON:`, error);
      return;
    }

    await db.query(
      'UPDATE buzon__notificaciones_lista SET entregables = ? WHERE id = ?',
      [deliverablesJson, id]
    );
  } catch (error) {
    console.error(`Failed to add summary for acto with ID ${id}:`, error);
  }
};

start();
