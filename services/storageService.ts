
import { Message, ApiKeyDef, GenerationSettings, Language } from '../types';

const DB_NAME = 'EveVaultDB';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const GLOBAL_SESSION_KEY = 'global_session'; // Fixed key for the single session

const KEYS_STORAGE_KEY = 'eve_api_keys';
const ACTIVE_KEY_ID_STORAGE_KEY = 'eve_active_key_id';
const GRADIO_URL_STORAGE_KEY = 'eve_gradio_url';
const GEN_SETTINGS_STORAGE_KEY = 'eve_gen_settings';
const LANGUAGE_STORAGE_KEY = 'eve_language';

interface StoredSession {
  messages: Message[];
  lastUpdated: number;
}

// --- INDEXEDDB HELPERS ---

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    // console.log("[IDB] Opening Database connection...");
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event: Event) => {
      const req = event.target as IDBRequest;
      console.error("[IDB] IndexedDB open error:", req.error);
      reject(req.error);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        console.log("[IDB] Creating object store:", STORE_NAME);
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const saveSession = async (messages: Message[]) => {
  // console.log(`[IDB] Saving session (${messages.length} msgs)...`);
  let db: IDBDatabase | null = null;
  try {
    db = await initDB();
    const data = { id: GLOBAL_SESSION_KEY, messages, lastUpdated: Date.now() };
    
    return new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction([STORE_NAME], 'readwrite');
      
      transaction.oncomplete = () => {
        if (db) db.close();
        resolve();
      };
      
      transaction.onerror = (event: Event) => {
        const tx = event.target as IDBTransaction;
        console.error(`[IDB] Save transaction failed:`, tx.error);
        if (db) db.close();
        reject(tx.error);
      };

      const store = transaction.objectStore(STORE_NAME);
      store.put(data);
    });
  } catch (e) {
    console.error("[IDB] Failed to save session:", e);
    if (db) db.close();
    throw e;
  }
};

export const loadSession = async (): Promise<StoredSession | null> => {
  // console.log(`[IDB] Loading session...`);
  let db: IDBDatabase | null = null;
  try {
    db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db!.transaction([STORE_NAME], 'readonly');
      
      transaction.oncomplete = () => {
        if (db) db.close();
      };

      transaction.onerror = (event: Event) => {
        const tx = event.target as IDBTransaction;
        console.error(`[IDB] Load transaction failed:`, tx.error);
        if (db) db.close();
        reject(tx.error);
      };

      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(GLOBAL_SESSION_KEY);
      
      request.onsuccess = () => {
        const result = request.result;
        resolve(result as StoredSession);
      };
      
      request.onerror = (event: Event) => {
          const req = event.target as IDBRequest;
          console.error(`[IDB] Get request failed:`, req.error);
          resolve(null);
      };
    });
  } catch (e) {
    console.error("[IDB] Failed to load session:", e);
    if (db) db.close();
    return null;
  }
};

export const clearSession = async () => {
  console.log(`[IDB] Clearing session...`);
  let db: IDBDatabase | null = null;
  try {
    db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    
    transaction.oncomplete = () => {
        if (db) db.close();
        console.log("[IDB] Session cleared.");
    };
    
    transaction.onerror = (event: Event) => {
      const tx = event.target as IDBTransaction;
      console.error(`[IDB] Clear transaction failed:`, tx.error);
      if (db) db.close();
    };

    const store = transaction.objectStore(STORE_NAME);
    store.delete(GLOBAL_SESSION_KEY);
    
  } catch (e) {
    console.error("[IDB] Failed to clear session", e);
    if (db) db.close();
    throw e;
  }
};

export const restoreFromBackup = async (data: StoredSession): Promise<void> => {
  console.log("[IDB] Restoring session from backup.");
  await saveSession(data.messages);
};

// --- LANGUAGE PREFERENCE ---

export const saveLanguage = (language: Language) => {
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch (e) {
        console.error("[Storage] Failed to save language", e);
    }
};

export const loadLanguage = (): Language => {
    try {
        const lang = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (lang === 'english' || lang === 'manglish') {
            return lang;
        }
    } catch (e) {
        console.error("[Storage] Failed to load language", e);
    }
    return 'english'; // Default
};


// --- API KEY MANAGEMENT (LocalStorage) ---

export const saveApiKeys = (keys: ApiKeyDef[]) => {
  try {
    localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys));
  } catch (e) {
    console.error("[Storage] Failed to save API keys", e);
  }
};

export const loadApiKeys = (): ApiKeyDef[] => {
  try {
    const raw = localStorage.getItem(KEYS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

export const saveActiveKeyId = (id: string | null) => {
  if (id) {
    localStorage.setItem(ACTIVE_KEY_ID_STORAGE_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_KEY_ID_STORAGE_KEY);
  }
};

export const loadActiveKeyId = (): string | null => {
  return localStorage.getItem(ACTIVE_KEY_ID_STORAGE_KEY);
};

// --- GRADIO ENDPOINT STORAGE ---

export const saveGradioEndpoint = (url: string) => {
  try {
    localStorage.setItem(GRADIO_URL_STORAGE_KEY, url.trim()); 
  } catch (e) {
    console.error("[Storage] Failed to save Gradio endpoint", e);
  }
};

export const loadGradioEndpoint = (): string | null => {
  try {
    const url = localStorage.getItem(GRADIO_URL_STORAGE_KEY);
    return url === '' ? null : url;
  } catch (e) {
    return null;
  }
};

// --- GENERATION SETTINGS STORAGE ---

export const GenerationSettingsDefaults: GenerationSettings = {
    guidance: 7.0,
    steps: 30,
    ipAdapterStrength: 0.6,
    loraStrength: 0.45, // Not currently in UI, but kept for potential future use
    seed: 42,
    randomizeSeed: true,
    useMagic: true,
    aiImageGeneration: true, // NEW: Defaults to true
    temperature: 1.0,
    topP: 0.95,
    topK: 40
};

export const saveGenerationSettings = (settings: GenerationSettings) => {
    try {
        localStorage.setItem(GEN_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error("[Storage] Failed to save generation settings", e);
    }
};

export const loadGenerationSettings = (): GenerationSettings => {
    try {
        const raw = localStorage.getItem(GEN_SETTINGS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            // Merge saved settings with defaults to ensure all keys are present
            return { ...GenerationSettingsDefaults, ...parsed };
        }
    } catch (e) {
        console.error("[Storage] Failed to load generation settings", e);
    }
    return GenerationSettingsDefaults;
};