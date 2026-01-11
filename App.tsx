
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { sendMessageToEve, startChatWithHistory, generateVisualSelfie, EveResponse } from './services/geminiService';
import { 
    saveSession, loadSession, clearSession, 
    loadApiKeys, saveApiKeys, loadActiveKeyId, saveActiveKeyId, 
    loadGradioEndpoint, saveGradioEndpoint,
    loadGenerationSettings, saveGenerationSettings, GenerationSettingsDefaults,
    saveLanguage, loadLanguage
} from './services/storageService';
import { Message, ApiKeyDef, GenerationSettings, Language } from './types';
import ChatBubble from './components/ChatBubble';
import VisualAvatar from './components/VisualAvatar';

type KeyStatus = 'untested' | 'testing' | 'valid' | 'invalid';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [language, setLanguage] = useState<Language>(() => loadLanguage());
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isImageEvolutionMode, setIsImageEvolutionMode] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<'neutral' | 'happy' | 'cheeky' | 'angry' | 'smirking' | 'seductive'>('neutral');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [visualMemory, setVisualMemory] = useState<string>("");
  const [apiKeys, setApiKeys] = useState<ApiKeyDef[]>(() => loadApiKeys());
  const [activeKeyId, setActiveKeyId] = useState<string | null>(() => loadActiveKeyId());
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [gradioEndpoint, setGradioEndpoint] = useState<string | null>(() => loadGradioEndpoint());
  const [tempGradioEndpoint, setTempGradioEndpoint] = useState<string>(gradioEndpoint || '');
  const [genSettings, setGenSettings] = useState<GenerationSettings>(() => loadGenerationSettings());
  const [pendingLanguage, setPendingLanguage] = useState<Language | null>(null); 
  const [toast, setToast] = useState<{message: string, type: 'info' | 'error' | 'success'} | null>(null);
  const [keyStatuses, setKeyStatuses] = useState<Record<string, KeyStatus>>({});
  const [tokenCount, setTokenCount] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hydrationAttempted = useRef(false);

  useEffect(() => {
      const initialStatuses: Record<string, KeyStatus> = {};
      apiKeys.forEach(key => {
          initialStatuses[key.id] = 'untested';
      });
      setKeyStatuses(initialStatuses);
  }, [apiKeys]);

  useEffect(() => {
    if (isLoaded && messages.length > 1) {
        // Estimate token count locally to avoid API calls.
        // Rule of thumb: 1 token ~= 4 characters.
        const totalChars = messages.reduce((acc, msg) => acc + (msg.text?.length || 0), 0);
        const estimatedTokens = Math.round(totalChars / 4);
        setTokenCount(estimatedTokens);
    } else {
        setTokenCount(0);
    }
  }, [messages, isLoaded]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, attachment, isLoaded]);

  useEffect(() => {
    if (hydrationAttempted.current) return;
    hydrationAttempted.current = true;

    const hydrate = async () => {
      try {
        const session = await loadSession();
        const savedLanguage = loadLanguage();
        setLanguage(savedLanguage);
        let awayDurationString = "";
        
        if (session && session.messages.length > 0) {
          setMessages(session.messages);
          setLastSaved(new Date(session.lastUpdated));
          
          const diffMs = Date.now() - session.lastUpdated;
          const diffSec = Math.floor(diffMs / 1000);
          const diffMin = Math.floor(diffSec / 60);
          const diffHr = Math.floor(diffMin / 60);
          
          if (diffHr > 0) awayDurationString = `${diffHr} hours and ${diffMin % 60} minutes`;
          else if (diffMin > 0) awayDurationString = `${diffMin} minutes`;
          else if (diffSec > 10) awayDurationString = `${diffSec} seconds`;

          const activeKeyDef = apiKeys.find(k => k.id === activeKeyId);
          startChatWithHistory(session.messages, activeKeyDef?.key, genSettings, awayDurationString, savedLanguage);
        } else {
          setMessages([{ id: 'welcome', role: 'model', text: savedLanguage === 'manglish' ? `Hey, enthaanu വിശേഷം?` : `Hello World` }]);
          startChatWithHistory([], undefined, genSettings, undefined, savedLanguage);
        }
      } catch (e) {
        setMessages([{ id: 'welcome_error', role: 'model', text: `Fresh start.` }]);
      } finally {
        setIsLoaded(true);
      }
    };
    hydrate();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (messages.length > 0) {
      saveSession(messages).then(() => setLastSaved(new Date()));
    }
  }, [messages, isLoaded]);

  const showToast = (message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const initiateLanguageChange = (newLang: Language) => {
    if (newLang === language) return;
    if (messages.length <= 1) {
        performLanguageChange(newLang);
    } else {
        setPendingLanguage(newLang);
    }
  };

  const confirmLanguageChange = () => {
    if (pendingLanguage) {
        performLanguageChange(pendingLanguage);
        setPendingLanguage(null);
    }
  };

  const cancelLanguageChange = () => {
    setPendingLanguage(null);
  };

  const performLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    saveLanguage(newLang);
    const activeKeyDef = apiKeys.find(k => k.id === activeKeyId);

    // If it's a new chat (only the initial welcome message exists), just swap the message.
    if (messages.length <= 1) {
        const welcomeMessage = newLang === 'manglish' ? "Enthaanu... നമുക്ക് ഒന്നൂടെ തുടങ്ങാം." : "Okay, let's start over.";
        setMessages([{ id: 'reset', role: 'model', text: welcomeMessage }]);
        startChatWithHistory([], activeKeyDef?.key, genSettings, undefined, newLang);
    } else {
        // For an existing chat, re-initialize with current history but new language instructions.
        startChatWithHistory(messages, activeKeyDef?.key, genSettings, undefined, newLang);
        showToast(`Persona switched to ${newLang === 'english' ? 'English' : 'Manglish'}.`, 'success');
    }
    
    setVisualMemory(""); // Reset visual memory in both cases.
  };

  const handleClearHistory = () => {
    const activeKeyDef = apiKeys.find(k => k.id === activeKeyId);
    const welcomeMessage = language === 'manglish' ? "Namukku puthiyathayi thudangaam." : "Let's start a new chapter.";
    setMessages([{ id: 'fresh_start', role: 'model', text: welcomeMessage }]);
    startChatWithHistory([], activeKeyDef?.key, genSettings, undefined, language);
    setVisualMemory("");
    clearSession();
    setShowClearConfirm(false);
    showToast("Memory cleared. Fresh start!", 'success');
  };
  
  const handleAddKey = () => {
    if (!newKeyLabel.trim() || !newKeyValue.trim()) return;
    const newKey = { id: Date.now().toString(), label: newKeyLabel.trim(), key: newKeyValue.trim() };
    const updated = [...apiKeys, newKey];
    setApiKeys(updated);
    saveApiKeys(updated);
    setKeyStatuses(prev => ({...prev, [newKey.id]: 'untested' }));
    if (updated.length === 1) { setActiveKeyId(newKey.id); saveActiveKeyId(newKey.id); }
    setNewKeyLabel(''); setNewKeyValue('');
    showToast('API Key added. Don\'t forget to test it!', 'success');
  };

  const handleTestKey = async (keyId: string) => {
      const keyToTest = apiKeys.find(k => k.id === keyId);
      if (!keyToTest) return;

      setKeyStatuses(prev => ({ ...prev, [keyId]: 'testing' }));
      showToast(`Testing key: ${keyToTest.label}...`, 'info');

      try {
          const ai = new GoogleGenAI({ apiKey: keyToTest.key });
          // FIX: Simplified `contents` for a text-only prompt.
          await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: 'test'
          });
          setKeyStatuses(prev => ({ ...prev, [keyId]: 'valid' }));
          showToast(`Key "${keyToTest.label}" is valid!`, 'success');
      } catch (error) {
          console.error(`Key test failed for ${keyToTest.label}:`, error);
          setKeyStatuses(prev => ({ ...prev, [keyId]: 'invalid' }));
          showToast(`Key "${keyToTest.label}" failed. Check the key and project settings.`, 'error');
      }
  };

  const handleSaveGradio = () => {
    const trimmedUrl = tempGradioEndpoint.trim();
    saveGradioEndpoint(trimmedUrl);
    setGradioEndpoint(trimmedUrl);
    showToast('Gradio endpoint updated', 'success');
  };

  const handleGenSettingChange = (key: keyof GenerationSettings, value: number | boolean) => {
    const updated = { ...genSettings, [key]: value };
    setGenSettings(updated);
    saveGenerationSettings(updated);
  };
  
  const resetSetting = (key: keyof GenerationSettings) => {
    handleGenSettingChange(key, GenerationSettingsDefaults[key]);
  };
  
  const processMessageSending = async (
    userMsg: Message, 
    currentAttachment: string | null, 
    historySnapshot: Message[], 
    initialKeyId: string | null
  ) => {
    let keyIdToTry = initialKeyId;
    let attempts = 0;
    const totalKeys = apiKeys.length > 0 ? apiKeys.length : 1;

    while (attempts < totalKeys) {
        const activeKeyDef = apiKeys.find(k => k.id === keyIdToTry);
        const apiKeyToUse = activeKeyDef?.key;

        try {
            const response = await sendMessageToEve(
                userMsg.text, historySnapshot, currentAttachment || undefined, isImageEvolutionMode,
                apiKeyToUse, gradioEndpoint, genSettings, visualMemory, language
            );

            if (response.isError && response.errorType === 'QUOTA_EXCEEDED' && apiKeys.length > 1) {
                const currentIndex = apiKeys.findIndex(k => k.id === keyIdToTry);
                const nextIndex = (currentIndex !== -1 ? currentIndex + 1 : 0) % apiKeys.length;
                const nextKey = apiKeys[nextIndex];

                if (nextKey.id === initialKeyId && attempts > 0) {
                  // We've looped through all keys and are back at the start
                  setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'model', text: "All available API keys have exceeded their quota.", isError: true }]);
                  return; // Exit function, all keys failed
                }
                
                console.log(`[Quota] Switching key from ${activeKeyDef?.label || 'Default'} to ${nextKey.label}`);
                showToast(`Quota exceeded. Trying key: ${nextKey.label}`, 'info');

                setActiveKeyId(nextKey.id);
                saveActiveKeyId(nextKey.id);
                keyIdToTry = nextKey.id;
                attempts++;
                continue; // Continue to the next iteration of the while loop
            }

            // Handle success, non-quota error, or single-key quota error
            if (response.isError) {
                setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'model', text: response.text, isError: true }]);
            } else {
                const messageId = Date.now().toString();
                setMessages((prev) => [...prev, { id: messageId, role: 'model', text: response.text, image: response.image, isImageLoading: !!response.visualPrompt }]);
                if (response.enhancedPrompt) setVisualMemory(response.enhancedPrompt);
                
                if (response.visualPrompt) {
                    const latestKeyId = loadActiveKeyId(); 
                    const latestKeyDef = apiKeys.find(k => k.id === latestKeyId);
                    generateVisualSelfie(
                      response.visualPrompt, latestKeyDef?.key, gradioEndpoint, genSettings, 
                      visualMemory, response.visualType || 'scene'
                    )
                    .then((result) => {
                        if (result?.imageUrl) {
                            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, image: result.imageUrl, isImageLoading: false } : m));
                            if (result.enhancedPrompt) setVisualMemory(result.enhancedPrompt);
                        } else {
                            setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isImageLoading: false } : m));
                        }
                    }).catch(() => setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isImageLoading: false } : m)));
                }
            }
            return; // Exit the function successfully or after a non-quota error

        } catch (error) {
            setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'model', text: "Signal lost.", isError: true }]);
            return; // Exit on critical error
        }
    }

    // If the loop finishes, it means all keys failed with quota errors.
    if (attempts >= totalKeys) {
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: 'model', text: "All available API keys have exceeded their quota. Please add a new key or check your billing.", isError: true }]);
    }
  };

  const handleSendMessage = async () => {
    if ((!inputText.trim() && !attachment) || isThinking) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: inputText, image: attachment || undefined };
    setMessages((prev) => [...prev, userMsg]);
    const currentAttachment = attachment;
    const historySnapshot = [...messages, userMsg];
    setInputText(''); setAttachment(null); setIsThinking(true); setCurrentEmotion('neutral');
    await processMessageSending(userMsg, currentAttachment, historySnapshot, activeKeyId);
    setIsThinking(false); 
    setIsImageEvolutionMode(false);
  };
  
  const SettingsSlider = ({ label, value, min, max, step, settingKey }: { label: string; value: number; min: number; max: number; step: number; settingKey: keyof GenerationSettings; }) => (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-slate-200 bg-indigo-600 px-3 py-1 rounded-md shadow-sm">{label}</label>
        <div className="flex items-center gap-2 bg-slate-800 rounded-md px-2 border border-slate-700">
          <input
            type="number"
            step={step}
            value={value}
            onChange={(e) => handleGenSettingChange(settingKey, parseFloat(e.target.value))}
            className="w-16 bg-transparent text-slate-200 text-sm text-center focus:outline-none"
          />
          <button onClick={() => resetSetting(settingKey)} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => handleGenSettingChange(settingKey, parseFloat(e.target.value))}
        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
    </div>
  );

  const KeyStatusIndicator: React.FC<{status: KeyStatus}> = ({status}) => {
    const statusMap = {
      untested: { text: 'Untested', color: 'text-slate-500' },
      testing: { text: 'Testing...', color: 'text-amber-500 animate-pulse' },
      valid: { text: 'Valid', color: 'text-emerald-500' },
      invalid: { text: 'Invalid', color: 'text-red-500' },
    };
    return <span className={`text-xs font-medium ${statusMap[status].color}`}>{statusMap[status].text}</span>;
  };

  const getTokenCountColor = () => {
    if (tokenCount > 12000) return 'text-red-500';
    if (tokenCount > 8000) return 'text-amber-500';
    return 'text-slate-300';
  };

  const SidebarContent = () => (
    <>
      <div className="bg-slate-900 rounded-lg p-1 border border-slate-800 flex relative mb-6">
        <button 
            onClick={() => initiateLanguageChange('english')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-300 z-10 ${language === 'english' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
        >
            English
        </button>
        <button 
            onClick={() => initiateLanguageChange('manglish')}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-300 z-10 ${language === 'manglish' ? 'bg-fuchsia-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
        >
            Manglish
        </button>
      </div>

       <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        <details className="bg-slate-900/50 rounded-lg border border-slate-800 text-sm">
          <summary className="p-4 font-medium cursor-pointer">Session Info</summary>
          <div className="p-4 border-t border-slate-800 space-y-4">
              <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-slate-400">Memory Usage</span>
                  <span className={`font-mono font-bold ${getTokenCountColor()}`}>{tokenCount.toLocaleString()} tokens</span>
              </div>
              <button 
                  onClick={() => setShowClearConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 text-xs font-semibold py-2 bg-red-900/50 text-red-300 border border-red-500/30 rounded-lg hover:bg-red-800/50 hover:text-red-200 transition-colors"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  Clear Memory
              </button>
          </div>
        </details>
        
        <details className="bg-slate-900/50 rounded-lg p-4 border border-slate-800 space-y-6 text-sm" open>
          <summary className="font-medium cursor-pointer -m-4 p-4">Visual Generation</summary>
          <div className="pt-4 mt-4 border-t border-slate-800 space-y-6">
            <label className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors">
              <span className="font-medium text-slate-200">AI Image Generation</span>
              <div className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={genSettings.aiImageGeneration}
                  onChange={(e) => handleGenSettingChange('aiImageGeneration', e.target.checked)}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-focus:ring-2 peer-focus:ring-indigo-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors">
              <input
                type="checkbox"
                checked={genSettings.useMagic}
                onChange={(e) => handleGenSettingChange('useMagic', e.target.checked)}
                className="w-5 h-5 text-indigo-500 bg-slate-700 border-slate-600 rounded focus:ring-indigo-500 accent-indigo-500"
              />
              <span className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-500">✨ Realism Magic</span>
            </label>
            <SettingsSlider label="Likeness Strength" value={genSettings.ipAdapterStrength} min={0} max={1} step={0.05} settingKey="ipAdapterStrength" />
            <SettingsSlider label="Guidance" value={genSettings.guidance} min={1} max={15} step={0.01} settingKey="guidance" />
            <SettingsSlider label="Steps" value={genSettings.steps} min={10} max={50} step={1} settingKey="steps" />
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-200 bg-indigo-600 px-3 py-1 rounded-md shadow-sm">Seed</label>
              <input type="number" disabled={genSettings.randomizeSeed} value={genSettings.seed} onChange={(e) => handleGenSettingChange('seed', parseInt(e.target.value, 10))} className="w-full bg-slate-800 rounded-md p-2 border border-slate-700 focus:outline-none focus:border-indigo-500 disabled:opacity-50" />
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={genSettings.randomizeSeed} onChange={(e) => handleGenSettingChange('randomizeSeed', e.target.checked)} className="w-4 h-4 text-indigo-600 bg-slate-700 border-slate-600 rounded focus:ring-indigo-500" />
                Randomize
              </label>
            </div>
          </div>
        </details>

        <details className="bg-slate-900/50 rounded-lg border border-slate-800 text-sm" open>
            <summary className="p-4 font-medium cursor-pointer">Connections</summary>
            <div className="p-4 border-t border-slate-800 space-y-6">
                <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-300">Gradio Endpoint</label>
                    <div className="flex items-center gap-2">
                        <input type="text" placeholder="Paste your Gradio URL here" value={tempGradioEndpoint} onChange={(e) => setTempGradioEndpoint(e.target.value)} className="flex-1 bg-slate-800 rounded-md p-2 border border-slate-700 focus:outline-none focus:border-indigo-500 text-xs" />
                        <button onClick={handleSaveGradio} className="bg-indigo-600 text-white px-3 py-2 rounded-md text-xs font-bold hover:bg-indigo-700">Save</button>
                    </div>
                    <p className="text-xs text-slate-500">Status: <span className={gradioEndpoint ? 'text-emerald-500' : 'text-amber-500'}>{gradioEndpoint ? 'Set' : 'Not Set'}</span></p>
                </div>
                <div className="space-y-3 pt-4 border-t border-slate-700/50">
                    <label className="text-xs font-medium text-slate-300">Gemini API Keys</label>
                    
                    {activeKeyId && apiKeys.find(k => k.id === activeKeyId) && (
                        <div className="mb-2 p-2 bg-indigo-900/30 border border-indigo-500/30 rounded text-xs flex items-center justify-between">
                            <span className="text-indigo-300 font-medium flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              Connected: {apiKeys.find(k => k.id === activeKeyId)?.label}
                            </span>
                            <span className="font-mono text-slate-500">************</span>
                        </div>
                    )}

                    {apiKeys.map(k => (
                        <div key={k.id} className={`grid grid-cols-[1fr,auto,auto] items-center gap-2 p-1.5 rounded text-xs transition-colors ${activeKeyId === k.id ? 'bg-slate-700 border border-fuchsia-500/30' : 'bg-slate-800/50'}`}>
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => {setActiveKeyId(k.id); saveActiveKeyId(k.id);}}>
                                <div className={`w-2 h-2 rounded-full ${activeKeyId === k.id ? 'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.5)]' : 'bg-slate-600'}`}></div>
                                <span className="truncate">{k.label}</span>
                            </div>
                            <KeyStatusIndicator status={keyStatuses[k.id] || 'untested'} />
                            <button onClick={() => handleTestKey(k.id)} disabled={keyStatuses[k.id] === 'testing'} className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded disabled:opacity-50">
                                Test
                            </button>
                        </div>
                    ))}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <input type="text" placeholder="New Key Label" value={newKeyLabel} onChange={e=>setNewKeyLabel(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"/>
                      <input type="password" placeholder="New Key Value" value={newKeyValue} onChange={e=>setNewKeyValue(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"/>
                      <button onClick={handleAddKey} className="w-full bg-slate-700 py-1 text-xs rounded hover:bg-slate-600">+</button>
                    </div>
                </div>
            </div>
        </details>
        
        <details className="bg-slate-900/50 rounded-lg border border-slate-800 text-sm">
            <summary className="p-4 font-medium cursor-pointer">Chat Parameters</summary>
            <div className="p-4 border-t border-slate-800 space-y-4">
              <SettingsSlider label="Temperature" value={genSettings.temperature} min={0} max={2} step={0.05} settingKey="temperature" />
              <SettingsSlider label="Top-P" value={genSettings.topP} min={0} max={1} step={0.01} settingKey="topP" />
              <SettingsSlider label="Top-K" value={genSettings.topK} min={1} max={100} step={1} settingKey="topK" />
            </div>
        </details>
      </div>
    </>
  );

  if (!isLoaded) return <div className="h-screen w-full bg-[#0a0510] flex items-center justify-center text-slate-500 animate-pulse">BOOTING EVE...</div>;

  return (
    <div className="relative flex flex-col md:flex-row h-[100dvh] w-full bg-[#0a0510] text-slate-200 overflow-hidden" style={{backgroundColor: '#202123'}}>
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <img src="https://res.cloudinary.com/dy57jxan6/image/upload/v1767379881/nano-canvas-1767379657904_u94i4b.png" className="w-full h-full object-cover blur-[2px] opacity-20" alt="Background" />
          <div className="absolute inset-0 bg-black/20"></div>
      </div>

      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[80] px-6 py-3 rounded-full shadow-2xl border flex items-center gap-3 animate-fade-in ${
            toast.type === 'error' ? 'bg-red-900/90 border-red-500 text-white' : 
            toast.type === 'success' ? 'bg-emerald-900/90 border-emerald-500 text-white' : 
            'bg-indigo-900/90 border-indigo-500 text-white'
        }`}>
            {toast.type === 'error' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            )}
            <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {pendingLanguage && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
                <h3 className="text-lg font-bold mb-2 text-white">Switch Persona?</h3>
                <p className="text-slate-400 text-sm mb-6">Eve's persona will switch to {pendingLanguage === 'english' ? 'English' : 'Manglish'}. The conversation history will be preserved.</p>
                <div className="flex gap-3">
                    <button onClick={cancelLanguageChange} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors text-sm font-medium">Cancel</button>
                    <button onClick={confirmLanguageChange} className="flex-1 py-2 rounded-lg bg-fuchsia-600 text-white hover:bg-fuchsia-500 transition-colors text-sm font-medium shadow-lg shadow-fuchsia-500/20">Confirm Switch</button>
                </div>
            </div>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full shadow-2xl animate-fade-in">
                <h3 className="text-lg font-bold mb-2 text-red-400">Clear Memory?</h3>
                <p className="text-slate-400 text-sm mb-6">This will permanently delete the current conversation history and start a new session. This cannot be undone.</p>
                <div className="flex gap-3">
                    <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors text-sm font-medium">Cancel</button>
                    <button onClick={handleClearHistory} className="flex-1 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors text-sm font-medium shadow-lg shadow-red-500/20">Confirm & Clear</button>
                </div>
            </div>
        </div>
      )}

      {previewImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewImage(null)}
        >
          <button 
            className="absolute top-4 right-4 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full transition-all border border-slate-700/50 hover:border-fuchsia-500/50 z-50 group"
            onClick={() => setPreviewImage(null)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img 
            src={previewImage} 
            alt="Full Preview" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl border border-slate-800"
            onClick={(e) => e.stopPropagation()} 
          />
        </div>
      )}

      <div className="fixed top-0 left-0 w-full h-16 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 z-50 flex items-center justify-between px-4 md:hidden">
        <h1 className="text-sm font-serif font-bold">EVE <span className="text-fuchsia-500 text-[10px]">v2.0</span></h1>
        <div className="absolute left-1/2 -translate-x-1/2 top-4"><VisualAvatar isThinking={isThinking} emotion={currentEmotion}/></div>
        <button onClick={() => setMobileMenuOpen(true)} className="p-2"><svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg></button>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-950/95 backdrop-blur-xl p-6 md:hidden animate-fade-in flex flex-col">
          <button onClick={() => setMobileMenuOpen(false)} className="self-end p-2 mb-8"><svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          <SidebarContent />
        </div>
      )}

      <div className="hidden md:flex md:w-80 md:flex-col md:border-r md:border-slate-800 md:p-8 bg-slate-900/90 backdrop-blur-xl z-40">
        <div className="flex flex-col items-center gap-6"><VisualAvatar isThinking={isThinking} emotion={currentEmotion}/><h1 className="text-xl font-serif font-bold">EVE <span className="text-fuchsia-500 text-xs">v2.0</span></h1></div>
        <div className="mt-8 flex-1 flex flex-col gap-6"><SidebarContent /></div>
      </div>

      <div className="flex-1 flex flex-col relative pt-16 md:pt-0 overflow-hidden z-10">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth">
          {messages.map((msg) => (
            <div key={msg.id} className="relative group">
              <ChatBubble message={msg} onImageClick={setPreviewImage}/>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="relative p-4 md:p-8 border-t border-slate-800 bg-slate-900/90 backdrop-blur-xl z-30">
          <div className="flex items-end gap-3 md:gap-4">
            <textarea value={inputText} onChange={e=>setInputText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); handleSendMessage();}}} placeholder={isThinking ? "EVE is thinking..." : "Ask EVE anything..."} className="flex-1 bg-slate-800/50 border border-slate-700 rounded-2xl p-3 text-sm focus:outline-none focus:border-fuchsia-500/50 resize-none max-h-40" rows={1} disabled={isThinking}/>
            <button onClick={handleSendMessage} className={`p-3 rounded-full text-white transition-all ${(!inputText.trim() && !attachment) || isThinking ? 'bg-slate-800 text-slate-500' : 'bg-gradient-to-r from-fuchsia-600 to-purple-600 shadow-lg shadow-fuchsia-500/20'}`} disabled={(!inputText.trim() && !attachment) || isThinking}>
              {isThinking ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <svg className="h-7 w-7 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
