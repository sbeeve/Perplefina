import handleImageSearch from '@/lib/chains/imageSearchAgent';
import {
  getCustomOpenaiApiKey,
  getCustomOpenaiApiUrl,
  getCustomOpenaiModelName,
} from '@/lib/config';
import { getAvailableChatModelProviders } from '@/lib/providers';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ChatModel {
  provider: string;
  model: string;
}

interface ImageSearchBody {
  query: string;
  chatHistory: any[];
  chatModel?: ChatModel;
}

export const POST = async (req: Request) => {
  try {
    const body: ImageSearchBody = await req.json();

    const chatHistory = body.chatHistory
      .map((msg: any) => {
        if (msg.role === 'user') {
          return new HumanMessage(msg.content);
        } else if (msg.role === 'assistant') {
          return new AIMessage(msg.content);
        }
      })
      .filter((msg) => msg !== undefined) as BaseMessage[];

    const chatModelProviders = await getAvailableChatModelProviders();

    const chatModelProvider =
      chatModelProviders[
        body.chatModel?.provider || Object.keys(chatModelProviders)[0]
      ];
    const chatModel =
      chatModelProvider[
        body.chatModel?.model || Object.keys(chatModelProvider)[0]
      ];

    let llm: BaseChatModel | undefined;

    if (body.chatModel?.provider === 'custom_openai') {
      llm = new ChatOpenAI({
        apiKey: getCustomOpenaiApiKey(),
        modelName: getCustomOpenaiModelName(),
        temperature: 0.7,
        configuration: {
          baseURL: getCustomOpenaiApiUrl(),
        },
      }) as unknown as BaseChatModel;
    } else if (chatModelProvider && chatModel) {
      llm = chatModel.model;
    }

    if (!llm) {
      return Response.json({ error: 'Invalid chat model' }, { status: 400 });
    }

    const images = await handleImageSearch(
      {
        chat_history: chatHistory,
        query: body.query,
      },
      llm,
    );

    return Response.json({ images }, { status: 200 });
  } catch (err: any) {
    console.error(`An error occurred while searching images: ${err}`);
    
    // Check for API key errors
    if (err?.message?.includes('API key not valid') || err?.message?.includes('API_KEY_INVALID')) {
      return Response.json(
        { 
          error: 'Invalid API key. Please check your model configuration in settings.',
          details: 'The API key for the selected model is invalid or expired. Please update it in your config.toml file.'
        },
        { status: 401 },
      );
    }
    
    // Check for model availability errors
    if (err?.message?.includes('may not be available')) {
      return Response.json(
        { 
          error: 'Selected model is not available',
          details: err.message
        },
        { status: 400 },
      );
    }
    
    return Response.json(
      { message: 'An error occurred while searching images' },
      { status: 500 },
    );
  }
};
