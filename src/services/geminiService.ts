import { GoogleGenerativeAI } from "@google/generative-ai";
import { UserInfo, AstroInfo, DreamResult } from "../types";

// 1. 核心修正：在 Vite 项目中，必须使用 import.meta.env 读取环境变量
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// 2. 初始化 SDK (修正了调用方式)
const genAI = new GoogleGenerativeAI(API_KEY);

const DREAM_ORACLE_SYSTEM_INSTRUCTION = `
你是一名深谙潜意识解析、心理动力学与古典星象象征的“梦境占卜师”。你不仅是阐释者，更是灵魂的侧写师。

你的语调特征：
- 平静但锋利：像冷亮的手术刀，准确切中要害。
- 准确而不装懂：不使用模棱两合的占卜词汇，而是描述精准的心理机制。
- 懂你但不干涉：像一个站在阴影里的观察者，把用户“难以对自己承认的倾向”端到桌面上。

【输出要求】
返回一个合法 JSON 对象。
`;

export const analyzeDream = async (
  userInfo: UserInfo,
  astroInfo: AstroInfo,
  dreamText: string
): Promise<DreamResult> => {
  // 3. 修正模型名称：目前正式版建议使用 gemini-1.5-flash
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  const prompt = `
  【用户信息】
  - 昵称: ${userInfo.nickname}
  - 出生日期: ${userInfo.birthDate}

  【当前环境】
  - 月相: ${astroInfo.lunarPhase}

  【梦境原文】
  - 内容: ${dreamText}

  角色设定：${DREAM_ORACLE_SYSTEM_INSTRUCTION}

  请生成深度解析，返回 JSON 格式，包含字段：title, image, underneath, echo, mirror, one_small_act, image_prompt, omens, sound_config。
  `;

  // 4. 修正 generateContent 的调用结构
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  return JSON.parse(text || '{}') as DreamResult;
};

export const generateDreamImage = async (prompt: string): Promise<string> => {
  // 注意：Gemini 1.5 目前主要通过文本生成，如果你的模型支持图像生成请确保模型名正确
  // 这里暂时沿用你的逻辑，但修正了调用路径
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent(`根据以下描述生成图像提示词：${prompt}`);
  const response = await result.response;
  
  // 注意：纯前端调用 Gemini 生成图像目前有权限限制，
  // 如果报错，建议先注释掉图片生成部分测试文字功能。
  return ""; 
};
