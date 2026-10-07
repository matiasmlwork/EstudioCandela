// Se dispara con cada respuesta nueva (trigger en la base → pg_net → esta función).
// Genera el PDF, lo guarda en Storage (`resumenes/{id}.pdf`), completa pdf_url y lo manda por mail a Candela.
//
// Configuración: variable de entorno o, si no está, fila en la tabla privada public.ajustes (clave en minúscula).
//   WEBHOOK_SECRET   lo manda el trigger en el header x-webhook-secret
//   ASSETS_URL       de donde se leen fuentes y miniaturas (bucket público `marca` o el sitio)
//   RESEND_API_KEY   clave de Resend (si falta, no se manda mail)
//   CANDELA_EMAIL    destinatario del mail (puede ser una lista separada por comas)
//   RESEND_FROM      remitente verificado en Resend (por defecto onboarding@resend.dev)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { armarPdf, Recursos } from './pdf.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let ajustes: Record<string, string> | null = null;
async function cargarAjustes() {
  const { data } = await sb.from('ajustes').select('clave, valor');
  ajustes = Object.fromEntries((data ?? []).map((x) => [x.clave, x.valor]));
}
const env = (k: string) => Deno.env.get(k) || ajustes?.[k.toLowerCase()] || '';

const bajar = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return new Uint8Array(await r.arrayBuffer());
};
let fuentes: Recursos['fuentes'] | null = null;
const cargarFuentes = async (ASSETS: string) => fuentes ??= {
  serif: await bajar(`${ASSETS}/fonts/CormorantGaramond-Regular.ttf`),
  serifMed: await bajar(`${ASSETS}/fonts/CormorantGaramond-Medium.ttf`),
  serifIt: await bajar(`${ASSETS}/fonts/CormorantGaramond-Italic.ttf`),
  sans: await bajar(`${ASSETS}/fonts/Montserrat-Light.ttf`),
  sansReg: await bajar(`${ASSETS}/fonts/Montserrat-Regular.ttf`),
};

async function procesar(id: string) {
  const ASSETS = (env('ASSETS_URL') || `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/marca`).replace(/\/$/, '');
  const { data: fila, error } = await sb.from('respuestas_habitar').select('*').eq('id', id).single();
  if (error || !fila) throw new Error(`No encontré la respuesta ${id}: ${error?.message}`);

  const pdf = await armarPdf(fila.respuestas ?? {}, new Date(fila.creado_en), {
    fuentes: await cargarFuentes(ASSETS),
    imagen: (k) => bajar(`${ASSETS}/pdf/${k}.${k === 'isotipo' ? 'png' : 'jpg'}`).catch(() => null),
    foto: async (ruta) => {
      const { data } = await sb.storage.from('referencias').download(ruta);
      return data ? new Uint8Array(await data.arrayBuffer()) : null;
    },
  });

  const ruta = `${id}.pdf`;
  const up = await sb.storage.from('resumenes').upload(ruta, pdf, { contentType: 'application/pdf', upsert: true });
  if (up.error) throw new Error(`No pude guardar el PDF: ${up.error.message}`);
  await sb.from('respuestas_habitar').update({ pdf_url: `resumenes/${ruta}` }).eq('id', id);

  const mail = await mandarMail(fila, pdf);
  return { id, pdf: `resumenes/${ruta}`, bytes: pdf.length, mail };
}

async function mandarMail(fila: any, pdf: Uint8Array) {
  const key = env('RESEND_API_KEY'), para = env('CANDELA_EMAIL');
  if (!key || !para) return 'sin configurar';
  const nombre = (fila.cliente_nombre || '').trim() || 'Sin nombre';
  const zona = (fila.cliente_zona || '').trim();
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `habitar-${fila.id}` },
    body: JSON.stringify({
      from: env('RESEND_FROM') || 'Formulario Habitar <onboarding@resend.dev>',
      to: para.split(',').map((s) => s.trim()).filter(Boolean),
      subject: `Nuevo formulario: ${nombre}`,
      html: `<div style="font-family:Georgia,serif;color:#383A34;background:#F6F2EC;padding:32px">
        <p style="font-size:20px;margin:0 0 8px">Nuevo formulario: ${esc(nombre)}</p>
        ${zona ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#6B6258;margin:0 0 16px">${esc(zona)}</p>` : ''}
        <p style="font-family:Arial,sans-serif;font-size:13px;color:#6B6258;margin:0">Te adjunto el resumen en PDF.</p></div>`,
      attachments: [{ filename: `Habitar - ${nombre.replace(/[\\/:*?"<>|]/g, '')}.pdf`, content: encodeBase64(pdf) }],
    }),
  });
  return r.ok ? 'enviado' : `error ${r.status}: ${await r.text()}`;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 });
  await cargarAjustes();
  const secreto = env('WEBHOOK_SECRET');
  if (!secreto || req.headers.get('x-webhook-secret') !== secreto) return new Response('No autorizado', { status: 401 });

  const body = await req.json().catch(() => ({}));
  try {
    // { record: {...} } desde el trigger · { id } para regenerar uno · { pendientes: true } para los que no tienen PDF
    let ids: string[] = [];
    if (body.pendientes) {
      const { data } = await sb.from('respuestas_habitar').select('id').is('pdf_url', null).order('creado_en').limit(20);
      ids = (data ?? []).map((x) => x.id);
    } else {
      const id = body.record?.id ?? body.id;
      if (id) ids = [id];
    }
    const hechos = [];
    for (const id of ids) hechos.push(await procesar(id));
    return Response.json({ ok: true, hechos });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
