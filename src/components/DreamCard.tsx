
import React, { useState } from 'react';
import html2canvas from 'html2canvas';
import { DreamResult } from '../types';

interface Props {
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

export const DreamCard: React.FC<Props> = ({ result, onReset }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
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

    if (!isFlipped) {
      container.innerHTML = `
        <div style="width: 750px; height: 1333px; background-color: #fdfaf5; color: #1a1a1a; padding: 80px 70px; position: relative; font-family: 'Noto Serif SC', serif; display: flex; flex-direction: column; align-items: center; overflow: hidden; box-sizing: border-box;">
          <div style="position: absolute; inset: 0; opacity: 0.1; pointer-events: none; background-image: url('https://www.transparenttextures.com/patterns/natural-paper.png');"></div>
          <div style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-bottom: 60px; border-bottom: 0.5px solid rgba(0,0,0,0.06); padding-bottom: 25px;">
            <span style="font-size: 14px; font-weight: 900; letter-spacing: 0.8em; text-transform: uppercase; color: rgba(0,0,0,0.2);">Astra Oracle</span>
            <span style="font-size: 16px; font-weight: 600; color: rgba(0,0,0,0.3);">NO. ${cardIndex}</span>
          </div>
          <div style="width: 100%; aspect-ratio: 3/4; position: relative; overflow: hidden; border-radius: 2px; box-shadow: 0 40px 120px -30px rgba(0,0,0,0.18);">
            <img src="${result.imageUrl}" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
          </div>
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; padding: 60px 0;">
            <h1 style="font-family: 'Zhi Mang Xing', cursive; font-size: 92px; color: #1e293b; margin: 0; letter-spacing: 0.15em; line-height: 1.1; text-align: center;">${result.title}</h1>
          </div>
          <div style="width: 100%; text-align: center; color: rgba(0,0,0,0.12); font-size: 13px; letter-spacing: 0.6em; text-transform: uppercase; padding-top: 30px; border-top: 0.5px solid rgba(0,0,0,0.04); margin-bottom: 20px;">
            ${currentDate} · ARCHIVED
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="width: 750px; background-color: #fdfaf5; color: #1a1a1a; padding: 70px 60px; position: relative; font-family: 'Noto Serif SC', serif; display: flex; flex-direction: column;">
          <div style="position: absolute; inset: 0; opacity: 0.1; pointer-events: none; background-image: url('https://www.transparenttextures.com/patterns/natural-paper.png');"></div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 45px; border-bottom: 0.5px solid rgba(0,0,0,0.08); padding-bottom: 25px; shrink-0;">
            <span style="font-size: 13px; font-weight: 900; letter-spacing: 0.5em; text-transform: uppercase; color: rgba(0,0,0,0.2);">Celestial Scroll</span>
            <span style="font-size: 15px; font-weight: bold; color: rgba(0,0,0,0.3);">NO. ${cardIndex}</span>
          </div>
          <div style="width: 100%; aspect-ratio: 3/2; padding: 25px; background: white; border-radius: 8px; margin-bottom: 65px; box-shadow: 0 12px 40px rgba(0,0,0,0.06); border: 0.5px solid rgba(0,0,0,0.04); box-sizing: border-box;">
            <div style="width: 100%; height: 100%; overflow: hidden; border-radius: 2px; position: relative; background-color: #fcfcfc;">
               <img src="${result.imageUrl}" style="width: 100%; height: 100%; object-fit: cover; object-position: center 25%;" />
               <div style="position: absolute; inset: 0; box-shadow: inset 0 0 50px rgba(0,0,0,0.03);"></div>
            </div>
          </div>
          <div style="text-align: center; margin-bottom: 70px;">
             <h1 style="font-family: 'Zhi Mang Xing', cursive; font-size: 82px; margin: 0; color: #1e293b; letter-spacing: 0.1em; line-height: 1.2;">${result.title}</h1>
          </div>
          <div style="line-height: 2.2; font-size: 19px; color: #334155; padding: 0 5px;">
            <p style="margin-bottom: 60px; text-align: justify; font-style: italic; color: #64748b; font-size: 18px; line-height: 2.0;">“ ${result.image} ”</p>
            <div style="margin-bottom: 55px;">
              <span style="font-size: 10px; letter-spacing: 0.6em; color: rgba(0,0,0,0.15); font-weight: 900; display: block; margin-bottom: 25px; text-transform: uppercase;">Underneath</span>
              <p style="margin: 0; text-align: justify; color: #334155;">${result.underneath}</p>
            </div>
            <div style="background: rgba(99, 102, 241, 0.03); padding: 35px; border-radius: 12px; margin-bottom: 30px; border-left: 2px solid rgba(99, 102, 241, 0.15); font-size: 18px; color: #475569;">${result.echo}</div>
            <div style="background: rgba(168, 85, 247, 0.03); padding: 35px; border-radius: 12px; margin-bottom: 70px; border-left: 2px solid rgba(168, 85, 247, 0.15); font-size: 18px; color: #475569;">${result.mirror}</div>
            <div style="text-align: center; border: 0.5px solid rgba(0,0,0,0.05); padding: 55px 40px; border-radius: 16px; background: white; margin-bottom: 60px; box-shadow: 0 4px 20px rgba(0,0,0,0.01);">
               <span style="font-size: 10px; letter-spacing: 0.5em; color: #94a3b8; display: block; margin-bottom: 25px; font-weight: 900; text-transform: uppercase;">Ritual</span>
               <p style="font-weight: 900; font-size: 26px; color: #1e293b; line-height: 1.5; margin: 0; letter-spacing: 0.02em;">${result.one_small_act}</p>
            </div>
            <div style="display: flex; gap: 20px; border-top: 1px solid rgba(0,0,0,0.04); padding-top: 50px; align-items: center;">
               <div style="flex: 1; display: flex; align-items: center; gap: 18px;">
                  <div style="width: 24px; height: 24px; border-radius: 50%; background-color: ${result.omens.lucky_color}; border: 1.5px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></div>
                  <span style="font-size: 16px; font-weight: 600; color: #64748b; letter-spacing: 0.1em;">${result.omens.lucky_color_name}</span>
               </div>
               <div style="font-size: 48px; font-weight: 900; color: #1e293b; font-family: 'Noto Serif SC', serif; font-style: italic; opacity: 0.9;">#${result.omens.lucky_number}</div>
            </div>
          </div>
          <div style="text-align: center; color: rgba(0,0,0,0.15); font-size: 13px; letter-spacing: 0.5em; text-transform: uppercase; margin-top: 90px; padding-bottom: 30px;">
            ARCHIVED AT ${currentDate} ${currentTime}
          </div>
        </div>
      `;
    }

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const canvas = await html2canvas(container, {
        useCORS: true,
        scale: 2,
        backgroundColor: '#fdfaf5'
      });
      const link = document.createElement('a');
      link.download = `Oracle_${result.title}_${currentDate.replace(/\./g, '_')}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
      container.innerHTML = '';
    }
  };

  return (
    <div className="flex-1 w-full flex items-center justify-center p-2 select-none overflow-hidden">
      <div 
        className="relative h-full max-h-[85vh] aspect-[9/16] cursor-pointer group/card"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div 
          className={`relative w-full h-full transition-all duration-[1.1s] cubic-bezier(0.23, 1, 0.32, 1) transform-style-3d shadow-[0_50px_130px_-30px_rgba(0,0,0,0.85)] rounded-[52px] ${isFlipped ? 'rotate-y-180' : ''}`}
        >
          {/* 正面 UI */}
          <div className={`absolute inset-0 backface-hidden rounded-[52px] bg-[#fdfaf5] p-10 flex flex-col items-center overflow-hidden transition-opacity duration-500 ${isFlipped ? 'pointer-events-none opacity-0' : 'pointer-events-auto opacity-100'}`}>
            <div className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]"></div>
            
            <header className="w-full flex justify-between items-center px-1 z-20 shrink-0 mb-10">
              <span className="text-[9px] font-black tracking-[0.6em] text-slate-800 opacity-20 uppercase font-serif-sc">Astra Oracle</span>
              <span className="text-[10px] font-serif-sc font-bold text-slate-800 opacity-30">NO. {cardIndex}</span>
            </header>

            <div className="flex-1 w-full flex flex-col items-center justify-center z-10">
              <div className="relative w-full group-hover/card:scale-[1.04] transition-transform duration-[2s] ease-out">
                <div className="w-full aspect-[3/4] relative overflow-hidden rounded-[4px] shadow-[0_45px_110px_-25px_rgba(0,0,0,0.3)]">
                   {result.imageUrl ? (
                    <img src={result.imageUrl} alt="Dream" className="w-full h-full object-cover opacity-[0.98] grayscale-[0.02]" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-100/50 animate-pulse"></div>
                  )}
                  <div className="absolute inset-0 pointer-events-none opacity-10 mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]"></div>
                </div>
              </div>

              <div className="mt-14 mb-8 flex flex-col items-center">
                 <button onClick={handleExport} disabled={isExporting} className="group flex items-center justify-center relative transition-transform active:scale-95 mb-6">
                  <div className="w-14 h-14 rounded-full bg-black/[0.01] border border-black/[0.04] flex items-center justify-center hover:bg-white hover:shadow-2xl transition-all duration-1000">
                    {isExporting ? (
                      <div className="w-4 h-4 border border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-6 h-6 text-slate-900 opacity-[0.1] group-hover:opacity-50 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    )}
                  </div>
                 </button>
                 <p className="text-[8px] tracking-[0.6em] text-slate-400/60 uppercase font-black animate-pulse">Tap to Unveil</p>
              </div>
            </div>

            <footer className="w-full flex flex-col items-center shrink-0 z-30 pb-4 mt-auto">
               <div className="h-[0.5px] w-8 bg-black/5 mb-4"></div>
               <div className="text-[10px] tracking-[0.5em] font-bold text-slate-900/40 font-serif-sc uppercase">
                 {currentDate} · {currentTime}
               </div>
            </footer>
          </div>

          {/* 背面 UI */}
          <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-[52px] bg-[#fefcf9] p-8 sm:p-12 flex flex-col overflow-hidden transition-opacity duration-500 ${isFlipped ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}>
            <div className="absolute inset-0 opacity-[0.06] pointer-events-none mix-blend-multiply bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]"></div>
            <div className="relative z-10 flex flex-col h-full text-[#1a1a1a]">
              <header className="flex justify-between items-center mb-6 shrink-0 border-b border-black/[0.04] pb-6">
                <div className="text-left animate-in slide-in-from-left-4 duration-700">
                  <h3 className="text-[8px] font-black tracking-[0.6em] text-slate-300 uppercase mb-2 font-serif-sc">Celestial Scroll</h3>
                  <h4 className="text-3xl font-mystic text-slate-800">{result.title}</h4>
                </div>
                <button onClick={handleExport} disabled={isExporting} className="group shrink-0 transition-transform active:scale-90 animate-in fade-in duration-1000">
                  <div className="w-10 h-10 rounded-full bg-slate-100/60 border border-slate-200/50 flex items-center justify-center hover:bg-white transition-all shadow-sm">
                    {isExporting ? <div className="w-3 h-3 border border-slate-200 border-t-slate-800 rounded-full animate-spin"></div> : <svg className="w-4 h-4 text-slate-300 group-hover:text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                  </div>
                </button>
              </header>

              <div className="flex-1 overflow-y-auto custom-scrollbar-card pr-2 space-y-8 pb-4 relative z-20">
                <section className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150 fill-mode-both">
                  <p className="text-[12px] leading-relaxed text-slate-400 italic text-center tracking-wide font-medium px-4">
                    “ {result.image.length > 80 ? result.image.slice(0, 80) + '...' : result.image} ”
                  </p>
                </section>
                
                <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300 fill-mode-both">
                   <div className="flex items-center gap-4 opacity-[0.08]"><span className="text-[7px] font-black uppercase tracking-[0.6em]">Underneath</span><div className="h-[0.5px] flex-1 bg-black"></div></div>
                   <p className="text-[13px] leading-[1.9] text-slate-600 text-justify font-serif-sc">{result.underneath}</p>
                </section>

                <div className="grid grid-cols-1 gap-6">
                  <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-[450ms] fill-mode-both">
                     <div className="flex items-center gap-4 opacity-[0.25] text-indigo-400"><span className="text-[7px] font-black uppercase tracking-[0.6em]">Echo</span></div>
                     <div className="bg-indigo-50/20 p-5 rounded-[20px] italic text-[11px] text-slate-500 leading-relaxed border border-indigo-500/5 font-serif-sc">
                      {result.echo}
                     </div>
                  </section>
                  <section className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-[600ms] fill-mode-both">
                     <div className="flex items-center gap-4 opacity-[0.25] text-purple-400"><span className="text-[7px] font-black uppercase tracking-[0.6em]">Mirror</span></div>
                     <div className="bg-purple-50/20 p-5 rounded-[20px] text-[11px] text-slate-500 leading-relaxed border border-purple-500/5 font-serif-sc">
                      {result.mirror}
                     </div>
                  </section>
                </div>

                <section className="pt-2 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-[800ms] fill-mode-both">
                  <div className="py-7 px-6 border border-slate-100/50 text-center bg-white/60 rounded-[24px] shadow-sm">
                    <h5 className="text-[7px] font-black uppercase tracking-[0.6em] text-slate-200 mb-3">Ritual</h5>
                    <p className="text-[14px] leading-relaxed text-slate-800 font-black tracking-tight font-serif-sc">{result.one_small_act}</p>
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
              <div className="shrink-0 text-center pt-4 opacity-10 mt-auto"><p className="text-[8px] tracking-[0.6em] uppercase font-black font-serif-sc">Tap to flip</p></div>
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
