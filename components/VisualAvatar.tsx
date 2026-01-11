import React from 'react';

interface VisualAvatarProps {
  isThinking: boolean;
  emotion: 'neutral' | 'happy' | 'cheeky' | 'angry' | 'smirking' | 'seductive';
}

const VisualAvatar: React.FC<VisualAvatarProps> = ({ isThinking, emotion }) => {
  const getVideoSrc = () => {
    // Priority 1: Thinking
    if (isThinking) {
      return "https://res.cloudinary.com/dy57jxan6/video/upload/v1764098067/Thinking_gshudt.mp4";
    }
    // Priority 2: Angry
    if (emotion === 'angry') {
      return "https://res.cloudinary.com/dy57jxan6/video/upload/v1764097895/Angry_p6uoux.mp4";
    }
    // Priority 3: Seductive
    if (emotion === 'seductive') {
      return "https://res.cloudinary.com/dy57jxan6/video/upload/v1764099294/seductive_kkad1c.mp4";
    }
    // Priority 4: Evil/Smirking
    if (emotion === 'smirking') {
      return "https://res.cloudinary.com/dy57jxan6/video/upload/v1764097897/evil_smile_gs06p2.mp4";
    }
    // Priority 5: Emotion (Smile/Cheeky)
    if (emotion === 'happy' || emotion === 'cheeky') {
      return "https://res.cloudinary.com/dy57jxan6/video/upload/v1764097897/smile_cdopjw.mp4";
    }
    // Priority 6: Neutral (Default)
    return "https://res.cloudinary.com/dy57jxan6/video/upload/v1764097875/neutral_uf3ilb.mp4";
  };

  const getBorderColor = () => {
    if (isThinking) return 'border-fuchsia-400 shadow-[0_0_15px_rgba(232,121,249,0.5)]';
    if (emotion === 'angry') return 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
    if (emotion === 'smirking') return 'border-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.5)]';
    if (emotion === 'seductive') return 'border-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.5)]';
    return 'border-slate-800 bg-slate-900';
  };

  const getStatusColor = () => {
    if (isThinking) return 'bg-fuchsia-400';
    if (emotion === 'angry') return 'bg-red-500';
    if (emotion === 'smirking') return 'bg-purple-600';
    if (emotion === 'seductive') return 'bg-pink-500';
    return 'bg-emerald-500';
  };

  return (
    <div className="relative w-14 h-14 md:w-24 md:h-24 flex items-center justify-center transition-all duration-300">
      {/* Outer Glow - Magenta/Purple - intensified when thinking */}
      <div className={`absolute inset-0 rounded-full blur-xl bg-fuchsia-600/30 transition-all duration-1000 ${isThinking ? 'scale-125 opacity-80' : 'scale-100 opacity-40'}`}></div>
      
      {/* Main Core - Video Container */}
      <div className={`relative w-12 h-12 md:w-20 md:h-20 rounded-full border-2 overflow-hidden shadow-2xl flex items-center justify-center transition-all duration-300 ${getBorderColor()}`}>
        {/* We use the key attribute to force React to re-mount the video element when the source category changes.
            This ensures the new video plays from the start and loops correctly. */}
        <video 
            key={isThinking ? 'thinking' : emotion}
            src={getVideoSrc()}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-opacity"
        />

        {/* Overlay for thinking state */}
        {isThinking && (
             <div className="absolute inset-0 bg-fuchsia-500/10 mix-blend-overlay rounded-full animate-pulse"></div>
        )}
        
        {/* Overlay for angry state */}
        {!isThinking && emotion === 'angry' && (
             <div className="absolute inset-0 bg-red-500/10 mix-blend-overlay rounded-full"></div>
        )}

         {/* Overlay for evil/smirking state */}
         {!isThinking && emotion === 'smirking' && (
             <div className="absolute inset-0 bg-purple-900/20 mix-blend-overlay rounded-full"></div>
        )}

        {/* Overlay for seductive state */}
        {!isThinking && emotion === 'seductive' && (
             <div className="absolute inset-0 bg-pink-500/20 mix-blend-overlay rounded-full"></div>
        )}
      </div>

      {/* Status Dot */}
      <div className={`absolute bottom-0 right-0 md:right-1 w-2.5 h-2.5 md:w-3 md:h-3 rounded-full border-2 border-slate-900 transition-colors duration-300 ${isThinking ? 'bg-fuchsia-400 animate-ping' : 'hidden'}`}></div>
      <div className={`absolute bottom-0 right-0 md:right-1 w-2.5 h-2.5 md:w-3 md:h-3 rounded-full border-2 border-slate-900 transition-colors duration-300 ${getStatusColor()}`}></div>
    </div>
  );
};

export default VisualAvatar;