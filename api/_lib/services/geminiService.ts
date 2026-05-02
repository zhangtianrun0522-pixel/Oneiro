import { GoogleGenerativeAI } from '@google/generative-ai';
import { SYSTEM_PROMPT } from '../prompts/dream.js';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

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

async function interpretWithGemini(userInfo: any, astroInfo: any, dreamText: string): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY environment variable');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent(buildUserContext(userInfo, astroInfo, dreamText));
  return parseResponse(result.response.text());
}

async function interpretWithDeepSeek(userInfo: any, astroInfo: any, dreamText: string): Promise<any> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('Missing DEEPSEEK_API_KEY environment variable');

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, '');
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserContext(userInfo, astroInfo, dreamText) },
      ],
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek response did not include message content');

  return parseResponse(content);
}

export async function interpretDream(userInfo: any, astroInfo: any, dreamText: string): Promise<any> {
  const provider = (process.env.INTERPRET_PROVIDER || 'gemini').trim().toLowerCase();

  try {
    if (provider === 'deepseek') return await interpretWithDeepSeek(userInfo, astroInfo, dreamText);
    if (provider === 'gemini') return await interpretWithGemini(userInfo, astroInfo, dreamText);
    throw new Error(`Unsupported INTERPRET_PROVIDER: ${provider}`);
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse ${provider} response as JSON: ${error.message}`);
    }
    throw new Error(`${provider} interpretation error: ${error.message}`);
  }
}
