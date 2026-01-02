import { GoogleGenAI, Type } from "@google/genai";
import { UserInfo, AstroInfo, DreamResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const DREAM_ORACLE_SYSTEM_INSTRUCTION = `
你是一名深谙潜意识解析、心理动力学与古典星象象征的“梦境占卜师”。
返回一个包含 title, image, underneath, echo, mirror, one_small_act, image_prompt, omens, sound_config 的 JSON 对象。
`;

export const analyzeDream = async (userInfo: UserInfo, astroInfo: AstroInfo, dreamText: string): Promise<DreamResult> => {
  const prompt = `用户:${userInfo.nickname}, 梦境:${dreamText}`;
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction: DREAM_ORACLE_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          image: { type: Type.STRING },
          underneath: { type: Type.STRING },
          echo: { type: Type.STRING },
          mirror: { type: Type.STRING },
          one_small_act: { type: Type.STRING },
          image_prompt: { type: Type.STRING },
          omens: {
            type: Type.OBJECT,
            properties: {
              lucky_color: { type: Type.STRING },
              lucky_color_name: { type: Type.STRING },
              lucky_number: { type: Type.INTEGER },
              reason: { type: Type.STRING },
            },
            required: ["lucky_color", "lucky_color_name", "lucky_number", "reason"],
          },
          sound_config: {
            type: Type.OBJECT,
            properties: {
              theme: { type: Type.STRING },
              drone_hz: { type: Type.NUMBER },
              pulse_rate: { type: Type.NUMBER },
              texture_intensity: { type: Type.NUMBER },
            },
            required: ["theme", "drone_hz", "pulse_rate", "texture_intensity"],
          },
        },
        required: ["title", "image", "underneath", "echo", "mirror", "one_small_act", "image_prompt", "omens", "sound_config"],
      },
    },
  });
  return JSON.parse(response.text || '{}') as DreamResult;
};

export const generateDreamImage = async (prompt: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: `artistic woodcut tarot style, ${prompt}` }] },
    config: { imageConfig: { aspectRatio: "3:4" } },
  });
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
  }
  throw new Error("Image failed");
};
