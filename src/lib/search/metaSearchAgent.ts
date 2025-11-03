import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Embeddings } from '@langchain/core/embeddings';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
  PromptTemplate,
} from '@langchain/core/prompts';
import {
  RunnableLambda,
  RunnableMap,
  RunnableSequence,
} from '@langchain/core/runnables';
import { BaseMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import LineListOutputParser from '../outputParsers/listLineOutputParser';
import LineOutputParser from '../outputParsers/lineOutputParser';
import { getDocumentsFromLinks } from '../utils/documents';
import { Document } from 'langchain/document';
import { searchSearxng } from '../searxng';
import path from 'node:path';
import fs from 'node:fs';
import computeSimilarity from '../utils/computeSimilarity';
import formatChatHistoryAsString from '../utils/formatHistory';
import eventEmitter from 'events';
import { StreamEvent } from '@langchain/core/tracers/log_stream';

export interface MetaSearchAgentType {
  searchAndAnswer: (
    message: string,
    history: BaseMessage[],
    llm: BaseChatModel,
    embeddings: Embeddings | null,
    optimizationMode: 'speed' | 'balanced' | 'quality',
    fileIds: string[],
    systemInstructions: string,
    maxSources?: number,
    maxToken?: number,
    includeImages?: boolean,
    includeVideos?: boolean,
  ) => Promise<eventEmitter>;
}

interface Config {
  searchWeb: boolean;
  rerank: boolean;
  summarizer?: boolean; // Made optional - defaults to true globally
  rerankThreshold: number;
  queryGeneratorPrompt: string;
  responsePrompt: string;
  activeEngines: string[];
  maxSources?: number;
  focusMode?: string; // Track which agent is running
}

type BasicChainInput = {
  chat_history: BaseMessage[];
  query: string;
};

class MetaSearchAgent implements MetaSearchAgentType {
  private config: Config;
  private strParser = new StringOutputParser();

  constructor(config: Config) {
    // Enable summarization by default globally
    this.config = {
      ...config,
      summarizer: config.summarizer !== undefined ? config.summarizer : true
    };
  }


  private async createSearchRetrieverChain(llm: BaseChatModel, optimizationMode: 'speed' | 'balanced' | 'quality' = 'balanced', includeImages?: boolean, includeVideos?: boolean, maxToken?: number, sourcesLimit?: number) {
    (llm as unknown as ChatOpenAI).temperature = 0;
    // Apply maxToken limit if provided
    if (maxToken) {
      (llm as any).maxTokens = maxToken;
    }

    return RunnableSequence.from([
      PromptTemplate.fromTemplate(this.config.queryGeneratorPrompt),
      llm,
      this.strParser,
      RunnableLambda.from(async (input: string) => {
        const linksOutputParser = new LineListOutputParser({
          key: 'links',
        });

        const questionOutputParser = new LineOutputParser({
          key: 'question',
        });

        const links = await linksOutputParser.parse(input);
        let question = this.config.summarizer
          ? await questionOutputParser.parse(input)
          : input;

        console.log(`[DEBUG] LLM Response Input: "${input.substring(0, 300)}..."`);
        console.log(`[DEBUG] Parsed question: "${question}"`);
        console.log(`[DEBUG] Parsed links: ${links.length} links found`);

        if (question === 'not_needed') {
          return { query: '', docs: [] };
        }

        if (links.length > 0) {
          if (question.length === 0) {
            question = 'summarize';
          }

          let docs: Document[] = [];

          const linkDocs = await getDocumentsFromLinks({ links });

          const docGroups: Document[] = [];

          linkDocs.map((doc) => {
            const URLDocExists = docGroups.find(
              (d) =>
                d.metadata.url === doc.metadata.url &&
                d.metadata.totalDocs < 10,
            );

            if (!URLDocExists) {
              docGroups.push({
                ...doc,
                metadata: {
                  ...doc.metadata,
                  totalDocs: 1,
                },
              });
            }

            const docIndex = docGroups.findIndex(
              (d) =>
                d.metadata.url === doc.metadata.url &&
                d.metadata.totalDocs < 10,
            );

            if (docIndex !== -1) {
              docGroups[docIndex].pageContent =
                docGroups[docIndex].pageContent + `\n\n` + doc.pageContent;
              docGroups[docIndex].metadata.totalDocs += 1;
            }
          });

          await Promise.all(
            docGroups.map(async (doc) => {
              const res = await llm.invoke(`
            You are a web search summarizer, tasked with summarizing a piece of text retrieved from a web search. Your job is to summarize the 
            text into a detailed, 2-4 paragraph explanation that captures the main ideas and provides a comprehensive answer to the query.
            If the query is \"summarize\", you should provide a detailed summary of the text. If the query is a specific question, you should answer it in the summary.
            
            - **Journalistic tone**: The summary should sound professional and journalistic, not too casual or vague.
            - **Thorough and detailed**: Ensure that every key point from the text is captured and that the summary directly answers the query.
            - **Not too lengthy, but detailed**: The summary should be informative but not excessively long. Focus on providing detailed information in a concise format.

            The text will be shared inside the \`text\` XML tag, and the query inside the \`query\` XML tag.

            <example>
            1. \`<text>
            Docker is a set of platform-as-a-service products that use OS-level virtualization to deliver software in packages called containers. 
            It was first released in 2013 and is developed by Docker, Inc. Docker is designed to make it easier to create, deploy, and run applications 
            by using containers.
            </text>

            <query>
            What is Docker and how does it work?
            </query>

            Response:
            Docker is a revolutionary platform-as-a-service product developed by Docker, Inc., that uses container technology to make application 
            deployment more efficient. It allows developers to package their software with all necessary dependencies, making it easier to run in 
            any environment. Released in 2013, Docker has transformed the way applications are built, deployed, and managed.
            \`
            2. \`<text>
            The theory of relativity, or simply relativity, encompasses two interrelated theories of Albert Einstein: special relativity and general
            relativity. However, the word "relativity" is sometimes used in reference to Galilean invariance. The term "theory of relativity" was based
            on the expression "relative theory" used by Max Planck in 1906. The theory of relativity usually encompasses two interrelated theories by
            Albert Einstein: special relativity and general relativity. Special relativity applies to all physical phenomena in the absence of gravity.
            General relativity explains the law of gravitation and its relation to other forces of nature. It applies to the cosmological and astrophysical
            realm, including astronomy.
            </text>

            <query>
            summarize
            </query>

            Response:
            The theory of relativity, developed by Albert Einstein, encompasses two main theories: special relativity and general relativity. Special
            relativity applies to all physical phenomena in the absence of gravity, while general relativity explains the law of gravitation and its
            relation to other forces of nature. The theory of relativity is based on the concept of "relative theory," as introduced by Max Planck in
            1906. It is a fundamental theory in physics that has revolutionized our understanding of the universe.
            \`
            </example>

            Everything below is the actual data you will be working with. Good luck!

            <query>
            ${question}
            </query>

            <text>
            ${doc.pageContent}
            </text>

            Make sure to answer the query in the summary.
          `);

              const document = new Document({
                pageContent: res.content as string,
                metadata: {
                  title: doc.metadata.title,
                  url: doc.metadata.url,
                },
              });

              docs.push(document);
            }),
          );

          return { query: question, docs: docs };
        } else {
          console.log(`[DEBUG] Raw question before processing: "${question}"`);
          question = question.replace(/<think>.*?<\/think>/g, '');
          console.log(`[DEBUG] Question after removing think tags: "${question}"`);

          // Filter out YouTube and image searches for speed/balanced modes unless explicitly included
          let filteredEngines = this.config.activeEngines;
          if (optimizationMode === 'balanced' || optimizationMode === 'speed') {
            filteredEngines = this.config.activeEngines.filter(engine => {
              const engineLower = engine.toLowerCase();
              // Filter out YouTube unless explicitly included (includeVideos === true)
              if (includeVideos !== true && engineLower === 'youtube') {
                return false;
              }
              // Filter out image searches unless explicitly included (includeImages === true)
              if (includeImages !== true && ['google images', 'bing images', 'qwant images', 'unsplash'].includes(engineLower)) {
                return false;
              }
              return true;
            });
          }

          const res = await searchSearxng(question, {
            language: 'en',
            engines: filteredEngines,
          });

          // Debug logging
          console.log(`[DEBUG] Search query: "${question}"`);
          console.log(`[DEBUG] Engines used: ${filteredEngines.join(', ')}`);
          console.log(`[DEBUG] Results found: ${res.results?.length || 0}`);

          // Filter out unwanted results
          const filteredResults = res.results.filter((result) => {
            // Filter out YouTube results in speed/balanced modes unless explicitly included
            if ((optimizationMode === 'balanced' || optimizationMode === 'speed') && includeVideos !== true &&
              (result.url.includes('youtube.com') || result.url.includes('youtu.be'))) {
              return false;
            }
            return true;
          });

          // For now, create all documents as snippets
          // We'll fetch full content AFTER reranking selects the final sources
          const documents = filteredResults.map(result =>
            new Document({
              pageContent: result.content || `${result.title || 'No title'} - ${result.url || 'No URL'}`,
              metadata: {
                title: result.title || 'Untitled',
                url: result.url || '',
                needsFullContent: true, // Flag for later fetching
                ...(result.img_src && (optimizationMode === 'quality' || includeImages === true) && { img_src: result.img_src }),
              },
            })
          );

          console.log(`[DEBUG] Created ${documents.length} snippet documents for reranking`);

          return { query: question, docs: documents };
        }
      }),
    ]);
  }

  private async createAnsweringChain(
    llm: BaseChatModel,
    fileIds: string[],
    embeddings: Embeddings | null,
    optimizationMode: 'speed' | 'balanced' | 'quality',
    systemInstructions: string,
    sourcesLimit: number,
    maxToken?: number,
    includeImages?: boolean,
    includeVideos?: boolean,
  ) {
    // Configure max tokens if provided
    if (maxToken) {
      (llm as any).maxTokens = maxToken;
    }
    return RunnableSequence.from([
      RunnableMap.from({
        systemInstructions: () => systemInstructions,
        query: (input: BasicChainInput) => input.query,
        chat_history: (input: BasicChainInput) => input.chat_history,
        date: () => new Date().toISOString(),
        context: RunnableLambda.from(async (input: BasicChainInput) => {
          const processedHistory = formatChatHistoryAsString(
            input.chat_history,
          );

          let docs: Document[] | null = null;
          let query = input.query;

          if (this.config.searchWeb) {
            const searchRetrieverChain =
              await this.createSearchRetrieverChain(llm, optimizationMode, includeImages, includeVideos, maxToken, sourcesLimit);

            const searchRetrieverResult = await searchRetrieverChain.invoke({
              chat_history: processedHistory,
              query,
            });

            query = searchRetrieverResult.query;
            docs = searchRetrieverResult.docs;
          }

          const sortedDocs = await this.rerankDocs(
            query,
            docs ?? [],
            fileIds,
            embeddings,
            optimizationMode,
            sourcesLimit,
          );

          // Now fetch full content for the selected documents
          const docsWithFullContent = await this.fetchFullContentForDocs(
            sortedDocs,
            llm,
            query,
            optimizationMode,
            sourcesLimit
          );

          return docsWithFullContent;
        })
          .withConfig({
            runName: 'FinalSourceRetriever',
          })
          .pipe(this.processDocs),
      }),
      ChatPromptTemplate.fromMessages([
        ['system', this.config.responsePrompt],
        new MessagesPlaceholder('chat_history'),
        ['user', '{query}'],
      ]),
      llm,
      this.strParser,
    ]).withConfig({
      runName: 'FinalResponseGenerator',
      callbacks: [
        {
          handleLLMStart: async () => {
            console.log('[DEBUG] LLM started generating response...');
          },
          handleLLMEnd: async () => {
            console.log('[DEBUG] LLM finished generating response');
          },
          handleLLMError: async (err: Error) => {
            console.error('[ERROR] LLM error:', err.message);
          },
        },
      ],
    });
  }

  private async fetchFullContentForDocs(
    docs: Document[],
    llm: BaseChatModel,
    query: string,
    optimizationMode: 'speed' | 'balanced' | 'quality',
    maxSources: number
  ): Promise<Document[]> {
    // Determine how many to fetch based on optimization mode and actual selected docs
    const fetchPercentage = optimizationMode === 'speed' ? 0.2 :
      optimizationMode === 'balanced' ? 0.2 :
        0.5; // quality mode now fetches 50%
    // Use the actual number of selected docs, not maxSources
    const desiredFullFetches = Math.max(1, Math.ceil(docs.length * fetchPercentage));

    console.log(`[DEBUG] Post-rerank fetch: Will try to fetch full content for ${desiredFullFetches} of ${docs.length} selected docs`);

    // Get all docs that could be fetched
    const candidateDocs = docs.filter(doc => doc.metadata.needsFullContent);

    if (candidateDocs.length === 0) {
      return docs;
    }

    // Fetch with retry mechanism - keep trying until we get desired number or run out
    const fullContentMap = new Map<string, string>();
    const successfulUrls = new Set<string>();
    const attemptedUrls = new Set<string>();

    const { getDocumentsFromLinks } = await import('../utils/documents');

    const dedupedCandidates: Document[] = [];
    const seenUrls = new Set<string>();
    for (const doc of candidateDocs) {
      const url = doc.metadata.url;
      if (!url || seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);
      dedupedCandidates.push(doc);
    }

    if (dedupedCandidates.length === 0) {
      return docs;
    }

    const initialBatchSize = Math.min(desiredFullFetches, dedupedCandidates.length);
    let nextIndex = initialBatchSize;
    let activeDocs = dedupedCandidates.slice(0, initialBatchSize);

    while (activeDocs.length > 0 && successfulUrls.size < desiredFullFetches) {
      const batchUrls = activeDocs
        .map(doc => doc.metadata.url)
        .filter((url): url is string => !!url && !attemptedUrls.has(url));

      batchUrls.forEach(url => attemptedUrls.add(url));

      const needed = desiredFullFetches - successfulUrls.size;
      console.log(`[DEBUG] Attempting to fetch ${batchUrls.length} URLs (need ${needed} more)`);

      if (batchUrls.length === 0) {
        break;
      }

      const fetchedDocs = await getDocumentsFromLinks({ links: batchUrls });

      const newlySuccessful = new Set<string>();

      fetchedDocs.forEach(doc => {
        const url = doc.metadata.url;
        const existing = fullContentMap.get(url);
        fullContentMap.set(url, existing ? `${existing}\n\n${doc.pageContent}` : doc.pageContent);

        if (!successfulUrls.has(url)) {
          newlySuccessful.add(url);
        }
      });

      newlySuccessful.forEach(url => successfulUrls.add(url));

      console.log(`[DEBUG] Successfully fetched ${successfulUrls.size} unique URLs so far`);

      if (successfulUrls.size >= desiredFullFetches) {
        break;
      }

      const remainingNeeded = desiredFullFetches - successfulUrls.size;
      const nextBatch: Document[] = [];

      while (nextBatch.length < remainingNeeded && nextIndex < dedupedCandidates.length) {
        const candidate = dedupedCandidates[nextIndex++];
        const candidateUrl = candidate.metadata.url;
        if (!candidateUrl || attemptedUrls.has(candidateUrl)) {
          continue;
        }
        nextBatch.push(candidate);
      }

      activeDocs = nextBatch;

      if (activeDocs.length === 0 && successfulUrls.size < desiredFullFetches) {
        console.log('[DEBUG] No additional documents available for fetching full content');
      }
    }

    console.log(`[DEBUG] Fetch complete: Got ${successfulUrls.size} of ${desiredFullFetches} desired full content docs`);

    // Update documents with full content
    const updatedDocs = await Promise.all(docs.map(async (doc) => {
      const fullContent = fullContentMap.get(doc.metadata.url);
      if (fullContent) {
        // Summarize if enabled
        if (this.config.summarizer && fullContent.length > 2000) {
          try {
            const summary = await llm.invoke(`
              You are a web content summarizer. Create a CONCISE summary of the following content.
              Focus ONLY on information directly relevant to the query.
              
              IMPORTANT: Keep your summary to 2-3 sentences maximum (50-75 words).
              Include only the most critical facts, data, and key points.
              
              <text>
              ${fullContent.slice(0, 6000)}
              </text>
              
              <query>
              ${query}
              </query>
              
              Concise summary (2-3 sentences):
            `);

            return new Document({
              pageContent: (summary.content as string) || fullContent.slice(0, 500),
              metadata: { ...doc.metadata, hasFullContent: true }
            });
          } catch (err) {
            console.warn('Error summarizing:', err);
            return new Document({
              pageContent: fullContent.slice(0, 500),
              metadata: { ...doc.metadata, hasFullContent: true }
            });
          }
        }

        return new Document({
          pageContent: fullContent,
          metadata: { ...doc.metadata, hasFullContent: true }
        });
      }
      return doc;
    }));

    console.log(`[DEBUG] Final: ${updatedDocs.filter(d => d.metadata.hasFullContent).length} with full content, ${updatedDocs.filter(d => !d.metadata.hasFullContent).length} with snippets`);

    return updatedDocs;
  }

  private async rerankDocs(
    query: string,
    docs: Document[],
    fileIds: string[],
    embeddings: Embeddings | null,
    optimizationMode: 'speed' | 'balanced' | 'quality',
    sourcesLimit: number,
  ) {
    if (docs.length === 0 && fileIds.length === 0) {
      return docs;
    }

    const filesData = fileIds
      .map((file) => {
        const filePath = path.join(process.cwd(), 'uploads', file);

        const contentPath = filePath + '-extracted.json';
        const embeddingsPath = filePath + '-embeddings.json';

        const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
        const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));

        const fileSimilaritySearchObject = content.contents.map(
          (c: string, i: number) => {
            return {
              fileName: content.title,
              content: c,
              embeddings: embeddings.embeddings[i],
            };
          },
        );

        return fileSimilaritySearchObject;
      })
      .flat();

    if (query.toLocaleLowerCase() === 'summarize') {
      return docs.slice(0, sourcesLimit);
    }

    const docsWithContent = docs.filter(
      (doc) => doc.pageContent && doc.pageContent.length > 0,
    );

    // If no embeddings provided, skip reranking and return docs as-is
    if (!embeddings) {
      return docsWithContent.slice(0, sourcesLimit);
    }

    if (optimizationMode === 'speed' || this.config.rerank === false) {
      if (filesData.length > 0) {
        const [queryEmbedding] = await Promise.all([
          embeddings.embedQuery(query),
        ]);

        const fileDocs = filesData.map((fileData) => {
          return new Document({
            pageContent: fileData.content,
            metadata: {
              title: fileData.fileName,
              url: `File`,
            },
          });
        });

        const similarity = filesData.map((fileData, i) => {
          const sim = computeSimilarity(queryEmbedding, fileData.embeddings);

          return {
            index: i,
            similarity: sim,
          };
        });

        let sortedDocs = similarity
          .filter(
            (sim) => sim.similarity > (this.config.rerankThreshold ?? 0.3),
          )
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, sourcesLimit)
          .map((sim) => fileDocs[sim.index]);

        sortedDocs =
          docsWithContent.length > 0 ? sortedDocs.slice(0, 8) : sortedDocs;

        return [
          ...sortedDocs,
          ...docsWithContent.slice(0, sourcesLimit - sortedDocs.length),
        ];
      } else {
        return docsWithContent.slice(0, sourcesLimit);
      }
    } else if (optimizationMode === 'balanced' || optimizationMode === 'quality') {
      // If there are no documents to rerank and no files, return empty array
      if (docsWithContent.length === 0 && filesData.length === 0) {
        return [];
      }

      // Only embed documents if there are any
      let docEmbeddings: number[][] = [];
      if (docsWithContent.length > 0) {
        docEmbeddings = await embeddings.embedDocuments(
          docsWithContent.map((doc) => doc.pageContent),
        );
      }

      const queryEmbedding = await embeddings.embedQuery(query);

      // Add file data to documents
      docsWithContent.push(
        ...filesData.map((fileData) => {
          return new Document({
            pageContent: fileData.content,
            metadata: {
              title: fileData.fileName,
              url: `File`,
            },
          });
        }),
      );

      docEmbeddings.push(...filesData.map((fileData) => fileData.embeddings));

      // If still no documents after adding files, return empty
      if (docEmbeddings.length === 0) {
        return [];
      }

      const similarity = docEmbeddings.map((docEmbedding, i) => {
        const sim = computeSimilarity(queryEmbedding, docEmbedding);

        return {
          index: i,
          similarity: sim,
        };
      });

      const sortedDocs = similarity
        .filter((sim) => sim.similarity > (this.config.rerankThreshold ?? 0.3))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, sourcesLimit)
        .map((sim) => docsWithContent[sim.index]);

      return sortedDocs;
    }

    return [];
  }

  private processDocs(docs: Document[]) {
    return docs
      .map(
        (_, index) =>
          `${index + 1}. ${docs[index].metadata.title} ${docs[index].pageContent}`,
      )
      .join('\n');
  }

  private async handleStream(
    stream: AsyncGenerator<StreamEvent, any, any>,
    emitter: eventEmitter,
  ) {
    try {
      const startTime = Date.now();
      const focusMode = this.config.focusMode || 'unknown';
      let eventCount = 0;
      let chunkCount = 0;
      
      const getElapsedTime = () => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        return `${minutes}m ${seconds}s`;
      };
      
      for await (const event of stream) {
        eventCount++;
        
        // Log all events to see what's happening
        console.log(`[${focusMode.toUpperCase()}] [${getElapsedTime()}] Event ${eventCount}: ${event.event} | name: ${event.name}`);
        
        if (
          event.event === 'on_chain_end' &&
          event.name === 'FinalSourceRetriever'
        ) {
          console.log(`[${focusMode.toUpperCase()}] [${getElapsedTime()}] FinalSourceRetriever completed, starting response generation...`);
          emitter.emit(
            'data',
            JSON.stringify({ type: 'sources', data: event.data.output }),
          );
        }
        if (
          event.event === 'on_chain_stream' &&
          event.name === 'FinalResponseGenerator'
        ) {
          chunkCount++;
          console.log(`[${focusMode.toUpperCase()}] [${getElapsedTime()}] CHUNK #${chunkCount}:`, event.data.chunk);
          emitter.emit(
            'data',
            JSON.stringify({ type: 'response', data: event.data.chunk }),
          );
        }
        if (
          event.event === 'on_chain_end' &&
          event.name === 'FinalResponseGenerator'
        ) {
          console.log(`[${focusMode.toUpperCase()}] [${getElapsedTime()}] FinalResponseGenerator completed`);
          emitter.emit('end');
        }
      }
      console.log(`[${focusMode.toUpperCase()}] [${getElapsedTime()}] Stream completed. Total events: ${eventCount}, Text chunks: ${chunkCount}`);
    } catch (error) {
      console.error('[ERROR] Stream handling error:', error);
      emitter.emit('error', error);
    }
  }

  async searchAndAnswer(
    message: string,
    history: BaseMessage[],
    llm: BaseChatModel,
    embeddings: Embeddings | null,
    optimizationMode: 'speed' | 'balanced' | 'quality',
    fileIds: string[],
    systemInstructions: string,
    maxSources?: number,
    maxToken?: number,
    includeImages?: boolean,
    includeVideos?: boolean,
  ) {
    const emitter = new eventEmitter();

    // Use provided maxSources or fall back to config default
    const sourcesLimit = maxSources || this.config.maxSources || 15;

    const answeringChain = await this.createAnsweringChain(
      llm,
      fileIds,
      embeddings,
      optimizationMode,
      systemInstructions,
      sourcesLimit,
      maxToken,
      includeImages,
      includeVideos,
    );

    const stream = answeringChain.streamEvents(
      {
        chat_history: history,
        query: message,
      },
      {
        version: 'v1',
      },
    );

    this.handleStream(stream, emitter);

    return emitter;
  }
}

export default MetaSearchAgent;
