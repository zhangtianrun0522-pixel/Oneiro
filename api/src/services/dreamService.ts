import { UserInfo, DreamResult } from '../types';

export const analyzeDream = async (userInfo: UserInfo, dreamText: string): Promise<DreamResult> => {
  const res = await fetch('/api/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dreamText, userInfo }),
  });
  if (!res.ok) throw new Error('API failed');
  return res.json();
};

export const generateDreamImage = async (prompt: string): Promise<string> => {
  const styleSuffix = 'artistic woodcut print, mystical symbolism, surreal tarot aesthetic, monochromatic, fine art paper texture';
  const encoded = encodeURIComponent(`${prompt}, ${styleSuffix}`);
  const seed = Math.floor(Math.random() * 1000000);
  return `https://pollinations.ai/p/${encoded}?width=600&height=800&seed=${seed}&nologo=true`;
};