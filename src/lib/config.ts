import toml from '@iarna/toml';

// Import error handler for unhandled promise rejections
if (typeof window === 'undefined') {
  // Only load on server-side
  require('./utils/errorHandler');
}

// Use dynamic imports for Node.js modules to prevent client-side errors
let fs: any;
let path: any;
if (typeof window === 'undefined') {
  // We're on the server
  fs = require('fs');
  path = require('path');
  
  // CRITICAL: Set Gemini API key as environment variable IMMEDIATELY
  // This must happen before ANY LangChain modules are imported
  // LangChain checks GOOGLE_API_KEY environment variable first
  try {
    const configContent = fs.readFileSync(path.join(process.cwd(), 'config.toml'), 'utf-8');
    const config = toml.parse(configContent) as any;
    const geminiApiKey = config?.MODELS?.GEMINI?.API_KEY;
    if (geminiApiKey && geminiApiKey.trim() && geminiApiKey.startsWith('AIza')) {
      process.env.GOOGLE_API_KEY = geminiApiKey.trim();
      process.env.GEMINI_API_KEY = geminiApiKey.trim();
    }
  } catch (err) {
    // Config file might not exist yet, that's okay
  }
}

const configFileName = 'config.toml';

interface Config {
  GENERAL: {
    SIMILARITY_MEASURE: string;
    KEEP_ALIVE: string;
  };
  MODELS: {
    OPENAI: {
      API_KEY: string;
    };
    GROQ: {
      API_KEY: string;
    };
    ANTHROPIC: {
      API_KEY: string;
    };
    GEMINI: {
      API_KEY: string;
    };
    OLLAMA: {
      API_URL: string;
    };
    DEEPSEEK: {
      API_KEY: string;
    };
    AIMLAPI: {
      API_KEY: string;
    };
    LM_STUDIO: {
      API_URL: string;
    };
    CUSTOM_OPENAI: {
      API_URL: string;
      API_KEY: string;
      MODEL_NAME: string;
    };
  };
  API_ENDPOINTS: {
    SEARXNG: string;
  };
}

type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>;
};

const loadConfig = () => {
  // Server-side only
  if (typeof window === 'undefined') {
    try {
      return toml.parse(
        fs.readFileSync(path.join(process.cwd(), `${configFileName}`), 'utf-8'),
      ) as any as Config;
    } catch (err) {
      // If config.toml doesn't exist (e.g., on Railway), return empty config
      // Environment variables will be used instead
      console.log('[CONFIG] config.toml not found, using environment variables');
      return {} as Config;
    }
  }

  // Client-side fallback - settings will be loaded via API
  return {} as Config;
};

export const getSimilarityMeasure = () =>
  process.env.SIMILARITY_MEASURE || loadConfig().GENERAL?.SIMILARITY_MEASURE || 'cosine';

export const getKeepAlive = () => 
  process.env.KEEP_ALIVE || loadConfig().GENERAL?.KEEP_ALIVE || '5m';

export const getOpenaiApiKey = () => 
  process.env.OPENAI_API_KEY || loadConfig().MODELS?.OPENAI?.API_KEY || '';

export const getGroqApiKey = () => 
  process.env.GROQ_API_KEY || loadConfig().MODELS?.GROQ?.API_KEY || '';

export const getAnthropicApiKey = () => 
  process.env.ANTHROPIC_API_KEY || loadConfig().MODELS?.ANTHROPIC?.API_KEY || '';

export const getGeminiApiKey = () => {
  const apiKey = process.env.GEMINI_API_KEY || loadConfig().MODELS?.GEMINI?.API_KEY || '';
  
  // ALWAYS set environment variable when API key is retrieved
  // LangChain checks GOOGLE_API_KEY environment variable FIRST before using apiKey parameter
  // This must be set unconditionally to ensure LangChain can find it
  if (typeof process !== 'undefined' && apiKey && apiKey.trim()) {
    process.env.GOOGLE_API_KEY = apiKey.trim();
    // Also set GEMINI_API_KEY as some versions might check this
    process.env.GEMINI_API_KEY = apiKey.trim();
  }
  
  return apiKey;
};

export const getSearxngApiEndpoint = () =>
  process.env.SEARXNG_API_URL || loadConfig().API_ENDPOINTS?.SEARXNG || '';

export const getOllamaApiEndpoint = () => 
  process.env.OLLAMA_API_URL || loadConfig().MODELS?.OLLAMA?.API_URL || '';

export const getDeepseekApiKey = () => 
  process.env.DEEPSEEK_API_KEY || loadConfig().MODELS?.DEEPSEEK?.API_KEY || '';

export const getAimlApiKey = () => 
  process.env.AIMLAPI_API_KEY || loadConfig().MODELS?.AIMLAPI?.API_KEY || '';

export const getCustomOpenaiApiKey = () =>
  process.env.CUSTOM_OPENAI_API_KEY || loadConfig().MODELS?.CUSTOM_OPENAI?.API_KEY || '';

export const getCustomOpenaiApiUrl = () =>
  process.env.CUSTOM_OPENAI_API_URL || loadConfig().MODELS?.CUSTOM_OPENAI?.API_URL || '';

export const getCustomOpenaiModelName = () =>
  process.env.CUSTOM_OPENAI_MODEL_NAME || loadConfig().MODELS?.CUSTOM_OPENAI?.MODEL_NAME || '';

export const getLMStudioApiEndpoint = () =>
  process.env.LM_STUDIO_API_URL || loadConfig().MODELS?.LM_STUDIO?.API_URL || '';

const mergeConfigs = (current: any, update: any): any => {
  if (update === null || update === undefined) {
    return current;
  }

  if (typeof current !== 'object' || current === null) {
    return update;
  }

  const result = { ...current };

  for (const key in update) {
    if (Object.prototype.hasOwnProperty.call(update, key)) {
      const updateValue = update[key];

      if (
        typeof updateValue === 'object' &&
        updateValue !== null &&
        typeof result[key] === 'object' &&
        result[key] !== null
      ) {
        result[key] = mergeConfigs(result[key], updateValue);
      } else if (updateValue !== undefined) {
        result[key] = updateValue;
      }
    }
  }

  return result;
};

export const updateConfig = (config: RecursivePartial<Config>) => {
  // Server-side only
  if (typeof window === 'undefined') {
    const currentConfig = loadConfig();
    const mergedConfig = mergeConfigs(currentConfig, config);
    fs.writeFileSync(
      path.join(path.join(process.cwd(), `${configFileName}`)),
      toml.stringify(mergedConfig),
    );
  }
};
