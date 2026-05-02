import type { UserInfo, AstroInfo, DreamResult } from "../types";

export async function analyzeDream(
  userInfo: UserInfo,
  dreamText: string
): Promise<DreamResult> {
  const response = await fetch("/api/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dreamText, userInfo }),
  });

  if (!response.ok) {
    throw new Error(`Interpretation failed: ${response.statusText}`);
  }

  return response.json() as Promise<DreamResult>;
}

export async function generateDreamImage(prompt: string): Promise<string> {
  const response = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    throw new Error(`Image generation failed: ${response.statusText}`);
  }

  const data = await response.json() as { imageUrl: string };
  return data.imageUrl;
}
