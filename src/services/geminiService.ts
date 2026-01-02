import OpenAI from "openai";
import { UserInfo, AstroInfo, DreamResult } from "../types";

// 1. 读取 Vercel 环境变量
const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true 
});

const SYSTEM_PROMPT = `你是一名深谙潜意识解析、心理动力学与古典星象象征的“梦境占卜师”。
语调：平静但锋利，准确揭示隐秘倾向。
输出：必须严格返回 JSON 格式，包含字段: title, image, underneath, echo, mirror, one_small_act, image_prompt, omens, sound_config。`;

export const analyzeDream = async (
  userInfo: UserInfo,
  astroInfo: AstroInfo,
  dreamText: string
): Promise<DreamResult> => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `用户: ${userInfo.nickname}, 梦内容: ${dreamText}` }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content || "{}") as DreamResult;
  } catch (error) {
    console.error("OpenAI 接口报错:", error);
    throw error;
  }
};

/**
 * 修复后的图片生成函数，确保变量完整初始化
 */
export const generateDreamImage = async (prompt: string): Promise<string> => {
  try {
    // 强制增加艺术风格修饰词，确保画面符合美学
    const styleSuffix = "artistic woodcut print, elegant minimalist ink outlines, mystical symbolism, surreal tarot aesthetic, sophisticated monochromatic, fine art paper texture";
    const fullPrompt = `${prompt}, ${styleSuffix}`;
    
    // 对提示词进行编码
    const encodedPrompt = encodeURIComponent(fullPrompt);
    
    // 生成随机种子
    const seed = Math.floor(Math.random() * 1000000);
    
    // 返回 Pollinations AI 图片链接
    return `https://pollinations.ai/p/${encodedPrompt}?width=600&height=800&seed=${seed}&nologo=true`;
  } catch (error) {
    console.error("生成图片失败:", error);
    return "";
  }
};
