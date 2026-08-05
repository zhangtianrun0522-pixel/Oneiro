
import React, { useState } from 'react';
import html2canvas from 'html2canvas';
import { DreamResult } from '../types';

interface Props {
  imageMessage?: string;
  imageStatus?: 'idle' | 'generating' | 'ready' | 'failed';
  result: DreamResult;
  onReset: () => void;
}

const toRoman = (num: number): string => {
  const map: { [key: string]: number } = { M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1 };
  let res = '';
  for (let i in map) {
    while (num >= map[i]) {
      res += i;
      num -= map[i];
    }
  }
  return res;
};

const escapeHtml = (value: string | number): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const DreamCard: React.FC<Props> = ({ imageMessage, imageStatus = 'idle', result, onReset }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  
  const [cardIndex] = useState(toRoman(Math.floor(Math.random() * 21) + 1));
  const [currentDate] = useState(new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.'));
  const [currentTime] = useState(new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' }));

  const handleExport = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    
    const container = document.getElementById('export-container');
    if (!container || isExporting) return;

    setIsExporting(true);
    const exportResult = {
      title: escapeHtml(result.title),
      image: escapeHtml(result.image),
      emotional_weather: escapeHtml(result.emotional_weather),
      symbols: result.symbols.map(escapeHtml),
      underneath: escapeHtml(result.underneath),
      echo: escapeHtml(result.echo),
      mirror: escapeHtml(result.mirror),
      integration_question: escapeHtml(result.integration_question),
      one_small_act: escapeHtml(result.one_small_act),
      imageUrl: escapeHtml(result.imageUrl || ''),
      lucky_color: escapeHtml(result.omens.lucky_color),
      lucky_color_name: escapeHtml(result.omens.lucky_color_name),
      lucky_number: escapeHtml(result.omens.lucky_number),
      omen_reason: escapeHtml(result.omens.reason),
    };

    container.innerHTML = `
        <div style="width: 750px; height: 1333px; background-color: #fdfaf5; color: #1a1a1a; padding: 58px 54px; position: relative; font-family: 'Noto Serif SC', serif; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;">
          <div style="position: absolute; inset: 0; opacity: 0.1; pointer-events: none; background-image: url('https://www.transparenttextures.com/patterns/natural-paper.png');"></div>
          <div style="position: relative; z-index: 2; width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 34px; border-bottom: 0.5px solid rgba(0,0,0,0.06); padding-bottom: 18px;">
            <span style="font-size: 13px; font-weight: 900; letter-spacing: 0.62em; text-transform: uppercase; color: rgba(0,0,0,0.22);">ONEIRO</span>
            <span style="font-size: 15px; font-weight: bold; color: rgba(0,0,0,0.3);">NO. ${cardIndex}</span>
          </div>
          <div style="position: relative; z-index: 2; width: 100%; aspect-ratio: 1/1; overflow: hidden; border-radius: 8px; background: linear-gradient(135deg, #e9edf2, #fbf7ef); box-shadow: 0 32px 90px -32px rgba(0,0,0,0.24); margin-bottom: 42px;">
            ${exportResult.imageUrl ? `<img src="${exportResult.imageUrl}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />` : ''}
            <div style="position: absolute; inset: 0; border: 1px solid rgba(0,0,0,0.05);"></div>
          </div>
          <div style="position: relative; z-index: 2; text-align: center; margin-bottom: 28px;">
             <h1 style="font-family: 'Zhi Mang Xing', cursive; font-size: 82px; margin: 0; color: #172033; letter-spacing: 0.1em; line-height: 1.08;">${exportResult.title}</h1>
             <p style="margin: 22px auto 0; max-width: 560px; color: #64748b; font-size: 23px; line-height: 1.75; letter-spacing: 0.04em;">${exportResult.emotional_weather}</p>
          </div>
          <div style="position: relative; z-index: 2; display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-bottom: 34px;">
            ${exportResult.symbols.slice(0, 5).map(symbol => `<span style="font-size: 15px; color: #475569; padding: 9px 15px; border: 0.5px solid rgba(15,23,42,0.08); border-radius: 999px; background: rgba(255,255,255,0.55);">${symbol}</span>`).join('')}
          </div>
          <div style="position: relative; z-index: 2; margin-top: auto; padding: 30px 28px; border-radius: 20px; background: rgba(255,255,255,0.55); border: 0.5px solid rgba(15,23,42,0.06);">
            <span style="font-size: 10px; letter-spacing: 0.6em; color: #94a3b8; display: block; margin-bottom: 14px; font-weight: 900; text-transform: uppercase; text-align: center;">Ritual</span>
            <p style="font-weight: 900; font-size: 25px; color: #1e293b; line-height: 1.45; margin: 0; text-align: center;">${exportResult.one_small_act}</p>
          </div>
          <div style="position: relative; z-index: 2; width: 100%; text-align: center; color: rgba(0,0,0,0.16); font-size: 12px; letter-spacing: 0.5em; text-transform: uppercase; padding-top: 30px;">
            ONEIRO DREAM ORACLE · ${currentDate}
          </div>
        </div>
      `;

    const tryRender = async (allowImage = true): Promise<HTMLCanvasElement> => {
      await new Promise(resolve => setTimeout(resolve, allowImage ? 1200 : 100));
      return html2canvas(container, {
        allowTaint: !allowImage,
        useCORS: allowImage,
        scale: 2,
        backgroundColor: '#fdfaf5'
      });
    };

    try {
      setExportError('');
      let canvas: HTMLCanvasElement;
      try {
        canvas = await tryRender(true);
      } catch {
        container.innerHTML = container.innerHTML.replace(/<img[^>]*>/g, '');
        canvas = await tryRender(false);
      }
      const link = document.createElement('a');
      link.download = `Oneiro_${result.title}_${currentDate.replace(/\./g, '_')}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
      setExportError('保存梦卡暂时失败，请稍后再试。');
    } finally {
      setIsExporting(false);
      container.innerHTML = '';
    }
  };

  const renderImage = () => (
    <div className="relative w-full aspect-[1/1] overflow-hidden rounded-[18px] bg-gradient-to-br from-slate-100 via-stone-50 to-slate-200 shadow-[0_35px_90px_-28px_rgba(15,23,42,0.45)]">
      {result.imageUrl ? (
        <img src={result.imageUrl} alt="Dream" className="h-full w-full object-cover opacity-[0.98]" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-8 text-center">
          <div className="h-10 w-10 rounded-full border border-slate-300/70 border-t-slate-600/70 animate-spin"></div>
          <p className="text-[10px] font-black uppercase tracking-[0.45em] text-slate-400">
            {imageStatus === 'failed' ? 'Image resting' : 'Image forming'}
          </p>
        </div>
      )}
      <div className="absolute inset-0 pointer-events-none opacity-10 mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]"></div>
    </div>
  );

  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center gap-3 p-2 select-none overflow-hidden">
      {imageMessage && (
        <div className="max-w-[21rem] rounded-full border border-white/[0.05] bg-white/[0.025] px-4 py-2 text-center text-[10px] leading-5 tracking-[0.18em] text-white/25">
          {imageMessage}
        </div>
      )}
      {exportError && (
        <div className="max-w-[21rem] rounded-full border border-amber-200/10 bg-amber-100/[0.04] px-4 py-2 text-center text-[10px] leading-5 tracking-[0.18em] text-amber-100/55">
          {exportError}
        </div>
      )}
      <div 
        className="relative h-full max-h-[82vh] aspect-[9/16] cursor-pointer group/card"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div 
          className={`relative w-full h-full transition-all duration-[1.1s] cubic-bezier(0.23, 1, 0.32, 1) transform-style-3d shadow-[0_50px_130px_-30px_rgba(0,0,0,0.85)] rounded-[40px] ${isFlipped ? 'rotate-y-180' : ''}`}
        >
          {/* 正面 UI */}
          <div className={`absolute inset-0 backface-hidden rounded-[40px] bg-[#fdfaf5] px-7 py-7 flex flex-col items-center overflow-hidden transition-opacity duration-500 ${isFlipped ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'}`}>
            <div className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]"></div>
            
            <header className="w-full flex justify-between items-center z-20 shrink-0 mb-5 border-b border-black/[0.04] pb-4">
              <span className="text-[8px] font-black tracking-[0.5em] text-slate-800 opacity-25 uppercase font-serif-sc">ONEIRO</span>
              <span className="text-[10px] font-serif-sc font-bold text-slate-800 opacity-30">NO. {cardIndex}</span>
            </header>

            <div className="relative z-10 flex w-full flex-1 flex-col items-center">
              {renderImage()}

              <div className="mt-6 w-full text-center">
                <h3 className="font-mystic text-4xl leading-none tracking-[0.14em] text-slate-900/90">{result.title}</h3>
                <p className="mx-auto mt-4 max-w-[17rem] text-[11px] leading-6 tracking-[0.08em] text-slate-500 font-serif-sc">
                  {result.emotional_weather}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {result.symbols.slice(0, 5).map((symbol) => (
                  <span key={symbol} className="rounded-full border border-slate-200/70 bg-white/45 px-3 py-1 text-[10px] font-bold text-slate-500 font-serif-sc">
                    {symbol}
                  </span>
                ))}
              </div>

              <div className="mt-auto w-full rounded-[22px] border border-slate-100/70 bg-white/55 px-5 py-4 text-center shadow-sm">
                <p className="mb-2 text-[7px] font-black uppercase tracking-[0.55em] text-slate-300">Ritual</p>
                <p className="text-[13px] font-black leading-relaxed text-slate-800 font-serif-sc">{result.one_small_act}</p>
              </div>

              <div className="mt-4 flex items-center justify-center gap-4">
                 <button onClick={handleExport} disabled={isExporting} className="group flex items-center justify-center relative transition-transform active:scale-95">
                  <div className="w-11 h-11 rounded-full bg-black/[0.02] border border-black/[0.05] flex items-center justify-center hover:bg-white hover:shadow-xl transition-all duration-700">
                    {isExporting ? (
                      <div className="w-4 h-4 border border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-5 h-5 text-slate-900 opacity-[0.25] group-hover:opacity-60 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    )}
                  </div>
                 </button>
                 <button onClick={onReset} className="text-[8px] font-black uppercase tracking-[0.45em] text-slate-400/70 transition-colors hover:text-slate-700">
                  再解一个梦
                 </button>
              </div>
            </div>

            <footer className="w-full flex flex-col items-center shrink-0 z-30 pt-3">
               <div className="text-[9px] tracking-[0.42em] font-bold text-slate-900/28 font-serif-sc uppercase">
                 Oneiro · {currentDate}
               </div>
               <p className="mt-2 text-[7px] tracking-[0.45em] text-slate-400/40 uppercase font-black animate-pulse">Tap for full reading</p>
            </footer>
          </div>

          {/* 背面 UI */}
          <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-[40px] bg-[#fefcf9] p-7 sm:p-10 flex flex-col overflow-hidden transition-opacity duration-500 ${isFlipped ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
            <div className="absolute inset-0 opacity-[0.06] pointer-events-none mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]"></div>
            <div className="relative z-10 flex flex-col h-full text-[#1a1a1a]">
              <header className="flex justify-between items-center mb-5 shrink-0 border-b border-black/[0.04] pb-5">
                <div className="text-left animate-in slide-in-from-left-4 duration-700">
                  <h3 className="text-[8px] font-black tracking-[0.45em] text-slate-300 uppercase mb-2 font-serif-sc">Celestial Scroll</h3>
                  <h4 className="text-3xl font-mystic text-slate-800">{result.title}</h4>
                </div>
                <button onClick={handleExport} disabled={isExporting} className="group shrink-0 transition-transform active:scale-90 animate-in fade-in duration-1000">
                  <div className="w-10 h-10 rounded-full bg-slate-100/60 border border-slate-200/50 flex items-center justify-center hover:bg-white transition-all shadow-sm">
                    {isExporting ? <div className="w-3 h-3 border border-slate-200 border-t-slate-800 rounded-full animate-spin"></div> : <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                  </div>
                </button>
              </header>

              <div className="flex-1 overflow-y-auto custom-scrollbar-card pr-2 space-y-7 pb-4 relative z-20">
                <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150 fill-mode-both">
                  <p className="text-[12px] leading-relaxed text-slate-400 italic text-center tracking-wide font-medium px-2">
                    “ {result.image} ”
                  </p>
                </section>

                <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-200 fill-mode-both">
                  <div className="rounded-[18px] border border-teal-500/5 bg-teal-50/20 p-4 text-center text-[11px] leading-relaxed text-slate-500 font-serif-sc">
                    {result.mirror}
                  </div>
                </section>
                
                <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300 fill-mode-both">
                   <div className="flex items-center gap-4 opacity-[0.14]"><span className="text-[7px] font-black uppercase tracking-[0.5em]">Underneath</span><div className="h-[0.5px] flex-1 bg-black"></div></div>
                   <p className="text-[13px] leading-[1.85] text-slate-600 text-justify font-serif-sc">{result.underneath}</p>
                </section>

                <div className="grid grid-cols-1 gap-5">
                  <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-[450ms] fill-mode-both">
                     <div className="flex items-center gap-4 opacity-[0.25] text-indigo-400"><span className="text-[7px] font-black uppercase tracking-[0.5em]">Echo</span></div>
                     <div className="bg-indigo-50/20 p-5 rounded-[18px] italic text-[11px] text-slate-500 leading-relaxed border border-indigo-500/5 font-serif-sc">
                      {result.echo}
                     </div>
                  </section>
                </div>

                <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-[700ms] fill-mode-both">
                   <div className="flex items-center gap-4 opacity-[0.25] text-teal-500"><span className="text-[7px] font-black uppercase tracking-[0.5em]">Question</span></div>
                   <div className="bg-teal-50/20 p-5 rounded-[18px] text-[11px] text-slate-500 leading-relaxed border border-teal-500/5 font-serif-sc">
                    {result.integration_question}
                   </div>
                </section>

                <section className="pt-4 border-t border-black/[0.03] mt-4 flex items-center justify-between animate-in fade-in duration-1000 delay-[1000ms] fill-mode-both">
                   <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full shadow-inner animate-pulse" 
                        style={{ backgroundColor: result.omens.lucky_color, boxShadow: `0 0 12px ${result.omens.lucky_color}55` }}
                      ></div>
                      <div className="flex flex-col">
                        <span className="text-[6px] font-black text-slate-300 uppercase tracking-widest font-serif-sc">Lucky Tone</span>
                        <span className="text-[11px] font-bold text-slate-500 font-serif-sc">{result.omens.lucky_color_name}</span>
                      </div>
                   </div>
                   <div className="flex flex-col items-end">
                      <span className="text-[6px] font-black text-slate-300 uppercase tracking-widest text-right font-serif-sc">Lucky Num</span>
                      <span className="text-2xl font-serif text-slate-800 italic font-black">#{result.omens.lucky_number}</span>
                   </div>
                </section>
              </div>
              <div className="shrink-0 text-center pt-4 opacity-10 mt-auto"><p className="text-[8px] tracking-[0.45em] uppercase font-black font-serif-sc">Tap to return</p></div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .custom-scrollbar-card::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar-card::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.04); border-radius: 10px; }
        .custom-scrollbar-card::-webkit-scrollbar-track { background: transparent; }
        
        /* 针对 React 的动画填充模式支持 */
        .fill-mode-both { animation-fill-mode: both; }
      `}</style>
    </div>
  );
};
