import OpenAI from "openai";
import { UserInfo, AstroInfo, DreamResult } from "../types";

// 读取 OpenAI API Key
const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true // 允许在浏览器端调用
});

const DREAM_ORACLE_SYSTEM_INSTRUCTION = `你是一名深谙潜意识解析与心理学的“梦境占卜师”。请严格返回 JSON 格式，包含字段：title, image, underneath, echo, mirror, one_small_act, image_prompt, omens, sound_config。`;

export const analyzeDream = async (
  userInfo: UserInfo,
  astroInfo: AstroInfo,
  dreamText: string
): Promise<DreamResult> => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // 使用性价比最高的模型，或者 gpt-4o
      messages: [
        { role: "system", content: DREAM_ORACLE_SYSTEM_INSTRUCTION },
        { role: "user", content: `用户${userInfo.nickname}, 梦境内容: ${dreamText}` }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content || "{}") as DreamResult;
  } catch (error) {
    console.error("OpenAI Error:", error);
    throw error;
  }
};

export const generateDreamImage = async (prompt: string): Promise<string> => {
  // 图片生成建议继续沿用 Pollinations AI，因为它免费且快。
  // 如果你想用 OpenAI 的 DALL-E 3，会非常贵（每张图约 $0.04 - $0.08）。
  const styleSuffix = "artistic woodcut print, mystical symbolism, tarot aesthetic";
  const encodedPrompt = encodeURIComponent(`${prompt}, ${styleSuffix}`);
  return `https://pollinations.ai/p/${encodedPrompt}?width=600&height=800&nologo=true`;
};
