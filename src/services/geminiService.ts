import OpenAI from "openai"; // 必须是导入 openai
import { UserInfo, AstroInfo, DreamResult } from "../types";

// 读取 OpenAI 专用的环境变量
const apiKey = import.meta.env.VITE_OPENAI_API_KEY; 

const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true 
});

export const analyzeDream = async (
  userInfo: UserInfo,
  astroInfo: AstroInfo,
  dreamText: string
): Promise<DreamResult> => {
  // 这里必须是 openai.chat.completions.create
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", 
    messages: [
      { role: "system", content: "你是一名梦境占卜师..." },
      { role: "user", content: dreamText }
    ],
    response_format: { type: "json_object" }
  });

  return JSON.parse(response.choices[0].message.content || "{}");
};

export const generateDreamImage = async (prompt: string): Promise<string> => {
  const encoded = encodeURIComponent(prompt + ", woodcut style");
  return `https://pollinations.ai/p/${encoded}?width=600&height=800&nologo=true`;
};
