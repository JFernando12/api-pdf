import { BedrockChat } from '@langchain/community/chat_models/bedrock';
import { BedrockEmbeddings } from '@langchain/community/embeddings/bedrock';

import { WebPDFLoader } from '@langchain/community/document_loaders/web/pdf';

import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { formatDocumentsAsString } from 'langchain/util/document';
import { PromptTemplate } from '@langchain/core/prompts';
import {
  RunnableSequence,
  RunnablePassthrough,
} from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ACCESS_KEY_ID, SECRET_ACCESS_KEY } from '../config/environment';
import { Document } from '@langchain/core/documents';

function estimateTokenCount(text: string) {
  return Math.ceil(text.length / 4);
}

const removeFormatting = (text: string) => {
  return text;
};

const proccessChunk = async (
  chunk: Document[],
  question: string,
  setting?: { k: number; fetchK: number; lambda: number }
) => {
  const embeddings = new BedrockEmbeddings({
    region: 'us-east-1',
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
    model: 'amazon.titan-embed-text-v2:0',
  });

  const model = new BedrockChat({
    model: 'anthropic.claude-3-haiku-20240307-v1:0',
    region: 'us-east-1',
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });

  // Process each chunk separately
  const contexts: any = {};
  let contextsPromp = '';
  for (let i = 0; i < chunk.length; i++) {
    console.log('Processing chunk:', i);
    const document = chunk[i];

    const vectorStore = await MemoryVectorStore.fromDocuments(
      [document],
      embeddings
    );
    console.log(`vectorStore ${i} created`);

    const retreiver = vectorStore.asRetriever({
      k: setting?.k || 5,
      searchKwargs: {
        fetchK: setting?.fetchK || 10,
        lambda: setting?.lambda || 0.6,
      },
    });

    const contextName = `context${i + 1}`;
    contexts[contextName] = retreiver.pipe(formatDocumentsAsString);

    contextsPromp += `{${contextName}} `;
  }

  const prompt =
    PromptTemplate.fromTemplate(`Responde la pregunta basándote únicamente en los siguientes contextos: ${contextsPromp}
    Pregunta: {question}`);

  const chain = RunnableSequence.from([
    {
      ...contexts,
      question: new RunnablePassthrough(),
    },
    prompt,
    model,
    new StringOutputParser(),
  ]);

  const result = await chain.invoke(question);

  return result;
};

export const generateResponse = async (
  blob: Blob,
  question: string,
  setting?: { k: number; fetchK: number; lambda: number }
): Promise<string> => {
  const loader = new WebPDFLoader(blob);
  const docs = await loader.load();

  const fullText = removeFormatting(
    docs.map((doc) => doc.pageContent).join(' ')
  );

  const maxTokens = 3800; // Adjust based on token limits
  // Create many chunks of text with a maximum of maxTokens tokens from fullText
  const textChunks = [];
  let currentChunk = '';
  let currentChunkTokens = 0;
  for (const word of fullText.split(' ')) {
    const wordTokens = estimateTokenCount(word);
    if (currentChunkTokens + wordTokens > maxTokens) {
      textChunks.push(currentChunk);
      currentChunk = '';
      currentChunkTokens = 0;
    }
    currentChunk += word + ' ';
    currentChunkTokens += wordTokens;
  }
  textChunks.push(currentChunk);

  // Create a document for each chunk
  const chunkedDocs = textChunks.map((chunk) => {
    return {
      pageContent: chunk,
      metadata: {},
    };
  });
  console.log('chunkedDocs:', chunkedDocs.length);

  // Procces every 20 chunks
  const chunkSize = 20;
  const chunks = [];
  for (let i = 0; i < chunkedDocs.length; i += chunkSize) {
    const chunk = chunkedDocs.slice(i, i + chunkSize);
    chunks.push(chunk);
  }

  const responses = [];
  for (const chunk of chunks) {
    const response = await proccessChunk(chunk, question, setting);
    responses.push(response);
  }

  // Summarize responses with ai if response has more than 1 element
  if (responses.length > 1) {
    const documents = responses.map((response) => ({ pageContent: response, metadata: {} }));
    const summary = await proccessChunk(documents, question, setting);
    return summary;
  }

  return responses[0];
};
