// Traducción de los valores internos del formulario a texto legible.
// Mantener alineado con SCREENS / PARES / PALETAS de src/template.html.

export type Respuestas = Record<string, any>;

export const PALETAS: Record<string, { label: string; t: [string, string, string] }> = {
  beiges: { label: 'Beiges', t: ['#F1E8DA', '#DCCDB6', '#C4B096'] },
  arenas: { label: 'Arenas', t: ['#E6DCCB', '#CFC0A6', '#B7A486'] },
  salvia_oliva: { label: 'Salvia y oliva', t: ['#C9CDB8', '#9DA585', '#6E7556'] },
  terracotas: { label: 'Terracotas', t: ['#E3B79B', '#C27E5C', '#96553A'] },
  maderas: { label: 'Maderas', t: ['#D2B48F', '#A57E58', '#6E4E34'] },
  oscuros: { label: 'Tonos oscuros', t: ['#5A5650', '#3C3A36', '#26241F'] },
};

export const PARES: { a: string; b: string }[] = [
  { a: 'Despojado', b: 'Con capas y objetos' },
  { a: 'Madera clara', b: 'Madera oscura' },
  { a: 'Líneas rectas', b: 'Formas curvas' },
  { a: 'Clásico', b: 'Contemporáneo' },
  { a: 'Rústico cálido', b: 'Refinado' },
  { a: 'Todo integrado', b: 'Ambientes separados' },
  { a: 'Monocromático', b: 'Con contraste' },
  { a: 'Artesanal', b: 'Pulido e industrial' },
];

export const ACTIVIDADES: Record<string, string> = {
  cocinar: 'Cocinar', recibir: 'Recibir', trabajar: 'Trabajar', descansar: 'Descansar', entrenar: 'Entrenar', jugar: 'Jugar',
};
export const MATERIALES: Record<string, string> = {
  madera: 'Madera', piedra: 'Piedra', hormigon: 'Hormigón', ratan: 'Ratán', cuero: 'Cuero', textiles: 'Textiles',
};
export const SUPERFICIES: Record<string, { label: string; img: string }> = {
  lisas: { label: 'Lisas', img: 'sup_lisa' }, con_textura: { label: 'Con textura', img: 'sup_textura' },
};
export const LUZ_ACTUAL: Record<string, string> = {
  mucha_natural: 'Mucha luz natural', suave: 'Luz suave', poca: 'Poca luz', cambiante: 'Cambia mucho',
};
export const MOMENTO: Record<string, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
export const TEMPERATURA: Record<string, string> = { calida: 'Cálida', neutra: 'Neutra', fria: 'Fría' };
export const VEGETACION: Record<string, string> = {
  ninguna: 'Ninguna — prefiere sin plantas', alguna: 'Alguna — un par, en lugares puntuales', mucha: 'Mucha — que el verde se sienta',
};
export const MODALIDAD: Record<string, string> = { todo_junto: 'Todo junto', por_etapas: 'Por etapas' };
export const INVERSION: Record<string, string> = {
  hasta_5k: 'Hasta USD 5.000', '5k_15k': 'USD 5.000 a 15.000', '15k_30k': 'USD 15.000 a 30.000',
  mas_30k: 'Más de USD 30.000', conversarlo: 'Prefiere conversarlo',
};
const ATAJOS_FECHA: Record<string, string> = {
  lo_antes_posible: 'Lo antes posible', en_unos_meses: 'En unos meses', sin_apuro: 'Sin apuro',
};
export const ESCALAS: { id: string; ends: [string, string] }[] = [
  { id: 'escala_lleno', ends: ['Más vacío', 'Más lleno'] },
  { id: 'escala_temperatura', ends: ['Más cálido', 'Más fresco'] },
  { id: 'escala_epoca', ends: ['Más clásico', 'Más actual'] },
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const vacio = (v: unknown) =>
  v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);

export const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Valor interno → texto. Si no está en el diccionario, se humaniza: "por_etapas" → "Por etapas". */
export function legible(dic: Record<string, string>, v: unknown): string {
  if (vacio(v)) return '';
  const s = String(v);
  return dic[s] ?? capital(s.replace(/_/g, ' '));
}

export function frecuenciaVisitas(v: number) {
  return v < 18 ? 'Casi nunca' : v < 42 ? 'De vez en cuando' : v < 66 ? 'Bastante seguido' : v < 88 ? 'Muy seguido' : 'Todo el tiempo';
}

export function fechaLarga(d: Date) {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function fechaObjetivo(v: unknown): string {
  if (vacio(v)) return '';
  const s = String(v);
  if (ATAJOS_FECHA[s]) return ATAJOS_FECHA[s];
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s);
  if (m) return `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}`;
  return legible({}, s);
}

export function personas(r: Respuestas): string[] {
  const p = r.habitantes?.personas ?? [];
  return p.filter((x: any) => (x?.nombre || '').trim())
    .map((x: any) => (x.nombre.trim() + (String(x.edad || '').trim() ? `, ${String(x.edad).trim()} años` : '')));
}
