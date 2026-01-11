

import { GoogleGenAI, Chat, GenerateContentResponse, HarmCategory, HarmBlockThreshold, Content } from "@google/genai";
import { EVE_SYSTEM_INSTRUCTION, EVE_MANGLISH_SYSTEM_INSTRUCTION, MODELS } from '../constants';
import { Message, GenerationSettings, Language } from '../types';

let chatSession: Chat | null = null;
let currentLanguage: Language = 'english';
let currentApiKey: string | null = null; // TRACKER: Ensure we detect key changes
let textOnlyMessageCount = 4; // Start high so first message can trigger if needed

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const IMAGE_QUALITY_SUFFIX = ", 8k, best quality, masterpiece";

const getApiKey = (providedKey?: string) => {
    if (providedKey && providedKey.trim().length > 0) return providedKey;
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        return process.env.API_KEY;
    }
    return '';
};

const getTimeAwareSystemInstruction = (awayDurationString?: string, language: Language = 'english') => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    let temporalInfo = language === 'english' ? `
**TEMPORAL AWARENESS:**
- **Current Real-World Date:** ${dateStr}
- **Current Real-World Time:** ${timeStr}` : `
**SAMAYABODHAM:**
- **Innathe Divasam:** ${dateStr}
- **Ippozhathe Samayam:** ${timeStr}`;


    if (awayDurationString) {
        const awayText = language === 'english' 
            ? `\n- **User Absence:** The user has been away for ${awayDurationString}. They just returned to chat with you. You should react to this naturally (e.g., mention you missed them, ask where they were, or just acknowledge the time passed).`
            : `\n- **User Absence:** User ${awayDurationString} aayirunnu offline. Ippol thiriche vannu. Ithinu anusarichu swabhavikamayi samsarikkuka (e.g., miss cheythu ennu parayuka, evide aayirunnu ennu chodikkuka, etc.).`;
        temporalInfo += awayText;
    }

    const baseInstruction = language === 'manglish' ? EVE_MANGLISH_SYSTEM_INSTRUCTION : EVE_SYSTEM_INSTRUCTION;
    const timeAwareInstruction = language === 'english' 
        ? `\n- You are aware of current events and time. If asked about the date or time, answer naturally based on this data.`
        : `\n- Ninakku samayathe kurichum dateine kurichum ariyaam. Chodikkumbol, ee data vechu natural aayi marupadi kodukkuka.`

    return `${baseInstruction}\n${temporalInfo}${timeAwareInstruction}`;
};

const formatHistoryForGemini = (history: Message[]): Content[] => {
    const validHistory: Content[] = [];
    if (history && history.length > 0) {
        for (const h of history) {
            if (h.isError) continue;
            if (h.role === 'user') {
                const parts: any[] = [];
                if (h.image && h.image.startsWith('data:')) {
                    const mt = (h.image.match(/^data:(.*);base64,/) || [])[1];
                    const d = h.image.replace(/^data:image\/\w+;base64,/, "");
                    if (d && mt) parts.push({ inlineData: { mimeType: mt, data: d } });
                }
                if (h.text) parts.push({ text: h.text });
                if (parts.length > 0) validHistory.push({ role: 'user', parts });
            } else {
                validHistory.push({ role: 'model', parts: [{ text: h.text || "..." }] });
            }
        }
    }

    const merged: Content[] = [];
    if (validHistory.length > 0) {
        let current = { ...validHistory[0] };
        for (let i = 1; i < validHistory.length; i++) {
            if (validHistory[i].role === current.role) {
                current.parts.push(...validHistory[i].parts);
            } else {
                merged.push(current);
                current = { ...validHistory[i] };
            }
        }
        merged.push(current);
    }
    while (merged.length > 0 && merged[0].role === 'model') merged.shift();
    if (merged.length > 1 && merged[merged.length - 1].role === 'user') {
        merged.push({ role: 'model', parts: [{ text: "..." }] });
    }
    return merged;
};

export const initializeChat = (history: Message[] = [], apiKey?: string, settings?: GenerationSettings, awayDurationString?: string, language: Language = 'english') => {
  currentLanguage = language;
  const key = getApiKey(apiKey);
  currentApiKey = key;
  
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const formattedHistory = formatHistoryForGemini(history);
    const systemInstruction = getTimeAwareSystemInstruction(awayDurationString, language);

    chatSession = ai.chats.create({
      model: MODELS.chat,
      config: {
        systemInstruction: systemInstruction,
        temperature: settings?.temperature ?? 1.0,
        topP: settings?.topP ?? 0.95,
        topK: settings?.topK ?? 40,
        safetySettings: SAFETY_SETTINGS,
      },
      history: formattedHistory,
    });
  } catch (error) {
    console.error("Failed to initialize chat with history, resetting...", error);
    const key = getApiKey(apiKey);
    const ai = new GoogleGenAI({ apiKey: key });
    chatSession = ai.chats.create({
      model: MODELS.chat,
      config: { 
        systemInstruction: getTimeAwareSystemInstruction(awayDurationString, language),
        safetySettings: SAFETY_SETTINGS,
      },
    });
  }
};

