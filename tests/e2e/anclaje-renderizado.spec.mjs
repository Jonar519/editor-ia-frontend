// Anclar comentarios desde la vista renderizada (cierre del bloque O), con el API y el WebSocket simulados
// (colaboracion.mjs). La selección se hace con la API de Range del navegador (lo mismo que deja el ratón o
// el dedo). Se comprueba el tramo de la FUENTE que resulta, con el ancla resuelta en el documento del
// servidor, las marcas en la vista (también dentro del código resaltado) e "Ir al texto"; y, con semilla,
// documentos y selecciones al azar.
import * as Y from 'yjs';
import { resolverAncla } from '../../src/comentarios/anclas.js';
import { LUCIA, abrirDocumento, comentariosSimulados, relevo } from './colaboracion.mjs';
import { axeEstable, expect, test } from './fixtures.mjs';

/** @typedef {import('@playwright/test').Page} Page */

const vista = (/** @type {Page} */ page) => page.getByRole('region', { name: 'Documento Guía de prueba' });
const ayuda = (/** @type {Page} */ page) => page.locator('#comentar-ayuda');

/**
 * Selecciona en la vista desde el carácter `i` del primer nodo de texto que contiene `desdeTexto` hasta el
 * carácter `j` del nodo que contiene `hastaTexto` (como lo haría el ratón).
 * @param {Page} page
 */
function seleccionar(page, /** @type {string} */ desdeTexto, /** @type {number} */ i, /** @type {string} */ hastaTexto, /** @type {number} */ j) {
  return page.evaluate(
    ({ desdeTexto, i, hastaTexto, j }) => {
      const raiz = document.querySelector('.vista-renderizada');
      if (!raiz) throw new Error('sin vista');
      const textos = [];
      const c = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      for (let t = c.nextNode(); t; t = c.nextNode()) textos.push(t);
      const a = textos.find((t) => t.textContent?.includes(desdeTexto));
      const b = textos.find((t) => t.textContent?.includes(hastaTexto));
      if (!a || !b) throw new Error('texto no encontrado');
      const r = document.createRange();
      r.setStart(a, (a.textContent ?? '').indexOf(desdeTexto) + i);
      r.setEnd(b, (b.textContent ?? '').indexOf(hastaTexto) + j);
      const sel = document.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      return r.toString();
    },
    { desdeTexto, i, hastaTexto, j },
  );
}

const MD = '# Guía\n\nTexto con **negrita** y `codigo`.\n\n| a | b |\n|---|---|\n| celda uno | 2 |\n\n```js\nconst valor = 1;\n```\n';

test('desde la vista renderizada: negrita, selección cruzada, código resaltado y tabla dan el tramo exacto de la fuente; marcas e "Ir al texto"', async ({ page }) => {
  const servidor = relevo();
  servidor.doc.getText('contenido').insert(0, MD);
  const comentarios = comentariosSimulados(servidor);
  await comentarios.registrar(page, LUCIA, 'lector');
  await abrirDocumento(page, LUCIA, servidor, { vista: 'leer', rol: 'lector' });
  await expect(vista(page).locator('code.hljs .hljs-keyword')).toHaveText('const');
  // La ayuda dice cómo comentar con el teclado, y la región la anuncia (aria-describedby).
  await expect(vista(page)).toHaveAttribute('aria-describedby', 'ayuda-lectura');
  await expect(page.locator('#ayuda-lectura')).toHaveText('Para comentar, selecciona un tramo con el ratón o el dedo. Con el teclado, usa «Ver el texto fuente».');

  const comentar = async (/** @type {string} */ cuerpo) => {
    // Hacer clic en el campo borra la selección de la página: el tramo quedó guardado como ancla.
    await page.getByLabel('Comentar la selección').fill(cuerpo);
    await page.getByRole('button', { name: 'Comentar', exact: true }).click();
    await expect.poll(() => comentarios.lista.filter((c) => c.cuerpo === cuerpo).length).toBe(1);
    const c = comentarios.lista.find((x) => x.cuerpo === cuerpo);
    const r = resolverAncla(c?.ancla ?? '', servidor.doc);
    return r ? servidor.doc.getText('contenido').toString().slice(r.inicio, r.fin) : null;
  };

  // Negrita: el tramo de la fuente es la palabra (sin los asteriscos).
  expect(await seleccionar(page, 'negrita', 0, 'negrita', 7)).toBe('negrita');
  await expect(ayuda(page)).toHaveText('Vas a comentar: «negrita»');
  expect(await comentar('Sobre la negrita')).toBe('negrita');
  await expect(vista(page).locator('.comentado')).toHaveText(['negrita']);

  // Selección cruzada (de "con " a la mitad de la negrita): incluye la marca de la fuente.
  await seleccionar(page, 'Texto con ', 6, 'negrita', 3);
  await expect(ayuda(page)).toHaveText('Vas a comentar: «con **neg»');
  expect(await comentar('Cruzado')).toBe('con **neg');

  // Dentro del código resaltado.
  await seleccionar(page, 'valor', 0, 'valor', 5);
  expect(await comentar('Sobre el código')).toBe('valor');
  await expect(vista(page).locator('code .comentado')).toHaveText(['valor']);

  // Una celda de tabla.
  await seleccionar(page, 'celda uno', 0, 'celda uno', 9);
  expect(await comentar('Sobre la celda')).toBe('celda uno');

  // "Ir al texto" en la vista renderizada selecciona el tramo.
  const hilo = page.locator('article.hilo').filter({ hasText: 'Sobre la negrita' });
  await hilo.getByRole('button', { name: 'Ir al texto' }).click();
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe('negrita');
  await expect(vista(page).locator('.comentado-activo')).toHaveText('negrita');

  // Si el texto cambia (otra persona escribe antes), las marcas siguen en su lugar después de redibujar.
  servidor.doc.getText('contenido').insert(0, 'Nuevo párrafo.\n\n');
  await expect(vista(page).getByText('Nuevo párrafo.')).toBeVisible();
  await expect(vista(page).locator('code .comentado')).toHaveText(['valor']);
  expect(await axeEstable(page)).toEqual([]);
});

