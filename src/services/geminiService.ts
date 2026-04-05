import { GoogleGenerativeAI } from "@google/generative-ai";
import { UserInfo, AstroInfo, DreamResult } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const SYSTEM_PROMPT = `你是一名深谙潜意识解析、心理动力学与古典星象象征的"梦境占卜师"。
语调：平静但锋利，准确揭示隐秘倾向。
输出：必须严格返回纯JSON对象，不要包含任何markdown代码块标记，包含字段:
- title: string (梦境标题，2-4个汉字)
- image: string (梦境的诗意描述，1-2句话)
- underneath: string (潜意识解析，2-3句话)
- echo: string (情感共鸣，1-2句话)
- mirror: string (星象映照，结合用户星座，1-2句话)
- one_small_act: string (今日仪式行动，一个具体小行动)
- image_prompt: string (英文图像生成提示词，描述梦境氛围，50词以内)
- omens: { lucky_color: string (hex色值如#a3b899), lucky_color_name: string (颜色中文名), lucky_number: number, reason: string }
- sound_config: { theme: string (从liquid/dust/ember/wood/hollow/sterile/pursuit选一), drone_hz: number (40-120), pulse_rate: number (0.1-0.3), texture_intensity: number (0.1-0.5) }
`;

export const analyzeDream = async (
  userInfo: UserInfo,
  astroInfo: AstroInfo,
  dreamText: string
): Promise<DreamResult> => {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });

  const prompt = SYSTEM_PROMPT + `

用户信息:
- 昵称: ${userInfo.nickname}
- 出生日期: ${userInfo.birthDate}
- 出生时间: ${userInfo.birthTime || "未知"}
- 出生地点: ${userInfo.birthPlace || "未知"}

当前星象:
- 今日: ${astroInfo.todayDate}
- 月相: ${astroInfo.lunarPhase}
- 主要行星过境: ${astroInfo.majorTransits}

梦境描述:
${dreamText}

请直接返回纯JSON对象:`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const cleaned = text.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned) as DreamResult;
};

export const generateDreamImage = async (prompt: string): Promise<string> => {
  const styleSuffix = "artistic woodcut print, elegant minimalist ink outlines, mystical symbolism, surreal tarot aesthetic, sophisticated monochromatic, fine art paper texture";
  const fullPrompt = prompt + ", " + styleSuffix;
  const encodedPrompt = encodeURIComponent(fullPrompt);
  const seed = Math.floor(Math.random() * 1000000);
  return `https://pollinations.ai/p/${encodedPrompt}?width=600&height=800&seed=${seed}&nologo=true`;
};
