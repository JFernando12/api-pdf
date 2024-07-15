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

export const generateResponse = async (
  blob: Blob,
  question: string,
  setting?: { k: number; fetchK: number; lambda: number }
): Promise<string> => {
  const model = new BedrockChat({
    model: 'anthropic.claude-3-sonnet-20240229-v1:0',
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

  const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);

  const retriever = vectorStore.asRetriever({
    k: setting?.k || 5,
    searchKwargs: {
      fetchK: setting?.fetchK || 10,
      lambda: setting?.lambda || 0.6,
    },
  });

  const prompt =
    PromptTemplate.fromTemplate(`Answer the question based only on the following context: {context}
      Question: {question}`);

  const chain = RunnableSequence.from([
    {
      context: retriever.pipe(formatDocumentsAsString),
      question: new RunnablePassthrough(),
    },
    prompt,
    model,
    new StringOutputParser(),
  ]);

  const result = await chain.invoke(question);

  return result;
};
