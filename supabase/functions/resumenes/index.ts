// Página privada de Candela: lista los formularios recibidos con un link firmado a cada PDF.
// Se accede con la clave `panel_key` de public.ajustes (va en el link secreto: /candela/#k=...).
//   POST { k }                       → lista
//   POST { k, accion: 'visto', id }  → marca el formulario como visto
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (d: unknown, status = 200) => Response.json(d, { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const body = await req.json().catch(() => ({}));

  const { data: aj } = await sb.from('ajustes').select('valor').eq('clave', 'panel_key').single();
  if (!aj?.valor || typeof body.k !== 'string' || body.k !== aj.valor) return json({ error: 'No autorizado' }, 401);

  if (body.accion === 'visto' && typeof body.id === 'string') {
    await sb.from('respuestas_habitar').update({ estado: 'visto' }).eq('id', body.id).eq('estado', 'nuevo');
    return json({ ok: true });
  }

  const { data, error } = await sb.from('respuestas_habitar')
    .select('id, creado_en, cliente_nombre, cliente_zona, estado, pdf_url')
    .order('creado_en', { ascending: false }).limit(300);
  if (error) return json({ error: error.message }, 500);

  const rutas = (data ?? []).filter((r) => r.pdf_url).map((r) => r.pdf_url.replace(/^resumenes\//, ''));
  const firmadas = rutas.length
    ? (await sb.storage.from('resumenes').createSignedUrls(rutas, 60 * 60)).data ?? []
    : [];
  const url = new Map(firmadas.map((f) => [f.path, f.signedUrl]));

  return json({
    respuestas: (data ?? []).map((r) => ({
      id: r.id, creado_en: r.creado_en, nombre: r.cliente_nombre, zona: r.cliente_zona, estado: r.estado,
      pdf: r.pdf_url ? url.get(r.pdf_url.replace(/^resumenes\//, '')) ?? null : null,
    })),
  });
});
