import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../prompts/dream';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface UserInfo {
  nickname?: string;
  birthDate?: string;
  birthTime?: string;
  birthPlace?: string;
}

interface AstroInfo {
  todayDate?: string;
  lunarPhase?: string;
  majorTransits?: string;
}

export async function interpretDream(
  userInfo: UserInfo,
  astroInfo: AstroInfo,
  dreamText: string
) {
  const parts: string[] = [];
  if (userInfo?.nickname) parts.push(`用户昵称：${userInfo.nickname}`);
  if (userInfo?.birthDate) parts.push(`出生日期：${userInfo.birthDate}`);
  if (userInfo?.birthTime) parts.push(`出生时间：${userInfo.birthTime}`);
  if (userInfo?.birthPlace) parts.push(`出生地点：${userInfo.birthPlace}`);
  if (astroInfo?.todayDate) parts.push(`今日日期：${astroInfo.todayDate}`);
  if (astroInfo?.lunarPhase) parts.push(`当前月相：${astroInfo.lunarPhase}`);
  if (astroInfo?.majorTransits) parts.push(`主要星象：${astroInfo.majorTransits}`);
  parts.push(`梦境内容：${dreamText}`);

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: parts.join('\n') }],
  });

  const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
  const cleaned = text
    .replace(/^```json\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/```$/, '')
    .trim();

  return JSON.parse(cleaned);
}