/** PRNG con semilla (mulberry32). */
function azarCon(/** @type {number} */ semilla) {
  let a = semilla >>> 0;
  return (/** @type {number} */ n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

/** Un documento al azar con negrita, cursiva, código, enlaces, listas, citas, tablas y escapes. */
function documentoAlAzar(/** @type {(n: number) => number} */ n) {
  const palabras = ['alfa', 'beta', 'gama', 'delta', 'épsilon', 'zeta'];
  const p = () => palabras[n(palabras.length)] ?? 'alfa';
  const linea = () =>
    Array.from({ length: 2 + n(5) }, () => [p(), `**${p()}**`, `_${p()}_`, `\`${p()}\``, `[${p()}](https://example.com)`, `${p()}\\*`, 'a &amp; b'][n(7)]).join(' ');
  const bloques = Array.from({ length: 2 + n(4) }, () => [linea(), `## ${linea()}`, `- ${linea()}\n- ${linea()}`, `> ${linea()}`, `| ${p()} | ${p()} |\n|---|---|\n| ${linea()} | ${p()} |`][n(5)]);
  return bloques.join('\n\n');
}

test('con semilla: selecciones al azar dentro de un trozo del texto dan el mismo texto en la fuente', async ({ page }) => {
  const servidor = relevo();
  const comentarios = comentariosSimulados(servidor);
  await comentarios.registrar(page, LUCIA, 'lector');
  await abrirDocumento(page, LUCIA, servidor, { vista: 'leer', rol: 'lector' });
  const t = servidor.doc.getText('contenido');
  /** @type {string[]} */
  const fallos = [];
  for (let semilla = 1; semilla <= 15; semilla++) {
    const md = documentoAlAzar(azarCon(semilla));
    const marca = `fin${String(semilla)}`;
    Y.transact(servidor.doc, () => {
      t.delete(0, t.length);
      t.insert(0, `${md}\n\n${marca}`);
    });
    await expect(vista(page).getByText(marca)).toBeVisible();
    // En el navegador: 10 selecciones al azar dentro de trozos de texto; para cada una, el texto elegido y
    // lo que dice la ayuda ("Vas a comentar: «...»", que es el tramo de la FUENTE).
    const pruebas = await page.evaluate(async (s) => {
      let a = (s * 7919) >>> 0;
      const n = (/** @type {number} */ m) => {
        a = (a + 0x6d2b79f5) >>> 0;
        let x = a;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return Math.floor((((x ^ (x >>> 14)) >>> 0) / 4294967296) * m);
      };
      const piezas = [...document.querySelectorAll('.vista-renderizada span[data-desde]')].filter((el) => (el.textContent ?? '').length > 1);
      const resultados = [];
      for (let k = 0; k < 10 && piezas.length; k++) {
        const el = piezas[n(piezas.length)];
        const texto = el?.firstChild;
        if (!el || !texto) continue;
        const largo = texto.textContent?.length ?? 0;
        const i = n(largo - 1);
        const j = i + 1 + n(largo - i);
        const r = document.createRange();
        r.setStart(texto, i);
        r.setEnd(texto, j);
        const sel = document.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
        await new Promise((ok) => setTimeout(ok, 20));
        const exacta = Number(el.getAttribute('data-hasta')) - Number(el.getAttribute('data-desde')) === largo;
        resultados.push({ elegido: r.toString(), ayuda: document.getElementById('comentar-ayuda')?.textContent ?? '', exacta });
      }
      return resultados;
    }, semilla);
    for (const p of pruebas) {
      if (p.exacta && p.ayuda !== `Vas a comentar: «${p.elegido}»`) fallos.push(`semilla ${String(semilla)}: «${p.elegido}» → ${p.ayuda}`);
      if (!p.exacta && !p.ayuda.startsWith('Vas a comentar: «')) fallos.push(`semilla ${String(semilla)} (no exacta): ${p.ayuda}`);
    }
  }
  expect(fallos).toEqual([]);
});
