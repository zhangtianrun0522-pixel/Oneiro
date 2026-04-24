import { IncomingMessage, ServerResponse } from 'http';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.statusCode = 200; res.end(); return; }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('dreams')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data || []));
    } catch (error) {
      console.error('History GET error:', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      let body: any;
      if ((req as any).body !== undefined) {
        body = (req as any).body;
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk);
        body = JSON.parse(Buffer.concat(chunks).toString());
      }
      const { dreamText, astroInfo, result } = body;
      if (!dreamText || !result) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'dreamText and result required' }));
        return;
      }
      const { data, error } = await supabase
        .from('dreams')
        .insert({ dream_text: dreamText, astro_info: astroInfo || null, result })
        .select()
        .single();
      if (error) throw error;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
    } catch (error) {
      console.error('History POST error:', error);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  res.statusCode = 405;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
