// PDF de resumen del formulario "Conozcamos tu forma de habitar".
// A4 vertical · fondo crema · Cormorant Garamond para títulos, Montserrat Light para textos.
import {
  PDFDocument, PDFFont, PDFImage, PDFPage, rgb, RGB,
  pushGraphicsState, popGraphicsState, rectangle, clip, endPath,
} from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import {
  Respuestas, PALETAS, PARES, ACTIVIDADES, MATERIALES, SUPERFICIES, LUZ_ACTUAL, MOMENTO, TEMPERATURA,
  VEGETACION, MODALIDAD, INVERSION, ESCALAS, vacio, capital, legible, frecuenciaVisitas, fechaLarga,
  fechaObjetivo, personas,
} from './textos.ts';

export type Recursos = {
  fuentes: Record<'serif' | 'serifMed' | 'serifIt' | 'sans' | 'sansReg', Uint8Array>;
  /** Imagen del formulario por clave (isotipo, par1-a, madera…) */
  imagen: (clave: string) => Promise<Uint8Array | null>;
  /** Foto subida por el cliente (ruta dentro del bucket `referencias`) */
  foto: (ruta: string) => Promise<Uint8Array | null>;
};

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  crema: hex('#F6F2EC'), papel: hex('#FBF8F3'), carbon: hex('#383A34'), madera: hex('#8A6F55'), maderaOsc: hex('#5E4B39'),
  suave: hex('#6B6258'), tenue: hex('#A39A8E'), linea: hex('#DDD5C8'), piedra: hex('#D8D2C6'), arena: hex('#C9BFAF'),
};

const PW = 595.28, PH = 841.89, M = 62, W = PW - 2 * M;
const TOP = 58, BOTTOM = 64;

