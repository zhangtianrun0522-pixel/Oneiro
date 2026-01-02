import React, { useEffect, useRef, useState } from 'react';
import { DreamResult } from '../types';

interface Props {
  config: DreamResult['sound_config'];
  active: boolean;
}

const THEME_SCALES: Record<string, { baseFreq: number; intervals: number[]; type: 'sine' | 'triangle' }> = {
  liquid: { baseFreq: 174.61, intervals: [1, 1.125, 1.25, 1.5, 1.667, 2], type: 'sine' },
  dust: { baseFreq: 146.83, intervals: [1, 1.2, 1.333, 1.5, 1.8, 2], type: 'triangle' },
  ember: { baseFreq: 196.00, intervals: [1, 1.125, 1.25, 1.5, 1.667, 2], type: 'sine' },
  wood: { baseFreq: 164.81, intervals: [1, 1.2, 1.333, 1.5, 1.778, 2], type: 'triangle' },
  hollow: { baseFreq: 261.63, intervals: [1, 1.125, 1.333, 1.5, 1.875, 2], type: 'sine' },
  sterile: { baseFreq: 220.00, intervals: [1, 1.06, 1.26, 1.5, 1.6, 2], type: 'sine' },
  pursuit: { baseFreq: 123.47, intervals: [1, 1.067, 1.333, 1.414, 1.6, 2], type: 'triangle' },
};

export const DreamSoundscape: React.FC<Props> = ({ config, active }) => {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const droneOscRef = useRef<OscillatorNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!audioCtxRef.current && active) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const masterGain = ctx.createGain();
      const ana = ctx.createAnalyser();
      ana.fftSize = 512;
      masterGain.connect(ana);
      ana.connect(ctx.destination);
      masterGain.gain.setValueAtTime(0, ctx.currentTime);
      audioCtxRef.current = ctx;
      masterGainRef.current = masterGain;
      setAnalyser(ana);
    }
  }, [active]);

  useEffect(() => {
    if (!audioCtxRef.current || !masterGainRef.current || !active) return;
    const ctx = audioCtxRef.current;
    const master = masterGainRef.current;
    const theme = THEME_SCALES[config.theme] || THEME_SCALES.liquid;

    if (!droneOscRef.current) {
      const drone = ctx.createOscillator();
      const droneGain = ctx.createGain();
      drone.type = 'sine';
      drone.frequency.setValueAtTime(theme.baseFreq / 2, ctx.currentTime);
      droneGain.gain.setValueAtTime(0.05, ctx.currentTime);
      drone.connect(droneGain);
      droneGain.connect(master);
      drone.start();
      droneOscRef.current = drone;
    }

    const playPad = (freq: number, duration: number, volume: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = theme.type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(volume, ctx.currentTime + duration * 0.3);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      osc.connect(g);
      g.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    };

    const interval = setInterval(() => {
      playPad(theme.baseFreq, 8, 0.04);
    }, 10000);

    return () => {
      clearInterval(interval);
      if (droneOscRef.current) {
        droneOscRef.current.stop();
        droneOscRef.current = null;
      }
    };
  }, [config, active]);

  useEffect(() => {
    if (masterGainRef.current && audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime;
      masterGainRef.current.gain.linearRampToValueAtTime(active ? 0.3 : 0, now + 1);
    }
  }, [active]);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let frame: number;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      frame = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      for (let i = 0; i < dataArray.length; i += 16) {
        const v = dataArray[i] / 255;
        const angle = (i / dataArray.length) * Math.PI * 2 + Date.now() * 0.0001;
        const dist = 100 + v * 150;
        const x = centerX + Math.cos(angle) * dist;
        const y = centerY + Math.sin(angle) * dist;
        ctx.fillStyle = `rgba(165, 180, 252, ${v * 0.3})`;
        ctx.beginPath();
        ctx.arc(x, y, v * 2 + 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [analyser, active]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <canvas ref={canvasRef} width={1200} height={800} className="w-full h-full opacity-20 blur-[2px]" />
    </div>
  );
};
