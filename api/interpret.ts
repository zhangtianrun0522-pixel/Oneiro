import { IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';
import { interpretDream } from './_lib/services/geminiService.js';
import { getAstroInfo } from './_lib/astro.js';

function isConfigurationError(error: unknown): boolean {
  return error instanceof Error && /Missing .+ environment variable/.test(error.message);
}

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export default async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return; }
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  try {
    let body: any;
    if ((req as any).body !== undefined) {
      body = (req as any).body;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    }
    const { dreamText, userInfo } = body;
    if (!dreamText?.trim()) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'dreamText required' }));
      return;
    }

    const astroInfo = getAstroInfo();
    const result = await interpretDream(userInfo ?? {}, astroInfo, dreamText);

    // 存库后再响应（Vercel 函数在 res.end 后即终止，不能 fire-and-forget）
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error: dbError } = await supabase
        .from('dreams')
        .insert({ dream_text: dreamText, astro_info: astroInfo, result });
      if (dbError) console.error('Supabase insert error:', dbError);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error('Interpret error:', error);
    res.statusCode = isConfigurationError(error) ? 503 : 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : 'Internal server error'
    }));
  }
};
