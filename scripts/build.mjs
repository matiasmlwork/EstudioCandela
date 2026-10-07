// Arma public/index.html a partir de src/template.html (sin dependencias; lo corre Vercel en cada deploy).
// - Reemplaza __ASSETS__ por las rutas a /img/*.webp
// - Agrega <head> con viewport y metadatos para la vista previa de WhatsApp
// - Suma config.js + envio.js (window.ccEnviar) y la precarga de la pantalla siguiente
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = join(dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.SITE_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL && 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL)
  || (process.env.VERCEL_URL && 'https://' + process.env.VERCEL_URL)
  || '';

const tpl = readFileSync(join(R, 'src/template.html'), 'utf8');
const assets = Object.fromEntries(readdirSync(join(R, 'src/assets')).map(f => {
  const k = f.replace(/\.[^.]+$/, '');
  return [k, `/img/${k}.webp`];
}));
if (!tpl.includes('__ASSETS__')) throw new Error('template sin __ASSETS__');

const titulo = 'Conozcamos tu forma de habitar';
const desc = 'Unas preguntas para conocerte mejor y diseñar un espacio que se sienta tuyo. Candela Chicco · Interiorismo & Diseño.';
const head = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F6F2EC">
<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_AR">
<meta property="og:site_name" content="Candela Chicco · Interiorismo & Diseño">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${host}/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Isotipo de Candela Chicco">
${host ? `<meta property="og:url" content="${host}/">\n` : ''}<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="/pdf/isotipo.png">
<link rel="preload" as="image" href="/img/isotipo.webp">
`;

// Carga diferida: cada foto se pide cuando se dibuja su pantalla; además, en reposo se adelanta la siguiente.
const precarga = `<script>
(function(){
  var hechas={};
  function pedir(k){var u=IMG[k]; if(!u||hechas[u])return; hechas[u]=1; var i=new Image(); i.decoding='async'; i.src=u}
  function deScreen(s){ if(!s)return;
    if(s.type==='pairs') PARES.forEach(function(p){pedir(p.a.img);pedir(p.b.img)});
    (s.opts||[]).forEach(function(o){ if(o&&o.img) pedir(o.img) });
  }
  var idle=window.requestIdleCallback||function(f){return setTimeout(f,300)};
  new MutationObserver(function(){ idle(function(){ deScreen(SCREENS[idx+1]); deScreen(SCREENS[idx+2]) }) })
    .observe(document.getElementById('stage'),{childList:true});
})();
</script>`;

// El template no tiene <body>: el navegador lo abre solo al llegar al primer <div>.
const html = head
  + tpl.replace('__ASSETS__', JSON.stringify(assets))
       .replace('<script>', '<script src="/config.js"></script>\n<script src="/envio.js"></script>\n<script>')
  + '\n' + precarga + '\n';

writeFileSync(join(R, 'public/index.html'), html);

if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  writeFileSync(join(R, 'public/config.js'),
    `window.CC_CONFIG=${JSON.stringify({ supabaseUrl: process.env.SUPABASE_URL, supabaseKey: process.env.SUPABASE_ANON_KEY })};\n`);
}
console.log('index.html listo', host || '(sin SITE_URL: og:image relativa)');
