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
import { encode } from 'gpt-3-encoder';

function estimateTokenCount(text: string) {
  return Math.ceil(text.length / 4);
}

function countTokens(text: string) {
  const tokens = encode(text);
  return tokens.length;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const removeFormatting = (text: string) => {
  return text
};

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
    model: 'amazon.titan-embed-text-v2:0',
  });

  const loader = new WebPDFLoader(blob);
  const docs = await loader.load();

  const fullText = removeFormatting(docs.map((doc) => doc.pageContent).join(' '));

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
      id: '',
    };
  });
  console.log('chunkedDocs:', chunkedDocs.length);

  // Process each chunk separately
  const contexts: any = {};
  let contextsPromp = '';
  for (let i = 0; i < 20; i++) {
    console.log('Processing chunk:', i);
    const chunk = chunkedDocs[i];
    console.log('chunk:', chunk);
    
    const vectorStore = await MemoryVectorStore.fromDocuments([chunk], embeddings);
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
