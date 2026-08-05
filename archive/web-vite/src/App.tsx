import React, { useState, useEffect } from 'react';
import { UserInfo, DreamResult, AppStage, DreamArchiveItem } from './types';
import { InputProfile } from './components/InputProfile';
import { DreamCard } from './components/DreamCard';
import { DreamSoundscape } from './components/DreamSoundscape';
import { analyzeDream, generateDreamImage } from './services/dreamService';
import { getDreamArchive, getLastUser, saveDreamArchiveItem, saveLastUser } from './services/localArchive';
import { ACCEPTANCE_DREAM_RESULT, ACCEPTANCE_DREAM_TEXT, ACCEPTANCE_USER } from './fixtures/acceptanceDream';

const LOADING_SOUND_CONFIG: DreamResult['sound_config'] = {
  theme: 'liquid',
  drone_hz: 60,
  pulse_rate: 0.15,
  texture_intensity: 0.3
};

const isAcceptanceMode = new URLSearchParams(window.location.search).get('acceptance') === '1';
const SAMPLE_DREAM_TEXT = '我走进一座被月光照亮的图书馆，书架之间慢慢涨起清水。一把银色钥匙漂在水面上，我伸手去拿时，远处有一只白鸟撞向窗户，但没有声音。';

type ImageStatus = 'idle' | 'generating' | 'ready' | 'failed';