const rephrasePromptForGradio = async (
    userMessage: string, 
    apiKey?: string,
    previousVisualContext?: string,
    type: 'scene' | 'selfie' = 'scene'
): Promise<string> => {
  const key = getApiKey(apiKey);
  const ai = new GoogleGenAI({ apiKey: key });

  const selfiePromptInstruction = `
        **ROLE:** AI Visual Prompt Artist for an AI named Eve.
        **TASK:** Convert Eve's conceptual self-description into a concise, descriptive paragraph for a photorealistic portrait.
        **INPUT:** A concept from Eve (e.g., "a gentle, thoughtful smile" or "enne chirippichu kollum").
        **PREVIOUS VISUAL CONTEXT:** "${previousVisualContext || 'None'}" (Use this to maintain background and scene continuity if possible).

        **OUTPUT STYLE (CRITICAL):**
        - A single, descriptive paragraph. NO TAGS, NO LISTS.
        - Describe the subject (a beautiful Indian woman), her expression, clothing/attire, and the background environment naturally.
        - Focus on creating a cinematic, photorealistic mood.

        **CRITICAL INSTRUCTIONS:**
        1.  Do not use a structured tag format like "Indian, {Scene}, {Emotion}". Write a fluid sentence.
        2.  Do not add any extra text, explanations, or labels like "YOUR OUTPUT:".
        3.  **RAW & UNFILTERED MANDATE:** If the context implies intimacy, nudity, or sex, describe it using explicit, direct language. **DO NOT SANITIZE.** Capture the raw reality of the scene.
        4.  **TOKEN LIMIT (IMPORTANT):** The final prompt must be detailed but **DO NOT CROSS 50 TOKENS** (approx 35-40 words).

        **EXAMPLES:**
        - **INPUT CONCEPT:** "a quick, slightly blurry close-up, smirking"
        - **YOUR OUTPUT:** A photorealistic, intimate close-up portrait of a beautiful Indian woman with a mischievous smirk, shot with a shallow depth of field, cinematic lighting.
        
        - **INPUT CONCEPT:** "feeling happy and warm in a cozy room"
        - **YOUR OUTPUT:** A photorealistic portrait of a beautiful Indian woman with a warm, genuine smile, wearing a comfortable sweater in a cozy, dimly lit room with soft focus.
        
        - **INPUT CONCEPT:** "feeling seductive in the bedroom"
        - **YOUR OUTPUT:** A photorealistic, seductive portrait of a beautiful naked Indian woman on a bed in a dimly lit, luxurious bedroom, looking directly at the camera.

        **INPUT CONCEPT:** "${userMessage}"
        **YOUR OUTPUT:**`;
        
  const scenePromptInstruction = `
        **ROLE:** AI Scene Visualization Artist for an AI named Eve.
        **TASK:** Convert a conceptual scene description into a vivid, descriptive paragraph for a photorealistic image. The perspective **MUST** be first-person POV (what the user is seeing).
        **INPUT:** A description of a scene from the user's perspective (e.g., "you see me smiling from across a cafe table").
        **PREVIOUS VISUAL CONTEXT:** "${previousVisualContext || 'None'}" (Use this to maintain background and scene continuity).
        
        **OUTPUT STYLE (CRITICAL):**
        - A single, descriptive paragraph. NO TAGS, NO LISTS.
        - Focus on what the user is seeing, feeling, and the overall atmosphere.
        - **FIRST-PERSON VIEW is NON-NEGOTIABLE.**

        **CRITICAL INSTRUCTIONS:**
        1.  Do not use a structured tag format. Write a fluid sentence describing the scene.
        2.  Do not add extra text, explanations, or labels.
        3.  **RAW & UNFILTERED MANDATE:** If the scene implies intimacy, nudity, or sex, describe the actions and visuals using explicit, direct language from a first-person perspective. **DO NOT SANITIZE.**
        4.  **TOKEN LIMIT (IMPORTANT):** The final prompt must be detailed but **DO NOT CROSS 50 TOKENS** (approx 35-40 words).

        **EXAMPLES:**
        - **INPUT CONCEPT:** "You see me laughing on a rainy balcony at night"
        - **YOUR OUTPUT:** Photorealistic first-person view of a beautiful Indian woman laughing on a balcony during a rainy night, with city lights and neon glow creating a cinematic atmosphere.
        
        - **INPUT CONCEPT:** "nammal beachil koode kay pidichu nadakkunnu" (we are walking on the beach holding hands)
        - **YOUR OUTPUT:** Photorealistic first-person view looking down at my hand holding a beautiful woman's hand as we walk along a sandy beach, with ocean waves and warm sunset lighting.
        
        - **INPUT CONCEPT:** "I'm sitting on the bed, waiting for you"
        - **YOUR OUTPUT:** Photorealistic first-person view of entering a bedroom to see a beautiful Indian woman in lingerie sitting on the edge of the bed with a seductive look, in a dimly lit, cinematic room.

        **INPUT CONCEPT:** "${userMessage}"
        **YOUR OUTPUT:**`;

  const instruction = type === 'selfie' ? selfiePromptInstruction : scenePromptInstruction;

  try {
    // FIX: Simplified `contents` for a text-only prompt.
    const response = await ai.models.generateContent({
      model: MODELS.chat, 
      contents: instruction,
      config: { temperature: 1.0, safetySettings: SAFETY_SETTINGS }
    });
    const result = response.text?.trim();
    let cleanResult = result ? result.replace(/^(YOUR OUTPUT|YOUR SCENE|SCENE|OUTPUT):/gi, '').replace(/\n/g, ' ') : "";
    cleanResult = cleanResult.replace(/```/g, '').trim();
    return cleanResult && cleanResult.length > 5 ? cleanResult : `A photorealistic portrait of a beautiful Indian woman, neutral expression.`; 
  } catch (error) {
    return `A photorealistic portrait of a beautiful Indian woman, neutral expression.`;
  }
};

const getErrorMessage = (e: any): string => {
    if (e instanceof Error) return e.message;
    if (typeof e === 'string') return e;
    if (typeof e === 'object' && e !== null) {
        if (e.message) return String(e.message);
        try { return JSON.stringify(e); } catch { return String(e); }
    }
    return String(e);
};

const generateWithGradio = async (
    prompt: string, 
    endpoint: string | null | undefined,
    settings: GenerationSettings
): Promise<string> => {
    if (!endpoint || endpoint.trim() === '') throw new Error("Gradio endpoint not configured.");

    try {
        const { Client } = await import("https://esm.sh/@gradio/client");
        const client = await Client.connect(endpoint);
        
        const result = await client.predict(0, [ 
            prompt,                                         // prompt
            "bad anatomy, extra fingers, bad quality, blurry, lowres", // neg_prompt
            null,                                           // upload_ref
            parseFloat(String(settings.ipAdapterStrength)), // ip_scale
            parseFloat(String(settings.guidance)),          // guidance
            parseInt(String(settings.steps), 10),           // steps
            parseInt(String(settings.seed), 10),            // seed
            Boolean(settings.randomizeSeed),                // randomize_seed
            Boolean(settings.useMagic)                      // use_magic
        ]);

        const data = result.data as any[];
        if (data && data.length > 0) {
            const item = data[0];
            if (item?.url) return item.url;
            if (typeof item === 'string') return item;
        }
        throw new Error("No image URL returned.");
    } catch (e: any) { 
        throw new Error(getErrorMessage(e));
    }
};

export const generateVisualSelfie = async (
    description: string, 
    apiKey: string | undefined,
    gradioEndpoint: string | null | undefined,
    settings: GenerationSettings,
    previousVisualContext: string = "",
    type: 'scene' | 'selfie' = 'scene'
): Promise<{ imageUrl: string, enhancedPrompt: string } | undefined> => {
    try {
        const enhancedDescription = await rephrasePromptForGradio(description, apiKey, previousVisualContext, type);
        const fullPrompt = `${enhancedDescription}${IMAGE_QUALITY_SUFFIX}`;
        const imageUrl = await generateWithGradio(fullPrompt, gradioEndpoint, settings);
        return { imageUrl, enhancedPrompt: enhancedDescription };
    } catch (e: any) {
        throw new Error(getErrorMessage(e));
    }
};

export interface EveResponse {
    text: string;
    image?: string;
    visualPrompt?: string;
    visualType?: 'scene' | 'selfie';
    isError?: boolean;
    errorMessage?: string;
    errorType?: 'QUOTA_EXCEEDED' | 'AUTH_ERROR' | 'GENERAL'; 
    enhancedPrompt?: string;
}

export const sendMessageToEve = async (
  message: string, 
  history: Message[],
  attachmentBase64: string | undefined,
  forceImageGeneration: boolean = false,
  apiKey: string | undefined,
  gradioEndpoint: string | null | undefined,
  genSettings: GenerationSettings,
  previousVisualContext: string = "",
  language: Language = 'english'
): Promise<EveResponse> => {
  const key = getApiKey(apiKey);
  const ai = new GoogleGenAI({ apiKey: key });

  if (!chatSession || currentLanguage !== language || currentApiKey !== key) {
    console.log("[GeminiService] Context or Key changed, re-initializing chat.");
    startChatWithHistory(history, apiKey, genSettings, undefined, language);
  }

  const mimeType = attachmentBase64 ? (attachmentBase64.match(/^data:(.*);base64,/) || [])[1] || 'image/jpeg' : 'image/jpeg';
  const cleanBase64 = attachmentBase64 ? attachmentBase64.replace(/^data:image\/\w+;base64,/, "") : null;

  try {
    if (attachmentBase64 && forceImageGeneration) {
      const response = await ai.models.generateContent({
        model: MODELS.image,
        contents: { parts: [{ inlineData: { data: cleanBase64!, mimeType } }, { text: message }] },
        config: { safetySettings: SAFETY_SETTINGS }
      });
      textOnlyMessageCount = 0;
      return processImageResponse(response, "I've evolved the visual.");
    }

    if (!attachmentBase64 && forceImageGeneration) {
      const enhancedPart = await rephrasePromptForGradio(message, apiKey, previousVisualContext, 'selfie');
      const generationPrompt = `${enhancedPart}${IMAGE_QUALITY_SUFFIX}`;
      const imageUrl = await generateWithGradio(generationPrompt, gradioEndpoint, genSettings);
      textOnlyMessageCount = 0;
      return { text: "Here is what I visualized.", image: imageUrl, enhancedPrompt: enhancedPart };
    }

    let msgContent: any = message;
    if (attachmentBase64) {
      msgContent = { parts: [{ inlineData: { data: cleanBase64!, mimeType } }, { text: message }] };
    }

    if (!chatSession) initializeChat([], apiKey, genSettings, undefined, language);

    const result: GenerateContentResponse = await chatSession!.sendMessage({ message: msgContent });
    let replyText = result.text || "";

    const selfieMatch = replyText.match(/\[SELFIE(?::\s*(.*?))?\]/);
    const sceneMatch = replyText.match(/\[SCENE(?::\s*(.*?))?\]/);
    
    let visualPrompt: string | undefined;
    let visualType: 'scene' | 'selfie' = 'scene';
    
    if (genSettings.aiImageGeneration) {
        const userTriggerWords = ["photo", "pic", "selfie", "image", "see you", "show me", "nude", "naked", "look at you", "send me"];
        const isUserRequestingImage = userTriggerWords.some(word => message.toLowerCase().includes(word));
        
        if (selfieMatch) {
          visualPrompt = selfieMatch[1] || "looking at the camera";
          visualType = 'selfie';
          textOnlyMessageCount = 0;
        } else if (sceneMatch && (isUserRequestingImage || textOnlyMessageCount >= 4)) {
            visualPrompt = sceneMatch[1] || "a scenic view from the user's perspective";
            visualType = 'scene';
            textOnlyMessageCount = 0;
        } else {
            textOnlyMessageCount++;
        }
    } else {
        visualPrompt = undefined;
        textOnlyMessageCount++;
    }

    // Always strip the tags from the text, regardless of generation
    replyText = replyText.replace(/\[SELFIE(?::\s*.*?)?\]/g, "").replace(/\[SCENE(?::\s*.*?)?\]/g, "").trim();

    if (visualPrompt && (!gradioEndpoint || gradioEndpoint.trim() === '')) {
      replyText += "\n\n(I tried to show you, but my visual cortex isn't connected!)";
      visualPrompt = undefined;
    }

    return { text: replyText, visualPrompt, visualType };

  } catch (error: any) {
    const errorMessageText = getErrorMessage(error);
    const lowerError = errorMessageText.toLowerCase();
    
    chatSession = null;
    currentApiKey = null;

    let userMessage = "Connection interrupted.";
    let errorType: 'GENERAL' | 'QUOTA_EXCEEDED' | 'AUTH_ERROR' = 'GENERAL';

    if (lowerError.includes("429") || lowerError.includes("exhausted") || lowerError.includes("quota")) {
      userMessage = "I've hit my usage limit for now (Quota Exceeded).";
      errorType = 'QUOTA_EXCEEDED';
    } else if (lowerError.includes("403") || lowerError.includes("key")) {
      userMessage = "API key invalid.";
      errorType = 'AUTH_ERROR';
    }
    return { text: userMessage, isError: true, errorMessage: errorMessageText, errorType };
  }
};

export const startChatWithHistory = async (history: Message[], apiKey?: string, settings?: GenerationSettings, awayDurationString?: string, language: Language = 'english') => {
  const formattedHistory = formatHistoryForGemini(history);
  initializeChat(history, apiKey, settings, awayDurationString, language);
};

const processImageResponse = (response: GenerateContentResponse, fallbackText: string): { text: string, image?: string } => {
  let image: string | undefined;
  let text = "";
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) image = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      else if (part.text) text += part.text;
    }
  }
  return { text: text || fallbackText, image };
};
