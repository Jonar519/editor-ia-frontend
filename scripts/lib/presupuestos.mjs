// Medición de presupuestos sobre el manifiesto de Vite (dist/.vite/manifest.json). Todo en KiB
// comprimidos con gzip (lo que viaja por la red con la compresión más común).
//
//   primeraCargaJs  la entrada (index.html) y todo lo que importa ESTÁTICAMENTE: lo que se descarga
//                   antes de mostrar cualquier vista.
//   jsPorRol        primera carga + las vistas de los grupos que el rol puede abrir (src/vistas/<grupo>/)
//                   con sus importaciones estáticas, sin contar dos veces un archivo compartido.
//   maxChunkJs      el archivo .js más grande.
//   cssTotal        todo el CSS del build.
//   diferidas       librerías que se cargan bajo demanda DESDE una vista (import() de un envoltorio en
//                   src/diferidas/, o los lenguajes de @codemirror/language-data). No cuentan en el JS del
//                   rol: se miden aparte, con lo que traen además de la primera carga. "porChunk" mide
//                   cada chunk por separado y compara el mayor (un lenguaje a la vez).

/**
 * @typedef {{ file: string, src?: string, isEntry?: boolean, isDynamicEntry?: boolean, imports?: string[], dynamicImports?: string[], css?: string[] }} EntradaManifiesto
 * @typedef {Record<string, EntradaManifiesto>} Manifiesto
 * @typedef {{ patron: string, porChunk?: boolean }} Diferida
 * @typedef {{ kib: number, chunks: number, detalle: string }} MedidaDiferida
 * @typedef {{ primeraCargaJs: number, jsPorRol: Record<string, number>, maxChunkJs: { archivo: string, kib: number }, cssTotal: number, diferidas: Record<string, MedidaDiferida> }} Medicion
 * @typedef {{ primeraCargaJs: number | null, jsPorRol: Record<string, number | null>, maxChunkJs: number | null, cssTotal: number | null, diferidas?: Record<string, number | null> }} Topes
 */

/** Archivos .js que trae una entrada del manifiesto con sus importaciones estáticas (transitivas). */
function estaticos(/** @type {Manifiesto} */ m, /** @type {string} */ clave, /** @type {Set<string>} */ acumulado) {
  const e = m[clave];
  if (!e || acumulado.has(e.file)) return acumulado;
  acumulado.add(e.file);
  for (const i of e.imports ?? []) estaticos(m, i, acumulado);
  return acumulado;
}

const KIB = 1024;
const redondear = (/** @type {number} */ bytes) => Math.round((bytes / KIB) * 100) / 100;

/**
 * @param {Manifiesto} manifiesto
 * @param {(archivo: string) => number} bytesGzip tamaño comprimido de un archivo de dist/
 * @param {Record<string, string[]>} roles rol → grupos de vistas que puede abrir
 * @param {Record<string, Diferida>} [diferidas] nombre → patrón (expresión regular) sobre el origen del chunk
 * @returns {Medicion}
 */
