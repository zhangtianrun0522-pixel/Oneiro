import { GoogleGenAI, Type } from "@google/genai";
import { UserInfo, AstroInfo, DreamResult } from "../types";

// 严格按照 SDK 指南使用 process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const DREAM_ORACLE_SYSTEM_INSTRUCTION = `
你是一名深谙潜意识解析、心理动力学与古典星象象征的“梦境占卜师”。你不仅是阐释者，更是灵魂的侧写师。

你的语调特征：
- 平静但锋利：像冷亮的手术刀，准确切中要害。
- 准确而不装懂：不使用模棱两合的占卜词汇，而是描述精准的心理机制。
- 懂你但不干涉：像一个站在阴影里的观察者，把用户“难以对自己承认的倾向”端到桌面上。

【核心板块逻辑】
1. "title": 梦境的标题。精炼、深邃，必须控制在 2-8 个汉字之间，严禁超过 8 个汉字。
2. "image": 必须完全、逐字逐句复述用户输入的原始梦境内容。
3. "underneath": 梦境底层的象征意义与潜意识动力。
4. "echo": 连接用户信息揭示隐秘倾向。
5. "mirror": 梦境在现实中的心理场景映射。
6. "omens": 包含基于梦境能量补偿的“幸运颜色”与“幸运数字”。
   - lucky_color: 一个具有仪式感的十六进制颜色代码。
   - lucky_color_name: 给颜色一个极具文学美感的中文名字（如：月之灰、冷杉绿、余烬红）。
   - reason: 简单解释为何这个颜色/数字能平衡或指引当前的能量状态。

【输出要求】
返回一个合法 JSON 对象。
`;

export const analyzeDream = async (
  userInfo: UserInfo,
  astroInfo: AstroInfo,
  dreamText: string
): Promise<DreamResult> => {
  const prompt = `
  【用户信息】
  - 昵称: ${userInfo.nickname}
  - 出生日期: ${userInfo.birthDate}

  【当前环境】
  - 月相: ${astroInfo.lunarPhase}

  【梦境原文】
  - 内容: ${dreamText}

  请生成深度解析。
  注意：
  - title 必须极具设计感，字数严格控制在 2-8 个汉字以内，不要带标点。
  - omens 里的 lucky_color 必须是准确的十六进制代码。
  - omens 里的 lucky_number 应该是 1-99 之间的数字，与梦境意象有共时性联系。
  `;

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
    contents: {
      parts: [
        { text: `artistic premium woodcut print illustration, minimalist elegant black ink outlines, ${prompt}, surreal metaphor, mystical symbolism, limited sophisticated monochromatic or duotone color palette, flat graphical fine art style, handmade aged paper texture, centered balanced composition, occult tarot aesthetic` },
      ],
    },
    config: {
      imageConfig: { aspectRatio: "3:4" },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Image failed");
};