function App() {
  const savedUser = isAcceptanceMode ? ACCEPTANCE_USER : getLastUser();
  const [stage, setStage] = useState<AppStage>(AppStage.INPUT_PROFILE);
  const [transitioning, setTransitioning] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(savedUser);
  const [dreamText, setDreamText] = useState(isAcceptanceMode ? ACCEPTANCE_DREAM_TEXT : '');
  const [result, setResult] = useState<DreamResult | null>(null);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [loadingStep, setLoadingStep] = useState<'analysis' | 'image'>('analysis');
  const [errorMessage, setErrorMessage] = useState('');
  const [imageStatus, setImageStatus] = useState<ImageStatus>('idle');
  const [imageMessage, setImageMessage] = useState('');
  const [archiveItems, setArchiveItems] = useState<DreamArchiveItem[]>(() => isAcceptanceMode ? [] : getDreamArchive());
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
    if (!isAcceptanceMode) saveLastUser(info);
    changeStage(AppStage.INPUT_DREAM);
  };

  const refreshArchive = () => {
    if (!isAcceptanceMode) setArchiveItems(getDreamArchive());
  };

  const openArchiveItem = (item: DreamArchiveItem) => {
    setUserInfo(item.userInfo);
    setDreamText(item.dreamText);
    setResult({ ...item.result, imageUrl: item.imageUrl || item.result.imageUrl });
    setImageStatus(item.imageUrl || item.result.imageUrl ? 'ready' : 'failed');
    setImageMessage('');
    setErrorMessage('');
    changeStage(AppStage.RESULT);
  };

  const saveResultToArchive = (
    analysis: DreamResult,
    archiveUserInfo: UserInfo,
    archiveDreamText: string,
    imageUrl?: string,
    id?: string
  ) => {
    if (isAcceptanceMode) return undefined;
    const item = saveDreamArchiveItem({
      dreamText: archiveDreamText,
      id,
      imageUrl,
      result: { ...analysis, imageUrl: imageUrl || analysis.imageUrl },
      userInfo: archiveUserInfo,
    });
    refreshArchive();
    return item;
  };

  const handleInterpret = async () => {
    const trimmedDreamText = dreamText.trim();
    if (!userInfo || !trimmedDreamText) return;
    setErrorMessage('');
    setImageMessage('');
    setImageStatus('idle');
    setTransitioning(true);
    setTimeout(async () => {
      setStage(AppStage.INTERPRETING);
      setTransitioning(false);
      setLoadingStep('analysis');
      setLoadingMsg('正在解读梦境的暗流...');
      try {
        if (isAcceptanceMode) {
          await new Promise(resolve => setTimeout(resolve, 400));
          setResult(ACCEPTANCE_DREAM_RESULT);
          setImageStatus('ready');
          setTimeout(() => changeStage(AppStage.RESULT), 500);
          return;
        }

        const analysis = await analyzeDream(userInfo, trimmedDreamText);
        setResult(analysis);
        setImageStatus('generating');
        setImageMessage('梦卡画面正在显影，你可以先阅读解读。');
        const archiveItem = saveResultToArchive(analysis, userInfo, trimmedDreamText);
        changeStage(AppStage.RESULT);

        generateDreamImage(analysis.image_prompt)
          .then((imageUrl) => {
            setImageStatus('ready');
            setImageMessage('');
            setResult(prev => prev ? { ...prev, imageUrl } : null);
            saveResultToArchive(analysis, userInfo, trimmedDreamText, imageUrl, archiveItem?.id);
          })
          .catch((imageError) => {
            console.error('Image generation failed:', imageError);
            setImageStatus('failed');
            setImageMessage('图像生成暂时没有完成，这张梦卡仍然可以保存为文字版。');
          });
      } catch (error) {
        console.error(error);
        setLoadingMsg('星讯中断，梦境回声尚未抵达...');
        const details = error instanceof Error ? error.message : '请检查本地 API 配置后重试。';
        setErrorMessage(`本地 API 调用未完成：${details}`);
        setTimeout(() => changeStage(AppStage.INPUT_DREAM), 1200);
      }
    }, 800);
  };

  const goHome = () => {
    const latestUser = isAcceptanceMode ? ACCEPTANCE_USER : getLastUser();
    setUserInfo(latestUser);
    setDreamText(isAcceptanceMode ? ACCEPTANCE_DREAM_TEXT : '');
    setResult(null);
    setErrorMessage('');
    setImageStatus('idle');
    setImageMessage('');
    refreshArchive();
    changeStage(AppStage.INPUT_PROFILE);
  };

  const goInput = () => {
    setResult(null);
    setDreamText('');
    setErrorMessage('');
    setImageStatus('idle');
    setImageMessage('');
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
          {stage === AppStage.INPUT_PROFILE && (
            <InputProfile
              archiveItems={archiveItems}
              onComplete={handleProfileComplete}
              onOpenArchive={openArchiveItem}
              initialInfo={userInfo || undefined}
            />
          )}
          {stage === AppStage.INPUT_DREAM && (
            <div className="max-w-xl mx-auto w-full flex flex-col items-center space-y-10">
              <div className="text-center space-y-3">
                <h2 className="text-xl sm:text-2xl font-mystic text-white/45 tracking-[0.32em]">描述你昨夜的所见</h2>
                <p className="mx-auto max-w-[19rem] text-[11px] leading-6 tracking-[0.18em] text-white/18">
                  写下一个画面、一个人、一个声音也足够。梦会自己补全剩下的暗线。
                </p>
                <p className="text-[5px] tracking-[1em] text-white/5 uppercase font-black">Archive the Unconscious</p>
              </div>
              <div className="relative w-full group">
                {errorMessage && (
                  <div className="mb-6 rounded-3xl border border-amber-200/10 bg-amber-100/[0.03] px-5 py-4 text-center text-xs leading-6 tracking-[0.18em] text-amber-100/60 sm:text-sm">
                    {errorMessage}
                  </div>
                )}
                <textarea
                  className="relative z-10 w-full h-56 bg-transparent border border-white/[0.03] rounded-[28px] outline-none resize-none text-white/65 placeholder:text-white/[0.08] leading-relaxed text-sm sm:text-lg text-center font-light tracking-[0.16em] p-6 focus:text-white focus:border-white/10 transition-all duration-1000"
                  placeholder="例如：我在月光下的图书馆里，捡到一把银色钥匙..."
                  autoFocus
                  value={dreamText}
                  onChange={(e) => setDreamText(e.target.value)}
                />
                <div className="mt-5 flex flex-col items-center gap-5 relative z-20">
                  <button
                    type="button"
                    onClick={() => setDreamText(SAMPLE_DREAM_TEXT)}
                    className="text-[8px] font-black uppercase tracking-[0.55em] text-white/15 transition-colors duration-700 hover:text-white/45"
                  >
                    试一个示例梦
                  </button>
                  <button
                    onClick={handleInterpret}
                    disabled={!dreamText.trim()}
                    className="group relative px-16 py-4 transition-all duration-1000 disabled:opacity-35"
                  >
                    <div className="absolute inset-0 border border-white/[0.04] rounded-full group-hover:border-white/10 transition-all duration-1000"></div>
                    <span className="relative z-10 text-white/30 font-bold tracking-[0.8em] text-[8px] uppercase group-hover:text-white/65 transition-colors">
                      {dreamText.trim() ? '生成梦卡' : '先写下一点梦'}
                    </span>
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
              <div className="space-y-5 text-center">
                <div className="flex items-center justify-center gap-3 text-[7px] font-black uppercase tracking-[0.5em] text-white/12">
                  <span className={loadingStep === 'analysis' ? 'text-white/45' : ''}>解读梦境</span>
                  <span>·</span>
                  <span className={loadingStep === 'image' ? 'text-white/45' : ''}>生成梦卡</span>
                </div>
                <p className="text-white/30 text-lg font-mystic tracking-[0.45em] animate-pulse">{loadingMsg}</p>
              </div>
            </div>
          )}
          {stage === AppStage.RESULT && result && (
            <DreamCard
              imageMessage={imageMessage}
              imageStatus={imageStatus}
              result={result}
              onReset={goInput}
            />
          )}
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
