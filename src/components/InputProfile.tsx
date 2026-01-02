import React, { useState } from 'react';
import { UserInfo } from '../types';

interface Props {
  onComplete: (info: UserInfo) => void;
}

export const InputProfile: React.FC<Props> = ({ onComplete }) => {
  const [formData, setFormData] = useState<UserInfo>({
    nickname: '',
    birthDate: '',
    birthTime: '',
    birthPlace: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.nickname && formData.birthDate) {
      onComplete(formData);
    }
  };

  const inputClasses = "w-full bg-transparent border-b border-white/[0.02] py-3 px-1 text-slate-300 focus:text-white focus:border-white/10 outline-none transition-all duration-[1.2s] text-sm tracking-[0.3em] font-light placeholder:text-white/[0.03]";
  const labelClasses = "block text-[7px] uppercase tracking-[0.8em] text-slate-600 mb-2 font-black transition-colors group-focus-within:text-indigo-400/50";

  return (
    <div className="relative w-full max-w-[19rem] mx-auto flex flex-col items-center">
      <div className="w-px h-10 bg-gradient-to-b from-white/10 to-transparent mb-8"></div>
      
      <div className="text-center mb-10">
        <h2 className="text-xl font-mystic text-white/40 mb-2 tracking-[0.4em]">叩响星辰之门</h2>
        <p className="text-[5px] tracking-[1em] text-white/5 uppercase font-black">Archive of Identity</p>
      </div>
      
      <form onSubmit={handleSubmit} className="w-full space-y-9">
        <div className="relative group">
          <label className={labelClasses}>灵之称呼 / Identity</label>
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
          <label className={labelClasses}>降生日期 / Genesis Date</label>
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
            <label className={labelClasses}>时辰 / Moment</label>
            <input
              type="time"
              className={`${inputClasses} [color-scheme:dark]`}
              value={formData.birthTime}
              onChange={(e) => setFormData({ ...formData, birthTime: e.target.value })}
            />
          </div>
          <div className="relative group">
            <label className={labelClasses}>籍贯 / Origin</label>
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
            className="group relative px-12 py-4 transition-all duration-1000"
          >
            <div className="absolute inset-0 border border-white/[0.03] rounded-full group-hover:border-white/10 group-hover:bg-white/[0.01] transition-all duration-1000"></div>
            <span className="relative z-10 text-white/20 font-bold tracking-[1em] text-[8px] uppercase group-hover:text-white/60 transition-colors duration-1000">
              开启仪式
            </span>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-px bg-indigo-500/0 rounded-full blur-[4px] group-hover:bg-indigo-400/40 group-hover:scale-[60] transition-all duration-[1.5s]"></div>
          </button>
        </div>
      </form>
    </div>
  );
};
