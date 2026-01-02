import { GoogleGenerativeAI } from "@google/generative-ai";
import { UserInfo, AstroInfo, DreamResult } from "../types";

// 1. 读取 Vercel 环境变量
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// 初始化 Gemini SDK
const genAI = new GoogleGenerativeAI(API_KEY || "");

const DREAM_ORACLE_SYSTEM_INSTRUCTION = `
你是一名深谙潜意识解析与古典星象象征的“梦境占卜师”。
你必须严格返回 JSON 格式。
【重要】image_prompt 字段必须包含梦境的核心视觉意象，用英文书写，以便于绘画。
JSON 结构：title, image, underneath, echo, mirror, one_small_act, image_prompt, omens, sound_config。
`;

export const analyzeDream = async (
  userInfo: UserInfo,
  astroInfo: AstroInfo,
  dreamText: string
): Promise<DreamResult> => {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const prompt = `
      用户信息：昵称 ${userInfo.nickname}, 生日 ${userInfo.birthDate}
      环境月相：${astroInfo.lunarPhase}
      梦境原文：${dreamText}
      
      指令：${DREAM_ORACLE_SYSTEM_INSTRUCTION}
    `;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        responseMimeType: "application/json",
      },
    });

    const response = await result.response;
    let text = response.text();
    // 清理 Markdown 标签
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    return JSON.parse(text) as DreamResult;
  } catch (error) {
    console.error("解析梦境失败:", error);
    throw error;
  }
};

/**
 * 方案 A：利用 Pollinations AI 生成精美的艺术图片
 * 这种方式不需要额外的 API Key，且生成速度极快，适合前端直接展示
 */
export const generateDreamImage = async (prompt: string): Promise<string> => {
  try {
    // 强制增加艺术风格修饰词，确保画面符合 Oneiro 的神秘主义美学
    const styleSuffix
