import { IncomingMessage, ServerResponse } from 'http';

const DEFAULT_STYLE =
  'artistic woodcut print, elegant minimalist ink outlines, mystical symbolism, surreal tarot aesthetic, sophisticated monochromatic, fine art paper texture';
const DEFAULT_OPENAI_IMAGE_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-1.5';
const DEFAULT_OPENAI_IMAGE_SIZE = '1024x1536';
const DEFAULT_OPENAI_IMAGE_QUALITY = 'low';

type GenerateImageResult = {
  imageUrl: string;
  provider: string;
  model?: string;
};

type ImageResponseItem = {
  b64_json?: string;
  url?: string;
};

type ImageGenerationResponse = {
  data?: ImageResponseItem[];
  results?: ImageResponseItem[];
  url?: string;
  status?: string;
  error?: string;
  failure_reason?: string;
  msg?: string;
};

function buildStyledPrompt(prompt: string, style: string): string {
  return `${prompt}, ${style}`;
}

function buildPollinationsUrl(prompt: string, style: string): string {
  const fullPrompt = `${prompt}, ${style}`;
  const encodedPrompt = encodeURIComponent(fullPrompt);
  const seed = Math.floor(Math.random() * 1000000);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=600&height=800&seed=${seed}&nologo=true`;
}

function buildOpenAIImagesUrl(): string {
  const endpointUrl = process.env.OPENAI_IMAGE_ENDPOINT_URL?.trim();

  if (endpointUrl) {
    return endpointUrl;
  }

  const baseUrl = (process.env.OPENAI_IMAGE_BASE_URL || DEFAULT_OPENAI_IMAGE_BASE_URL).trim();
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  if (normalizedBaseUrl.endsWith('/images/generations') || normalizedBaseUrl.endsWith('/draw/completions')) {
    return normalizedBaseUrl;
  }

  return `${normalizedBaseUrl}/images/generations`;
}

function extractImageUrl(data: ImageGenerationResponse): string | null {
  const image = data.data?.[0] || data.results?.[0];

  if (image?.b64_json) {
    return `data:image/png;base64,${image.b64_json}`;
  }

  if (image?.url) {
    return image.url;
  }

  if (data.url) {
    return data.url;
  }

  return null;
}

function parseSseImageResponse(rawBody: string): ImageGenerationResponse {
  const events = rawBody
    .split(/\n\n+/)
    .map(event => event.trim())
    .filter(Boolean)
    .map(event => event
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.replace(/^data:\s*/, ''))
      .join('\n')
      .trim())
    .filter(event => event && event !== '[DONE]');

  let latest: ImageGenerationResponse | null = null;

  for (const event of events) {
    try {
      latest = JSON.parse(event) as ImageGenerationResponse;
    } catch {
      continue;
    }

    if (latest.status === 'failed') {
      throw new Error(latest.error || latest.failure_reason || latest.msg || 'Image generation failed');
    }

    if (extractImageUrl(latest)) {
      return latest;
    }
  }

  if (latest) {
    if (latest.status === 'failed') {
      throw new Error(latest.error || latest.failure_reason || latest.msg || 'Image generation failed');
    }

    return latest;
  }

  throw new Error('Image stream response did not include parseable events');
}

async function generateOpenAIImage(prompt: string, style: string): Promise<GenerateImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for OpenAI image generation');
  }

  const model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_OPENAI_IMAGE_MODEL;
  const size = process.env.OPENAI_IMAGE_SIZE || DEFAULT_OPENAI_IMAGE_SIZE;
  const quality = process.env.OPENAI_IMAGE_QUALITY || DEFAULT_OPENAI_IMAGE_QUALITY;

  const response = await fetch(buildOpenAIImagesUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: buildStyledPrompt(prompt, style),
      size,
      quality,
      n: 1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI image generation failed: ${response.status} ${errorText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('text/event-stream')
    ? parseSseImageResponse(await response.text())
    : await response.json() as ImageGenerationResponse;
  const imageUrl = extractImageUrl(data);

  if (imageUrl) {
    return {
      imageUrl,
      provider: 'openai',
      model,
    };
  }

  throw new Error(data.error || data.failure_reason || data.msg || 'OpenAI image response did not include image data');
}

async function generateImage(prompt: string, style: string): Promise<GenerateImageResult> {
  const provider = (process.env.IMAGE_PROVIDER || 'openai').trim().toLowerCase();

  if (provider === 'pollinations') {
    return {
      imageUrl: buildPollinationsUrl(prompt, style),
      provider: 'pollinations',
    };
  }

  if (provider !== 'openai') {
    throw new Error(`Unsupported IMAGE_PROVIDER: ${provider}`);
  }

  return generateOpenAIImage(prompt, style);
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

    const result = await generateImage(prompt.trim(), style?.trim() || DEFAULT_STYLE);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error('Image generation error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
};
