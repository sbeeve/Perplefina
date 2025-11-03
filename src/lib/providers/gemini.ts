import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from '@langchain/google-genai';
import { getGeminiApiKey } from '../config';
import { ChatModel, EmbeddingModel } from '.';

export const PROVIDER_INFO = {
  key: 'gemini',
  displayName: 'Google Gemini',
};
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { Embeddings } from '@langchain/core/embeddings';

// Set environment variable IMMEDIATELY when module loads
// This ensures LangChain can find it before any models are instantiated
if (typeof process !== 'undefined') {
  const apiKey = getGeminiApiKey();
  if (apiKey && apiKey.trim()) {
    process.env.GOOGLE_API_KEY = apiKey.trim();
  }
}

const geminiChatModels: Record<string, string>[] = [
  {
    displayName: 'Gemini 2.5 Flash',
    key: 'models/gemini-2.5-flash',
  },
  {
    displayName: 'Gemini 2.5 Pro',
    key: 'models/gemini-2.5-pro',
  },
  {
    displayName: 'Gemini 1.5 Flash',
    key: 'models/gemini-1.5-flash',
  },
  {
    displayName: 'Gemini 1.5 Pro',
    key: 'models/gemini-1.5-pro',
  },
];

const geminiEmbeddingModels: Record<string, string>[] = [
  {
    displayName: 'Text Embedding 004',
    key: 'models/text-embedding-004',
  },
  {
    displayName: 'Embedding 001',
    key: 'models/embedding-001',
  },
];

export const loadGeminiChatModels = async () => {
  const geminiApiKey = getGeminiApiKey();

  if (!geminiApiKey || geminiApiKey.trim() === '') return {};

  // Basic validation: Gemini API keys typically start with "AIza"
  if (!geminiApiKey.startsWith('AIza')) {
    console.warn('⚠️ Gemini API key format appears invalid. Keys should start with "AIza"');
    return {};
  }

  const trimmedKey = geminiApiKey.trim();
  
  // Force set environment variable - LangChain checks this first
  if (typeof process !== 'undefined') {
    process.env.GOOGLE_API_KEY = trimmedKey;
  }

  try {
    const chatModels: Record<string, ChatModel> = {};

    geminiChatModels.forEach((model) => {
      // Explicitly pass apiKey parameter AND ensure env var is set
      // Debug: Log to verify API key is being passed
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Gemini] Creating model ${model.key} with API key: ${trimmedKey.substring(0, 10)}... (env var: ${process.env.GOOGLE_API_KEY?.substring(0, 10) || 'NOT SET'}...)`);
      }
      
      chatModels[model.key] = {
        displayName: model.displayName,
        model: new ChatGoogleGenerativeAI({
          apiKey: trimmedKey,
          model: model.key,
          temperature: 0.7,
        }) as unknown as BaseChatModel,
      };
    });

    return chatModels;
  } catch (err) {
    console.error(`Error loading Gemini models: ${err}`);
    // Check if it's an API key error
    if (err instanceof Error && err.message.includes('API key')) {
      console.error('⚠️ Invalid Gemini API key. Please check your config.toml file and ensure you have a valid API key from https://makersuite.google.com/app/apikey');
    }
    return {};
  }
};

export const loadGeminiEmbeddingModels = async () => {
  const geminiApiKey = getGeminiApiKey();

  if (!geminiApiKey || geminiApiKey.trim() === '') return {};

  // Basic validation: Gemini API keys typically start with "AIza"
  if (!geminiApiKey.startsWith('AIza')) {
    console.warn('⚠️ Gemini API key format appears invalid. Keys should start with "AIza"');
    return {};
  }

  const trimmedKey = geminiApiKey.trim();
  
  // Force set environment variable - LangChain checks this first
  // This MUST happen before creating embedding models
  if (typeof process !== 'undefined') {
    process.env.GOOGLE_API_KEY = trimmedKey;
    process.env.GEMINI_API_KEY = trimmedKey;
  }

  try {
    const embeddingModels: Record<string, EmbeddingModel> = {};

    geminiEmbeddingModels.forEach((model) => {
      // Debug: Log to verify API key is being passed for embeddings too
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Gemini Embeddings] Creating model ${model.key} with API key: ${trimmedKey.substring(0, 10)}...`);
      }
      
      // Explicitly pass apiKey parameter AND ensure env var is set
      embeddingModels[model.key] = {
        displayName: model.displayName,
        model: new GoogleGenerativeAIEmbeddings({
          apiKey: trimmedKey,
          modelName: model.key,
        }) as unknown as Embeddings,
      };
    });

    return embeddingModels;
  } catch (err) {
    console.error(`Error loading Gemini embeddings models: ${err}`);
    // Check if it's an API key error
    if (err instanceof Error && err.message.includes('API key')) {
      console.error('⚠️ Invalid Gemini API key. Please check your config.toml file and ensure you have a valid API key from https://makersuite.google.com/app/apikey');
    }
    return {};
  }
};
