import type { UserInfo, AstroInfo, DreamResult } from "../types";

export async function analyzeDream(
  userInfo: UserInfo,
  astroInfo: AstroInfo,
  dreamText: string
): Promise<DreamResult> {
  const response = await fetch("/api/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dreamText, userInfo, astroInfo }),
  });

  if (!response.ok) {
    throw new Error(`Interpretation failed: ${response.statusText}`);
  }

  return response.json() as Promise<DreamResult>;
}

export async function generateDreamImage(prompt: string): Promise<string> {
  const styleSuffix = "artistic woodcut print, elegant minimalist ink outlines, mystical symbolism, surreal tarot aesthetic, sophisticated monochromatic, fine art paper texture";
  const fullPrompt = `${prompt}, ${styleSuffix}`;
  const encodedPrompt = encodeURIComponent(fullPrompt);
  const seed = Math.floor(Math.random() * 1000000);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=600&height=800&seed=${seed}&nologo=true`;
}
