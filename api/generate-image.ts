import { IncomingMessage, ServerResponse } from 'http';

const DEFAULT_STYLE =
  'artistic woodcut print, elegant minimalist ink outlines, mystical symbolism, surreal tarot aesthetic, sophisticated monochromatic, fine art paper texture';

function buildPollinationsUrl(prompt: string, style: string): string {
  const fullPrompt = `${prompt}, ${style}`;
  const encodedPrompt = encodeURIComponent(fullPrompt);
  const seed = Math.floor(Math.random() * 1000000);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=600&height=800&seed=${seed}&nologo=true`;
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  if ((req as any).body !== undefined) return (req as any).body;

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString();
  return rawBody ? JSON.parse(rawBody) : {};
}

export default async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    const { prompt, style } = await readJsonBody(req);

    if (!prompt?.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'prompt required' }));
      return;
    }

    const imageUrl = buildPollinationsUrl(prompt, style?.trim() || DEFAULT_STYLE);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ imageUrl, provider: 'pollinations' }));
  } catch (error) {
    console.error('Image generation error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
};