export async function armarPdf(r: Respuestas, creado: Date, rec: Recursos): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const nombre = (r.cliente_nombre || '').trim() || 'Sin nombre';
  doc.setTitle(`Conozcamos tu forma de habitar · ${nombre}`);
  doc.setAuthor('Candela Chicco · Interiorismo & Diseño');
  doc.setLanguage('es-AR');

  // Sin ligaduras ni alternativas contextuales: pdf-lib calcula mal su ancho y deja huecos ("q ue", "fi nes").
  const sinLig = { features: { liga: false, clig: false, calt: false, dlig: false, kern: false } };
  const F = {
    serif: await doc.embedFont(rec.fuentes.serif, sinLig),
    serifMed: await doc.embedFont(rec.fuentes.serifMed, sinLig),
    serifIt: await doc.embedFont(rec.fuentes.serifIt, sinLig),
    sans: await doc.embedFont(rec.fuentes.sans, sinLig),
    sansReg: await doc.embedFont(rec.fuentes.sansReg, sinLig),
  };
  // Los textos libres del cliente pueden traer emojis u otros signos que la fuente no tiene: se omiten.
  const cs = new Map<PDFFont, Set<number>>();
  const limpio = (s: string, f: PDFFont) => {
    if (!cs.has(f)) cs.set(f, new Set(f.getCharacterSet()));
    const ok = cs.get(f)!;
    return Array.from(String(s ?? '').normalize('NFC').replace(/\r/g, '').replace(/\t/g, ' '))
      .filter((ch) => ch === '\n' || ok.has(ch.codePointAt(0)!)).join('');
  };

  const cacheImg = new Map<string, PDFImage | null>();
  const embed = async (bytes: Uint8Array | null): Promise<PDFImage | null> => {
    if (!bytes || bytes.length < 8) return null;
    try {
      return bytes[0] === 0x89 && bytes[1] === 0x50 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } catch { return null }
  };
  const img = async (clave: string) => {
    if (!cacheImg.has(clave)) cacheImg.set(clave, await embed(await rec.imagen(clave).catch(() => null)));
    return cacheImg.get(clave)!;
  };
  const foto = async (ruta: string | null | undefined) => (ruta ? embed(await rec.foto(ruta).catch(() => null)) : null);

  /* ---------- Página y cursor (y medido desde arriba) ---------- */
  let page!: PDFPage, y = 0;
  const paginas: PDFPage[] = [];
  const nueva = () => {
    page = doc.addPage([PW, PH]);
    page.drawRectangle({ x: 0, y: 0, width: PW, height: PH, color: C.crema });
    paginas.push(page); y = TOP;
  };
  const Y = (top: number) => PH - top;
  const lugar = (h: number) => { if (y + h > PH - BOTTOM) nueva() };

  /* ---------- Texto ---------- */
  const ancho = (s: string, f: PDFFont, size: number, track = 0) => f.widthOfTextAtSize(s, size) + track * Math.max(0, s.length - 1);
  function lineas(s: string, f: PDFFont, size: number, max: number): string[] {
    const out: string[] = [];
    for (const par of limpio(s, f).split('\n')) {
      let cur = '';
      for (const w of par.split(/\s+/).filter(Boolean)) {
        const t = cur ? cur + ' ' + w : w;
        if (ancho(t, f, size) <= max || !cur) cur = t; else { out.push(cur); cur = w }
      }
      out.push(cur);
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
  }
  function escribir(s: string, o: { x?: number; top: number; f: PDFFont; size: number; color?: RGB; max?: number; lh?: number; align?: 'left' | 'center'; opacity?: number }) {
    const max = o.max ?? W, lh = o.lh ?? o.size * 1.5, x0 = o.x ?? M;
    const ls = lineas(s, o.f, o.size, max);
    ls.forEach((l, i) => {
      const x = o.align === 'center' ? x0 + (max - ancho(l, o.f, o.size)) / 2 : x0;
      page.drawText(l, { x, y: Y(o.top + o.size + i * lh), size: o.size, font: o.f, color: o.color ?? C.carbon, opacity: o.opacity });
    });
    return ls.length ? (ls.length - 1) * lh + o.size * 1.35 : 0;
  }
  // Mayúsculas espaciadas (rótulos)
  function rotulo(s: string, o: { x?: number; top: number; size?: number; color?: RGB; track?: number; align?: 'left' | 'center'; max?: number; f?: PDFFont }) {
    const f = o.f ?? F.sansReg, size = o.size ?? 6.8, track = o.track ?? size * 0.28, t = limpio(s.toUpperCase(), f);
    let x = o.x ?? M;
    if (o.align === 'center') x += ((o.max ?? W) - ancho(t, f, size, track)) / 2;
    for (const ch of t) {
      page.drawText(ch, { x, y: Y(o.top + size), size, font: f, color: o.color ?? C.madera });
      x += f.widthOfTextAtSize(ch, size) + track;
    }
    return size * 1.4;
  }

  /* ---------- Formas ---------- */
  function cubrir(im: PDFImage, x: number, top: number, w: number, h: number) {
    const k = Math.max(w / im.width, h / im.height), iw = im.width * k, ih = im.height * k;
    page.pushOperators(pushGraphicsState(), rectangle(x, Y(top + h), w, h), clip(), endPath());
    page.drawImage(im, { x: x - (iw - w) / 2, y: Y(top + h) - (ih - h) / 2, width: iw, height: ih });
    page.pushOperators(popGraphicsState());
  }
  function hueco(x: number, top: number, w: number, h: number, texto: string) {
    page.drawRectangle({ x, y: Y(top + h), width: w, height: h, color: C.piedra });
    escribir(texto, { x: x + 6, top: top + h / 2 - 8, f: F.sans, size: 6.5, color: C.suave, max: w - 12, align: 'center' });
  }
  function pastilla(x: number, top: number, w: number, h: number, borde: RGB) {
    const r = h / 2;
    const d = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    page.drawSvgPath(d, { x, y: Y(top), borderColor: borde, borderWidth: 0.7 });
  }
  function rueda(cx: number, cyTop: number, rad: number, t: string[], opacity = 1) {
    // Círculo en tres porciones, como en el formulario
    t.forEach((col, i) => {
      const a0 = (-90 + i * 120) * Math.PI / 180, a1 = (-90 + (i + 1) * 120) * Math.PI / 180;
      const p = (a: number) => `${(rad * Math.cos(a)).toFixed(2)} ${(rad * Math.sin(a)).toFixed(2)}`;
      page.drawSvgPath(`M 0 0 L ${p(a0)} A ${rad} ${rad} 0 0 1 ${p(a1)} Z`, { x: cx, y: Y(cyTop), color: hex(col), opacity });
    });
    page.drawCircle({ x: cx, y: Y(cyTop), size: rad, borderColor: C.linea, borderWidth: 0.6, opacity: 0, borderOpacity: opacity });
  }

  /* ---------- Bloques ---------- */
  function seccion(num: string, titulo: string) {
    lugar(96);
    if (y > TOP + 1) y += 16;
    rotulo(num, { top: y, color: C.madera });
    y += 12;
    escribir(titulo, { top: y, f: F.serif, size: 20, color: C.carbon, lh: 23 });
    y += 28;
    page.drawLine({ start: { x: M, y: Y(y) }, end: { x: M + 28, y: Y(y) }, thickness: 0.7, color: C.madera });
    y += 12;
  }
  function dato(label: string, valor: string, o: { x?: number; max?: number; avanzar?: boolean } = {}) {
    if (vacio(valor)) return 0;
    const x = o.x ?? M, max = o.max ?? W;
    let h = rotulo(label, { x, top: y, color: C.suave, size: 6.3 }) + 3;
    h += escribir(valor, { x, top: y + h, f: F.sans, size: 10, max, lh: 15.5 });
    if (o.avanzar !== false) y += h + 10;
    return h;
  }
  function columnas(items: [string, string][], n = 3) {
    const xs = items.filter(([, v]) => !vacio(v));
    if (!xs.length) return;
    const gap = 18, cw = (W - gap * (n - 1)) / n;
    for (let i = 0; i < xs.length; i += n) {
      const fila = xs.slice(i, i + n);
      const hs = fila.map(([l, v]) => 6.3 * 1.4 + 3 + lineas(v, F.sans, 10, cw).length * 15.5);
      lugar(Math.max(...hs));
      const h = Math.max(...fila.map(([l, v], k) => dato(l, v, { x: M + k * (cw + gap), max: cw, avanzar: false })));
      y += h + 10;
    }
  }
  function cita(label: string, texto: string) {
    if (vacio(texto)) return;
    texto = limpio(texto, F.serifIt).trim();
    const ls = lineas(`“${texto}”`, F.serifIt, 13.5, W - 16);
    lugar(30 + Math.min(ls.length, 6) * 19);
    if (label) { y += rotulo(label, { top: y, color: C.suave, size: 6.3 }) + 6 }
    // corta en páginas si el texto es largo
    for (let i = 0; i < ls.length; i++) {
      if (y + 19 > PH - BOTTOM) { nueva() }
      page.drawText(ls[i], { x: M + 14, y: Y(y + 13.5), size: 13.5, font: F.serifIt, color: C.carbon });
      page.drawLine({ start: { x: M, y: Y(y - 2) }, end: { x: M, y: Y(y + 17) }, thickness: 0.8, color: C.arena });
      y += 19;
    }
    y += 8;
  }
  async function fotosConComentario(items: any[], etiqueta: string) {
    // Dos por fila: miniatura + comentario entre comillas
    const gap = 20, cw = (W - gap) / 2, th = 78, tw = cw - th - 12;
    for (let k = 0; k < items.length; k += 2) {
      const fila = items.slice(k, k + 2);
      const hs = fila.map((it) => Math.max(th, lineas(`“${(it?.comentario || '').trim()}”`, F.serifIt, 11.5, tw).length * 15 + 16));
      const h = Math.max(...hs);
      lugar(h + 10);
      for (const [j, it] of fila.entries()) {
        const x = M + j * (cw + gap), im = await foto(it?.foto), com = (it?.comentario || '').trim();
        if (im) cubrir(im, x, y, th, th); else hueco(x, y, th, th, it?.archivo ? `Foto no disponible\n${it.archivo}` : 'Foto no disponible');
        rotulo(etiqueta, { x: x + th + 12, top: y + 2, color: C.suave, size: 6 });
        if (com) escribir(`“${com}”`, { x: x + th + 12, top: y + 14, f: F.serifIt, size: 11.5, max: tw, lh: 15 });
        else escribir('Sin comentario', { x: x + th + 12, top: y + 14, f: F.sans, size: 8.5, color: C.tenue, max: tw });
      }
      y += h + 12;
    }
  }

  /* ================= PORTADA ================= */
  nueva();
  const iso = await img('isotipo');
  if (iso) { const w = 58, h = iso.height * (w / iso.width); page.drawImage(iso, { x: (PW - w) / 2, y: Y(118 + h), width: w, height: h }); }
  rotulo('Candela Chicco', { top: 222, f: F.serif, size: 13, track: 4.2, color: C.carbon, align: 'center' });
  rotulo('Interiorismo & Diseño', { top: 242, size: 6, track: 2, color: C.suave, align: 'center' });

  rotulo('Conozcamos tu forma de habitar', { top: 352, size: 7, track: 2.4, color: C.madera, align: 'center' });
  let top = 378;
  top += escribir(nombre, { top, f: F.serif, size: 42, lh: 44, align: 'center' });
  const zona = (r.cliente_zona || '').trim();
  if (zona) top += escribir(zona, { top: top + 6, f: F.sans, size: 11, color: C.suave, align: 'center' }) + 6;
  page.drawLine({ start: { x: PW / 2 - 18, y: Y(top + 30) }, end: { x: PW / 2 + 18, y: Y(top + 30) }, thickness: 0.7, color: C.madera });

  const portada: [string, string][] = [
    ['Ambientes', (r.ambientes || []).join(' · ')],
    ['Fecha', fechaLarga(creado)],
    ['Modalidad', legible(MODALIDAD, r.modalidad)],
  ].filter(([, v]) => !vacio(v)) as [string, string][];
  {
    const gap = 22, n = portada.length, cw = (W - gap * (n - 1)) / Math.max(n, 1), t0 = 600;
    portada.forEach(([l, v], k) => {
      const x = M + k * (cw + gap);
      rotulo(l, { x, top: t0, size: 6.3, color: C.suave, align: 'center', max: cw });
      escribir(v, { x, top: t0 + 14, f: F.serif, size: 15, lh: 18, max: cw, align: 'center' });
    });
  }
  rotulo('Resumen para el estudio', { top: PH - 76, size: 5.8, track: 1.8, color: C.tenue, align: 'center' });

  /* ================= CONTENIDO ================= */
  nueva();

  // 1 · Quiénes viven y actividades
  {
    const ps = personas(r), masc = (r.habitantes?.mascotas || '').trim();
    const acts = (r.actividades || []).map((v: string) => legible(ACTIVIDADES, v)).join(' · ');
    const visitas = typeof r.frecuencia_visitas === 'number' ? frecuenciaVisitas(r.frecuencia_visitas) : '';
    if (ps.length || masc || acts || r.dia_tipico || visitas) {
      seccion('01 · Tu forma de habitar', 'Quiénes viven y qué pasa ahí');
      columnas([['Quiénes', ps.join('\n')], ['Mascotas', masc], ['Visitas', visitas]], 3);
      columnas([['Actividades', acts]], 1);
      cita('Un día normal', r.dia_tipico || '');
    }
  }

  // 2 · Sensaciones y deslizadores
  {
    const sens = (r.sensaciones || []).map((v: string) => capital(v));
    const escalas = ESCALAS.filter((e) => typeof r[e.id] === 'number');
    if (sens.length || escalas.length) {
      seccion('02 · Qué querés sentir', 'Sensaciones');
      if (sens.length) {
        lugar(50);
        let x = M;
        for (const s of sens) {
          const w = ancho(s, F.serif, 17) + 34;
          pastilla(x, y, w, 30, C.arena);
          page.drawText(limpio(s, F.serif), { x: x + 17, y: Y(y + 20), size: 17, font: F.serif, color: C.maderaOsc });
          x += w + 10;
        }
        y += 52;
      }
      for (const e of escalas) {
        lugar(46);
        const v = Math.max(0, Math.min(100, r[e.id])) / 100;
        escribir(e.ends[0], { top: y, f: F.serif, size: 13 });
        page.drawText(limpio(e.ends[1], F.serif), { x: M + W - ancho(e.ends[1], F.serif, 13), y: Y(y + 13), size: 13, font: F.serif, color: C.carbon });
        const ty = y + 28;
        page.drawRectangle({ x: M, y: Y(ty) - 1, width: W, height: 2, color: C.piedra });
        page.drawRectangle({ x: M, y: Y(ty) - 1, width: W * v, height: 2, color: C.madera });
        page.drawCircle({ x: M + W * v, y: Y(ty), size: 6.5, color: C.madera, borderColor: C.crema, borderWidth: 2 });
        y += 50;
      }
    }
  }

  // 3 · Esta o esta
  {
    const elegidos = (r.estilo_pares || []).map((lado: string, i: number) => (lado === 'a' || lado === 'b') ? { i, lado } : null).filter(Boolean) as { i: number; lado: 'a' | 'b' }[];
    if (elegidos.length) {
      seccion('03 · Estilo', 'Lo que eligió en “esta o esta”');
      const n = 4, gap = 10, cw = (W - gap * (n - 1)) / n, ch = cw * 0.9;
      for (let k = 0; k < elegidos.length; k += n) {
        lugar(ch + 34);
        for (const [j, e] of elegidos.slice(k, k + n).entries()) {
          const x = M + j * (cw + gap), im = await img(`par${e.i + 1}-${e.lado}`), label = PARES[e.i]?.[e.lado] ?? '';
          if (im) cubrir(im, x, y, cw, ch); else hueco(x, y, cw, ch, label);
          escribir(label, { x, top: y + ch + 5, f: F.sans, size: 8, max: cw, lh: 10 });
        }
        y += ch + 26;
      }
    }
  }

  // 4 · Referencias
  {
    const refs = (r.referencias_fotos || []).filter((it: any) => it);
    if (refs.length) {
      seccion('04 · Referencias', 'Imágenes que la inspiran');
      await fotosConComentario(refs, 'Lo que le gusta');
    }
  }

  // 5 · Paleta
  {
    const pick = (r.paleta_preferida || []).filter((v: string) => PALETAS[v]);
    const desc = (r.colores_descartados || []).filter((v: string) => PALETAS[v]);
    if (pick.length || desc.length) {
      seccion('05 · Colores', 'Paleta');
      // Una sola fila: elegidas a la izquierda, descartadas (tachadas) a la derecha
      const rad = 24, paso = 78, todos = [...pick.map((v: string) => [v, false]), ...desc.map((v: string) => [v, true])] as [string, boolean][];
      lugar(rad * 2 + 46);
      if (pick.length) rotulo('Elegida', { top: y, size: 6.3, color: C.suave });
      if (desc.length) rotulo('Descartada', { x: M + pick.length * paso + (pick.length ? 24 : 0), top: y, size: 6.3, color: C.suave });
      y += 16;
      todos.forEach(([v, fuera], k) => {
        const p = PALETAS[v], cx = M + rad + k * paso + (fuera && pick.length ? 24 : 0), cy = y + rad;
        rueda(cx, cy, rad, p.t, fuera ? 0.32 : 1);
        if (fuera) page.drawLine({ start: { x: cx - rad * 0.9, y: Y(cy + rad * 0.9) }, end: { x: cx + rad * 0.9, y: Y(cy - rad * 0.9) }, thickness: 0.9, color: C.madera });
        const lw = ancho(p.label, F.sans, 8.5), lx = cx - lw / 2, ly = cy + rad + 8;
        page.drawText(limpio(p.label, F.sans), { x: lx, y: Y(ly + 8.5), size: 8.5, font: fuera ? F.sans : F.sansReg, color: fuera ? C.madera : C.carbon });
        if (fuera) page.drawLine({ start: { x: lx - 1, y: Y(ly + 5.4) }, end: { x: lx + lw + 1, y: Y(ly + 5.4) }, thickness: 0.6, color: C.madera });
      });
      y += rad * 2 + 30;
    }
  }

  // 6 · Materiales y superficies (una tira: materiales y, al final, la superficie elegida)
  {
    const mats = (r.materiales || []).filter((v: string) => MATERIALES[v]).map((v: string) => ({ img: v, label: MATERIALES[v] }));
    const sup = SUPERFICIES[r.superficies];
    if (mats.length || sup) {
      seccion('06 · Materiales', 'Materiales y superficies');
      const items = [...mats, ...(sup ? [{ img: sup.img, label: `Superficie: ${sup.label.toLowerCase()}` }] : [])];
      const n = 7, gap = 9, cw = (W - gap * (n - 1)) / n;
      for (const [k, it] of items.entries()) {
        if (k % n === 0) { if (k) y += cw + 30; lugar(cw + 30) }
        const x = M + (k % n) * (cw + gap) + (sup && k === items.length - 1 && k % n ? 10 : 0);
        const im = await img(it.img);
        if (im) cubrir(im, x, y, cw, cw); else hueco(x, y, cw, cw, it.label);
        escribir(it.label, { x, top: y + cw + 5, f: F.sans, size: 8, max: cw, lh: 10 });
      }
      y += cw + 34;
    }
  }

  // 7 · Luz
  {
    const items: [string, string][] = [
      ['Luz actual', legible(LUZ_ACTUAL, r.luz_actual)],
      ['Momento del día', legible(MOMENTO, r.momento_del_dia)],
      ['Temperatura de luz', legible(TEMPERATURA, r.temperatura_luz)],
    ];
    if (items.some(([, v]) => v)) { seccion('07 · Luz', 'La luz'); columnas(items, 3) }
  }

  // 8 · Objetos y gustos
  {
    const imp = (r.imprescindibles || []).join(' · '), libre = (r.tiempo_libre || []).join(' · ');
    const veg = legible(VEGETACION, r.vegetacion), cons = (r.conservar || '').trim();
    const consFotos = (r.conservar_fotos || []).filter((it: any) => it);
    if (imp || libre || veg || cons || consFotos.length) {
      seccion('08 · Objetos y gustos', 'Lo que tiene que tener su lugar');
      columnas([['Vegetación', veg], ['Imprescindibles', imp], ['Tiempo libre', libre]], 3);
      if (cons) cita('Qué conservar', cons);
      if (consFotos.length) {
        if (!cons) { lugar(30); y += rotulo('Qué conservar', { top: y, size: 6.3, color: C.suave }) + 8 }
        await fotosConComentario(consFotos, 'Qué es');
      }
    }
  }

  // 9 · Lo que no
  if (!vacio(r.molestias) || !vacio(r.evitar)) {
    seccion('09 · Lo que no', 'Lo que molesta y lo que no quiere ver');
    cita('Lo que más le molesta hoy', r.molestias || '');
    cita('Lo que no quiere ver en el diseño', r.evitar || '');
  }

  // 10 · Lo práctico
  {
    const items: [string, string][] = [
      ['Fecha objetivo', fechaObjetivo(r.fecha_objetivo)],
      ['Inversión estimada', legible(INVERSION, r.inversion)],
    ];
    if (items.some(([, v]) => v)) { seccion('10 · Lo práctico', 'Tiempos e inversión'); columnas(items, 3) }
  }

  // Pie de página en las páginas de contenido
  paginas.slice(1).forEach((p, i) => {
    page = p;
    rotulo('Candela Chicco', { top: PH - 44, f: F.serif, size: 8, track: 2.4, color: C.tenue });
    const t = `${limpio(nombre, F.sans)} · ${i + 2}`;
    p.drawText(t, { x: PW - M - ancho(t, F.sans, 7.5), y: Y(PH - 44 + 7.5), size: 7.5, font: F.sans, color: C.tenue });
  });

  return await doc.save();
}
