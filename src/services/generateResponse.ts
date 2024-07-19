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
import { Document } from "@langchain/core/documents";

function estimateTokenCount(text: string) {
  return Math.ceil(text.length / 4);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const generateResponse = async (
  blob: Blob,
  question: string,
  setting?: { k: number; fetchK: number; lambda: number }
): Promise<string> => {
  const model = new BedrockChat({
    model: 'anthropic.claude-3-haiku-20240307-v1:0',
    region: 'us-east-1',
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });

  const embeddings = new BedrockEmbeddings({
    region: 'us-east-1',
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });

  const loader = new WebPDFLoader(blob);
  const docs = await loader.load();

  // Define a function to split documents into chunks
  const maxTokens = 12000;
  const chunkDocs = async (docs: Document[], chunkSize: number) => {
    let chunks: any = [];
    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      const tokens = estimateTokenCount(chunk.map((doc) => doc.pageContent).join(' '));

      if (tokens > maxTokens) {
        let newChunkSize = Math.ceil(tokens / maxTokens);
        if (newChunkSize >= docs.length) {
          newChunkSize = docs.length - 1;
        }
        console.log('newChunkSize:', newChunkSize);
        const newChunks = await chunkDocs(chunk, newChunkSize);
        chunks.push(...newChunks);
        continue;
      }

      chunks.push(chunk);
    }
    return chunks;
  };

  // Split documents into chunks
  console.log('docs:', docs.length);
  const chunkedDocs = await chunkDocs(docs, 20); // Adjust chunk size based on token limits
  console.log('chunkedDocs:', chunkedDocs.length);

  // Process each chunk separately
  const contexts: any = {};
  let contextsPromp = '';
  for (let i = 0; i < chunkedDocs.length; i++) {
    console.log('Processing chunk:', i);
    const chunk = chunkedDocs[i];
    console.log('chunk:', chunk.length);
    console.log('chunk:', chunk);

    const tokens = estimateTokenCount(chunk.map((doc: Document) => doc.pageContent).join(' '));
    console.log('tokens:', tokens);
    
    const vectorStore = await MemoryVectorStore.fromDocuments(chunk, embeddings);
    console.log(`vectorStore ${i} created`);
    await delay(3000); // Add delay to avoid rate limits

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

  console.log('contexts:', contexts);
  console.log('contextsPromp:', contextsPromp);


  const prompt =
    PromptTemplate.fromTemplate(`Answer the question based only on the following contexts: ${contextsPromp}
      Question: {question}`);

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
