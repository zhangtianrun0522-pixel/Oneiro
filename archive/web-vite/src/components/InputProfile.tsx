import React, { useState } from 'react';
import { DreamArchiveItem, UserInfo } from '../types';

interface Props {
  archiveItems?: DreamArchiveItem[];
  onComplete: (info: UserInfo) => void;
  onOpenArchive?: (item: DreamArchiveItem) => void;
  initialInfo?: UserInfo;
}

export const InputProfile: React.FC<Props> = ({ archiveItems = [], onComplete, onOpenArchive, initialInfo }) => {
  const [formData, setFormData] = useState<UserInfo>({
    nickname: initialInfo?.nickname || '',
    birthDate: initialInfo?.birthDate || '',
    birthTime: initialInfo?.birthTime || '',
    birthPlace: initialInfo?.birthPlace || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.nickname && formData.birthDate) {
      onComplete(formData);
    }
  };

  const inputClasses = "w-full bg-transparent border-b border-white/[0.02] py-3 px-1 text-slate-300 focus:text-white focus:border-white/10 outline-none transition-all duration-[1.2s] text-sm tracking-[0.3em] font-light placeholder:text-white/[0.03]";
  const labelClasses = "block text-[7px] uppercase tracking-[0.8em] text-slate-600 mb-2 font-black transition-colors group-focus-within:text-indigo-400/50";
  const hasSavedProfile = Boolean(initialInfo?.nickname && initialInfo?.birthDate);

  const useSavedProfile = () => {
    if (initialInfo?.nickname && initialInfo?.birthDate) {
      onComplete(initialInfo);
    }
  };

  return (
    <div className="relative w-full max-w-[21rem] mx-auto flex flex-col items-center">
      <div className="w-px h-8 bg-gradient-to-b from-white/10 to-transparent mb-6"></div>
      
      <div className="text-center mb-8">
        <h2 className="text-xl font-mystic text-white/45 mb-3 tracking-[0.35em]">今晚先留下一个名字</h2>
        <p className="mx-auto max-w-[17rem] text-[11px] leading-6 tracking-[0.18em] text-white/20">
          出生时间和地点可以稍后补充，先让梦境被看见。
        </p>
        <p className="text-[5px] tracking-[1em] text-white/5 uppercase font-black">Archive of Identity</p>
      </div>

      {hasSavedProfile && (
        <button
          type="button"
          onClick={useSavedProfile}
          className="mb-7 rounded-full border border-white/[0.05] px-5 py-2 text-[8px] font-black uppercase tracking-[0.55em] text-white/25 transition-all duration-700 hover:border-white/10 hover:text-white/55"
        >
          继续上次资料
        </button>
      )}
      
      <form onSubmit={handleSubmit} className="w-full space-y-7">
        <div className="relative group">
          <label className={labelClasses}>称呼 / Required</label>
          <input
            type="text"
            required
            autoComplete="off"
            className={inputClasses}
            value={formData.nickname}
            onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
            placeholder="NAME..."
          />
        </div>

        <div className="relative group">
          <label className={labelClasses}>出生日期 / Required</label>
          <input
            type="date"
            required
            className={`${inputClasses} [color-scheme:dark]`}
            value={formData.birthDate}
            onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-x-8">
          <div className="relative group">
            <label className={labelClasses}>时间 / Optional</label>
            <input
              type="time"
              className={`${inputClasses} [color-scheme:dark]`}
              value={formData.birthTime}
              onChange={(e) => setFormData({ ...formData, birthTime: e.target.value })}
            />
          </div>
          <div className="relative group">
            <label className={labelClasses}>地点 / Optional</label>
            <input
              type="text"
              autoComplete="off"
              className={inputClasses}
              value={formData.birthPlace}
              onChange={(e) => setFormData({ ...formData, birthPlace: e.target.value })}
              placeholder="PLACE..."
            />
          </div>
        </div>

        <div className="pt-8 flex flex-col items-center">
          <button
            type="submit"
            className="group relative px-12 py-4 transition-all duration-1000 disabled:opacity-30"
            disabled={!formData.nickname || !formData.birthDate}
          >
            <div className="absolute inset-0 border border-white/[0.03] rounded-full group-hover:border-white/10 group-hover:bg-white/[0.01] transition-all duration-1000"></div>
            <span className="relative z-10 text-white/20 font-bold tracking-[1em] text-[8px] uppercase group-hover:text-white/60 transition-colors duration-1000">
              开启仪式
            </span>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-px bg-indigo-500/0 rounded-full blur-[4px] group-hover:bg-indigo-400/40 group-hover:scale-[60] transition-all duration-[1.5s]"></div>
          </button>
        </div>
      </form>

      {archiveItems.length > 0 && (
        <div className="mt-10 w-full border-t border-white/[0.03] pt-6">
          <p className="mb-4 text-center text-[6px] font-black uppercase tracking-[0.8em] text-white/10">
            最近梦卡
          </p>
          <div className="space-y-2">
            {archiveItems.slice(0, 3).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenArchive?.(item)}
                className="w-full rounded-2xl border border-white/[0.03] bg-white/[0.015] px-4 py-3 text-left transition-all duration-700 hover:border-white/10 hover:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-mystic tracking-[0.2em] text-white/35">{item.result.title}</span>
                  <span className="shrink-0 text-[7px] tracking-[0.3em] text-white/10">
                    {new Date(item.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                  </span>
                </div>
                <p className="mt-1 truncate text-[10px] tracking-[0.16em] text-white/16">{item.dreamText}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