export function medir(manifiesto, bytesGzip, roles, diferidas = {}) {
  const entrada = Object.entries(manifiesto).find(([, e]) => e.isEntry);
  if (!entrada) throw new Error('el manifiesto no tiene entrada (isEntry)');
  const primera = estaticos(manifiesto, entrada[0], new Set());
  const suma = (/** @type {Set<string>} */ archivos) => [...archivos].reduce((t, a) => t + bytesGzip(a), 0);

  /** @type {Record<string, number>} */
  const jsPorRol = {};
  for (const [rol, grupos] of Object.entries(roles)) {
    const archivos = new Set(primera);
    for (const [clave, e] of Object.entries(manifiesto)) {
      const grupo = /^src\/vistas\/([^/]+)\//.exec(e.src ?? clave)?.[1];
      if (e.isDynamicEntry && grupo && grupos.includes(grupo)) estaticos(manifiesto, clave, archivos);
    }
    jsPorRol[rol] = redondear(suma(archivos));
  }

  const js = [...new Set(Object.values(manifiesto).map((e) => e.file))].filter((f) => f.endsWith('.js'));
  const mayor = js.map((f) => ({ archivo: f, kib: redondear(bytesGzip(f)) })).sort((a, b) => b.kib - a.kib)[0] ?? { archivo: '', kib: 0 };
  const css = new Set(Object.values(manifiesto).flatMap((e) => e.css ?? []));

  // Quién importa dinámicamente a quién: una diferida llega cuando su importador YA está cargado.
  /** @type {Map<string, string[]>} */
  const padres = new Map();
  for (const [clave, e] of Object.entries(manifiesto)) {
    for (const d of e.dynamicImports ?? []) padres.set(d, [...(padres.get(d) ?? []), clave]);
  }
  /**
   * Lo que ya está descargado cuando se pide `clave`: la primera carga y, subiendo por sus importadores
   * dinámicos hasta la raíz, el archivo de cada importador con sus importaciones estáticas.
   * @param {string} clave
   */
  const yaCargado = (clave, vistos = new Set(), acumulado = new Set(primera)) => {
    for (const p of padres.get(clave) ?? []) {
      if (vistos.has(p)) continue;
      vistos.add(p);
      estaticos(manifiesto, p, acumulado);
      yaCargado(p, vistos, acumulado);
    }
    return acumulado;
  };

  /** @type {Record<string, MedidaDiferida>} */
  const medidasDiferidas = {};
  for (const [nombre, d] of Object.entries(diferidas)) {
    const patron = new RegExp(d.patron);
    const claves = Object.entries(manifiesto)
      .filter(([clave, e]) => e.isDynamicEntry && !/^src\/vistas\//.test(e.src ?? clave) && patron.test(e.src ?? clave))
      .map(([clave]) => clave);
    // Lo que trae ADEMÁS de lo que ya estaba cargado al pedirla (lo compartido no se descarga dos veces).
    const propio = (/** @type {string[]} */ ks) => {
      const archivos = new Set();
      const base = new Set();
      for (const k of ks) {
        estaticos(manifiesto, k, archivos);
        for (const a of yaCargado(k)) base.add(a);
      }
      return [...archivos].filter((a) => !base.has(a)).reduce((t, a) => t + bytesGzip(a), 0);
    };
    if (d.porChunk) {
      const cada = claves.map((k) => ({ clave: k, bytes: propio([k]) })).sort((a, b) => b.bytes - a.bytes);
      const masGrande = cada[0];
      medidasDiferidas[nombre] = {
        kib: redondear(masGrande?.bytes ?? 0),
        chunks: cada.length,
        detalle: masGrande ? `el mayor: ${masGrande.clave}` : 'sin chunks',
      };
    } else {
      medidasDiferidas[nombre] = { kib: redondear(propio(claves)), chunks: claves.length, detalle: claves.length ? claves.join(', ') : 'sin chunks' };
    }
  }
  return { primeraCargaJs: redondear(suma(primera)), jsPorRol, maxChunkJs: mayor, cssTotal: redondear(suma(css)), diferidas: medidasDiferidas };
}

/**
 * Compara contra los topes. Un tope en null está PENDIENTE de confirmación: se informa, no falla.
 * @param {Medicion} m
 * @param {Topes} topes
 * @returns {{ nombre: string, medido: number, tope: number | null, excedido: boolean }[]}
 */
export function comparar(m, topes) {
  const filas = [
    { nombre: 'JS de primera carga', medido: m.primeraCargaJs, tope: topes.primeraCargaJs },
    ...Object.entries(m.jsPorRol).map(([rol, kib]) => ({ nombre: `JS del rol ${rol}`, medido: kib, tope: topes.jsPorRol[rol] ?? null })),
    { nombre: `Chunk JS más grande (${m.maxChunkJs.archivo})`, medido: m.maxChunkJs.kib, tope: topes.maxChunkJs },
    { nombre: 'CSS total', medido: m.cssTotal, tope: topes.cssTotal },
    ...Object.entries(m.diferidas).map(([n, d]) => ({
      nombre: `Diferida ${n} (${String(d.chunks)} chunk(s); ${d.detalle})`,
      medido: d.kib,
      tope: topes.diferidas?.[n] ?? null,
    })),
  ];
  return filas.map((f) => ({ ...f, excedido: f.tope !== null && f.medido > f.tope }));
}
