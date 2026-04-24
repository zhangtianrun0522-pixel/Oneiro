import { GoogleGenerativeAI } from '@google/generative-ai';
import { SYSTEM_PROMPT } from '../prompts/dream';

function buildUserContext(userInfo: any, astroInfo: any, dreamText: string): string {
  const parts: string[] = [];
  if (userInfo?.nickname) parts.push(`用户昵称：${userInfo.nickname}`);
  if (userInfo?.birthDate) parts.push(`出生日期：${userInfo.birthDate}`);
  if (userInfo?.birthTime) parts.push(`出生时间：${userInfo.birthTime}`);
  if (userInfo?.birthPlace) parts.push(`出生地点：${userInfo.birthPlace}`);
  if (astroInfo?.todayDate) parts.push(`今日日期：${astroInfo.todayDate}`);
  if (astroInfo?.lunarPhase) parts.push(`当前月相：${astroInfo.lunarPhase}`);
  if (astroInfo?.majorTransits) parts.push(`主要星象：${astroInfo.majorTransits}`);
  parts.push(`梦境内容：${dreamText}`);
  return parts.join('\n');
}

function parseResponse(text: string): any {
  const cleaned = text
    .replace(/^```json\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/```$/, '')
    .trim();
  return JSON.parse(cleaned);
}

export async function interpretDream(userInfo: any, astroInfo: any, dreamText: string): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY environment variable');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  });

  try {
    const result = await model.generateContent(buildUserContext(userInfo, astroInfo, dreamText));
    return parseResponse(result.response.text());
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse Gemini response as JSON: ${error.message}`);
    }
    throw new Error(`Gemini API error: ${error.message}`);
  }
}
