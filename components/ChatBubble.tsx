
import React from 'react';
import { Message } from '../types';

interface ChatBubbleProps {
  message: Message;
  onImageClick?: (src: string) => void;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, onImageClick }) => {
  const isUser = message.role === 'user';
  const hasImage = !!message.image;
  const hasText = !!message.text;

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] md:max-w-[75%] p-4 rounded-2xl relative backdrop-blur-md shadow-lg border 
        ${
          isUser
            ? 'bg-slate-800/30 border-slate-700 text-slate-100 rounded-tr-sm'
            : 'bg-gradient-to-br from-purple-900/30 to-slate-900/30 border-fuchsia-500/30 text-slate-200 rounded-tl-sm'
        }`}
      >
        {/* Label */}
        <div className="text-xs font-bold uppercase tracking-widest mb-3 opacity-50 flex items-center gap-2">
           {isUser ? (
             <span className="text-slate-400">AK</span>
           ) : (
             <span className="text-fuchsia-400">EVE v2.0</span>
           )}
        </div>

        {/* Content Layout - Flex on Desktop if both image and text exist */}
        <div className={`flex flex-col ${(!isUser && (hasImage || message.isImageLoading) && hasText) ? 'lg:flex-row lg:gap-6 lg:items-start' : 'gap-4'}`}>
          
          {/* Image Content */}
          {(hasImage || message.isImageLoading) && (
            <div className={`${(!isUser && hasText) ? 'lg:w-1/2 lg:flex-shrink-0' : 'w-full'}`}>
              
              {message.isImageLoading ? (
                  <div className="w-full h-64 md:h-80 bg-slate-900/50 rounded-lg border border-slate-700/50 flex flex-col items-center justify-center animate-pulse">
                      <div className="w-8 h-8 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                      <span className="text-xs text-fuchsia-500/70 uppercase tracking-widest">Visualizing...</span>
                  </div>
              ) : (
                 <div className="rounded-lg overflow-hidden border border-slate-700/50 bg-black/20 group relative transition-transform hover:scale-[1.01] duration-300">
                    <img 
                      src={message.image} 
                      alt="Visual Content" 
                      className={`w-full h-auto object-cover max-h-96 ${onImageClick ? 'cursor-zoom-in' : ''}`}
                      onClick={() => onImageClick && message.image && onImageClick(message.image)}
                    />
                    
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none"></div>

                    <div className="px-3 py-2 bg-black/60 backdrop-blur-sm text-[10px] text-slate-300 flex justify-between absolute bottom-0 w-full">
                        <span className="font-mono opacity-70">{isUser ? 'UPLOAD' : 'GENERATION'}</span>
                        {!isUser && (
                          <a 
                            href={message.image} 
                            download={`eve_evolution_${message.id}.png`} 
                            className="hover:text-fuchsia-400 transition-colors font-bold tracking-wider pointer-events-auto flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            SAVE
                          </a>
                        )}
                    </div>
                </div>
              )}
            </div>
          )}

          {/* Text Content */}
          {hasText && (
            <div className={`leading-relaxed whitespace-pre-wrap font-light text-sm md:text-base ${(!isUser && (hasImage || message.isImageLoading)) ? 'lg:pt-0' : ''}`}>
              {message.text}
            </div>
          )}

        </div>

        {/* Decorative corner accent for Eve */}
        {!isUser && (
           <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-fuchsia-500/50 to-transparent opacity-50 rounded-l-2xl"></div>
        )}
      </div>
    </div>
  );
};

export default ChatBubble;
