
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  image?: string; // Base64 string for images displayed in chat
  isError?: boolean;
  isImageLoading?: boolean;
}

export type Language = 'english' | 'manglish';

export interface EveConfig {
  voiceEnabled: boolean;
  personality: 'default' | 'bananafy';
}

export interface ApiKeyDef {
  id: string;
  label: string;
  key: string;
}

export interface GenerationSettings {
  // Image Gen Settings
  guidance: number;
  steps: number;
  ipAdapterStrength: number;
  loraStrength: number;
  seed: number;
  randomizeSeed: boolean;
  useMagic: boolean;
  aiImageGeneration: boolean; // NEW: AI image generation toggle
  // Chat Model Settings
  temperature: number;
  topP: number;
  topK: number;
}