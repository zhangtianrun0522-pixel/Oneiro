import React, { useState, useEffect } from 'react';
import { UserInfo, AstroInfo, DreamResult, AppStage } from './types';
import { InputProfile } from './components/InputProfile';
import { DreamCard } from './components/DreamCard';
import { DreamSoundscape } from './components/DreamSoundscape';
import { analyzeDream, generateDreamImage } from './services/dreamService';

const MOCK_ASTRO: AstroInfo = {
  todayDate: new Date().toLocaleDateString('zh-CN'),
  lunarPhase: "Waxing Gibbous in Scorpio",
  majorTransits: "木星进入双子座，水星与土星呈和谐相，利于深层思考与表达。"
};

const LOADING_SOUND_CONFIG: DreamResult['sound_config'] = {
  theme: 'liquid',
  drone_hz: 60,
  pulse_rate: 0.15,
  texture_intensity: 0.3
};

function App() {
  const [stage, setStage] = useState<AppStage>(AppStage.INPUT_PROFILE);
  const [transitioning, setTransitioning] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [dreamText, setDreamText] = useState('');
  const [result, setResult] = useState<DreamResult | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [displayDate, setDisplayDate] = useState('');

  useEffect(() => {
    setDisplayDate(new Date().toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).replace(/\//g, '.'));
  }, []);

  const changeStage = (newStage: AppStage) => {
    setTransitioning(true);
    setTimeout(() => {
      setStage(newStage);
      setTransitioning(false);
    }, 800);
  };

  const handleProfileComplete = (info: UserInfo) => {
    setUserInfo(info);
    changeStage(AppStage.INPUT_DREAM);
  };

  const handleInterpret = async () => {
    if (!userInfo || !dreamText) return;
    setTransitioning(true);
    setTimeout(async () => {
      setStage(AppStage.INTERPRETING);
      setTransitioning(false);
      setLoadingMsg('正在剥离意识的表层...');
      try {
        const analysis = await analyzeDream(userInfo, MOCK_ASTRO, dreamText);
        setResult(analysis);
        setLoadingMsg('星轨交错，正在编织梦境映像...');
        const imageUrl = await generateDreamImage(analysis.image_prompt);
        setResult(prev => prev ? { ...prev, imageUrl } : null);
        setTimeout(() => changeStage(AppStage.RESULT), 1000);
      } catch (error) {
        console.error(error);
        alert('星讯中断，请稍后再次尝试连接。');
        changeStage(AppStage.INPUT_DREAM);
      }
    }, 800);
  };

  const goHome = () => {
    setUserInfo(null);
    setDreamText('');
    setResult(null);
    changeStage(AppStage.INPUT_PROFILE);
  };

  const goInput = () => {
    setResult(null);
    setDreamText('');
    changeStage(AppStage.INPUT_DREAM);
  };

  const currentSoundConfig = result?.sound_config || LOADING_SOUND_CONFIG;
  const isAudioActive = (stage === AppStage.INTERPRETING || stage === AppStage.RESULT) && isSoundEnabled;

  return (
    <div className="h-screen w-full bg-[#020408] text-slate-400 flex flex-col relative overflow-hidden">
      <header className="fixed top-0 left-0 w-full h-16 px-8 flex justify-between items-center z-[100] bg-[#020408]/30 backdrop-blur-md border-b border-white/[0.01]">
        <button onClick={goHome} className="group flex flex-col items-start">
          <span className="text-sm sm:text-lg font-mystic tracking-[0.5em] text-white/40 group-hover:text-white/70 transition-all duration-1000">ONEIRO</span>
          <span className="text-[4px] tracking-[1.2em] text-white/5 uppercase font-black -mt-1">Ancient Echoes</span>
        </button>
        <div className="flex items-center gap-6">
          {(stage === AppStage.INTERPRETING || stage === AppStage.RESULT) && (
            <button onClick={() => setIsSoundEnabled(!isSoundEnabled)} className="text-white/10 hover:text-white/40 transition-all">
              {isSoundEnabled ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
              )}
            </button>
          )}
          <button onClick={goHome} className="group relative flex items-center justify-center transition-colors">
            <svg className="w-3.5 h-3.5 text-white/10 group-hover:text-white/40 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
        </div>
      </header>

      <main className={`flex-1 w-full flex flex-col items-center justify-start overflow-y-auto custom-scrollbar ${stage === AppStage.RESULT ? 'pt-16 pb-6' : 'pt-24 pb-12'} px-6 z-10 relative`}>
        <div className={`w-full flex flex-col items-center justify-start min-h-full transition-all ${transitioning ? 'stage-transition-exit' : 'stage-transition-active'}`}>
          {stage === AppStage.INPUT_PROFILE && <InputProfile onComplete={handleProfileComplete} />}
          {stage === AppStage.INPUT_DREAM && (
            <div className="max-w-xl mx-auto w-full flex flex-col items-center space-y-16">
              <div className="text-center space-y-2">
                <h2 className="text-xl sm:text-2xl font-mystic text-white/40 tracking-[0.4em]">描述你昨夜的所见</h2>
                <p className="text-[5px] tracking-[1em] text-white/5 uppercase font-black">Archive the Unconscious</p>
              </div>
              <div className="relative w-full group">
                <textarea
                  className="relative z-10 w-full h-60 bg-transparent border-none outline-none resize-none text-white/60 placeholder:text-white/[0.02] leading-relaxed text-sm sm:text-lg text-center font-light tracking-[0.2em] p-4 focus:text-white transition-all duration-1000"
                  placeholder="在迷雾中，我看见了..."
                  autoFocus
                  value={dreamText}
                  onChange={(e) => setDreamText(e.target.value)}
                />
                <div className="flex flex-col items-center gap-12 mt-12 relative z-20">
                  <button
                    onClick={handleInterpret}
                    disabled={!dreamText.trim()}
                    className="group relative px-16 py-4 disabled:opacity-0 transition-all duration-1000"
                  >
                    <div className="absolute inset-0 border border-white/[0.04] rounded-full group-hover:border-white/10 transition-all duration-1000"></div>
                    <span className="relative z-10 text-white/20 font-bold tracking-[1.2em] text-[7px] uppercase group-hover:text-white/60 transition-colors">唤醒契约</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          {stage === AppStage.INTERPRETING && (
            <div className="flex flex-col items-center justify-center flex-1 py-10 space-y-12">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <div className="absolute inset-0 border-[0.5px] border-white/[0.05] rounded-full animate-[ping_3s_infinite]"></div>
                <div className="relative w-[1px] h-[1px] bg-white/40 shadow-[0_0_40px_rgba(255,255,255,0.2)] animate-pulse"></div>
              </div>
              <p className="text-white/30 text-lg font-mystic tracking-[0.6em] animate-pulse">{loadingMsg}</p>
            </div>
          )}
          {stage === AppStage.RESULT && result && <DreamCard result={result} onReset={goInput} />}
        </div>
      </main>

      <footer className="h-12 w-full flex flex-col items-center justify-center shrink-0 z-[100] bg-[#020408]/50 backdrop-blur-sm border-t border-white/[0.01]">
        <p className="text-[5px] text-white/[0.03] tracking-[1em] uppercase font-black">Celestial Archiver · {displayDate}</p>
      </footer>

      <DreamSoundscape config={currentSoundConfig} active={isAudioActive} />
    </div>
  );
}

export default App;
