import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are "Oneiro" — a dream oracle blending Jungian psychology, astrology, and poetic intuition.
Respond in the same language the user writes in.
Return ONLY valid JSON with these exact fields:
{
  "title": "poetic 4-8 word dream title",
  "underneath": "2-3 sentences — subconscious layer",
  "echo": "2-3 sentences — astrological resonance",
  "mirror": "2-3 sentences — reality reflection",
  "one_small_act": "one ritual/action for today, under 20 words",
  "image_prompt": "English visual prompt, surreal and symbolic, under 30 words",
  "omens": { "lucky_color": "#hexcode", "lucky_color_name": "name", "lucky_number": 7, "reason": "one sentence" },
  "sound_config": { "theme": "liquid", "drone_hz": 60, "pulse_rate": 0.15, "texture_intensity": 0.3 }
}
For theme choose ONE of: liquid, dust, ember, wood, hollow, sterile, pursuit`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { dreamText, userInfo } = req.body;
  if (!dreamText) return res.status(400).json({ error: 'dreamText required' });
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userInfo?.nickname ? `User: ${userInfo.nickname}. Dream: ${dreamText}` : `Dream: ${dreamText}` }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Interpretation failed' });
  }
}