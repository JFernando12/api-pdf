import axios from 'axios';
import pdfParse from 'pdf-parse';

const getPdfData = async (url: string) => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });

    const blob = new Blob([response.data]);

    const data = await pdfParse(response.data);

    const numberOfPages = data.numpages;

    return {
      blob,
      numberOfPages,
    };
  } catch (error) {
    console.error('Error fetching or processing the PDF:', error);
    throw error;
  }
};

export default getPdfData;