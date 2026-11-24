// Fragmento de Trenes de España (trenesdeespana.es) — © David Tella. Todos los derechos reservados.
// Recorrido de un tren sobre las vías reales: A* sobre el grafo ferroviario de OpenStreetMap (unos 190.000 nodos)
// guardado en arrays tipados (CSR), con índice espacial por rejilla y penalización por ancho de vía.
// «grafo» se carga al arrancar desde un JSON compacto con los nodos y tramos de vía (no incluido en este escaparate).

const RADIO_ESTACION = 700;  // metros alrededor de la estación donde puede empezar/terminar la ruta
const CELDA = 0.01;          // grados, para el índice espacial

function celda(lon, lat) {
  return Math.floor(lon / CELDA) * 100000 + Math.floor(lat / CELDA);
}

function distancia(lon1, lat1, lon2, lat2) {
  const k = Math.PI / 180;
  const x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * k);
  const y = (lat2 - lat1) * k;
  return Math.sqrt(x * x + y * y) * 6371000;
}

function nodosCercanos(lon, lat, radio) {
  const res = [];
  const pasos = Math.ceil(radio / 1000 / (CELDA * 111)) + 1;
  const cx = Math.floor(lon / CELDA), cy = Math.floor(lat / CELDA);
  for (let dx = -pasos; dx <= pasos; dx++) for (let dy = -pasos; dy <= pasos; dy++) {
    const lista = grafo.rejilla.get((cx + dx) * 100000 + (cy + dy));
    if (!lista) continue;
    for (const i of lista) {
      const d = distancia(lon, lat, grafo.lon[i], grafo.lat[i]);
      if (d <= radio) res.push([i, d]);
    }
  }
  return res;
}

// Montículo binario mínimo sobre (coste, nodo)
class Monticulo {
  constructor() { this.c = []; this.v = []; }
  get size() { return this.c.length; }
  push(coste, nodo) {
    const c = this.c, v = this.v;
    let i = c.length; c.push(coste); v.push(nodo);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (c[p] <= c[i]) break;
      [c[p], c[i]] = [c[i], c[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p;
    }
  }
  pop() {
    const c = this.c, v = this.v;
    const nodo = v[0], ultC = c.pop(), ultV = v.pop();
    if (c.length) {
      c[0] = ultC; v[0] = ultV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < c.length && c[l] < c[m]) m = l;
        if (r < c.length && c[r] < c[m]) m = r;
        if (m === i) break;
        [c[m], c[i]] = [c[i], c[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return nodo;
  }
}

// Penalización según el ancho de vía: los trenes de alta velocidad prefieren el ancho internacional
function factorAncho(modo, ancho) {
  if (ancho === 2) return 1;
  if (modo === 'av') return ancho === 1 ? 1 : 1.8;
  if (modo === 'convencional') return ancho === 0 ? 1 : 1.8;
  return 1;
}

// A* con varios orígenes/destinos (todos los nodos cerca de cada estación)
function rutaEntre(a, b, modo) {
  if (!grafo) return null;
  const origenes = nodosCercanos(a.lon, a.lat, RADIO_ESTACION);
  const destinos = nodosCercanos(b.lon, b.lat, RADIO_ESTACION);
  if (!origenes.length || !destinos.length) return null;

  const extra = new Map(destinos.map(([i, d]) => [i, d * 2]));
  const coste = new Map(), previo = new Map(), cerrado = new Set();
  const h = (i) => Math.max(0, distancia(grafo.lon[i], grafo.lat[i], b.lon, b.lat) - RADIO_ESTACION);
  const cola = new Monticulo();
  for (const [i, d] of origenes) { coste.set(i, d * 2); previo.set(i, -1); cola.push(d * 2 + h(i), i); }

  const recta = distancia(a.lon, a.lat, b.lon, b.lat);
  const limite = recta * 3 + 20000;
  let mejor = -1, mejorCoste = Infinity, iter = 0;

  while (cola.size && iter++ < 2_000_000) {
    const u = cola.pop();
    if (cerrado.has(u)) continue;
    cerrado.add(u);
    const cu = coste.get(u);
    if (cu + h(u) >= mejorCoste) break;
    if (cu > limite) continue;
    if (extra.has(u) && cu + extra.get(u) < mejorCoste) { mejorCoste = cu + extra.get(u); mejor = u; }
    for (let k = grafo.inicio[u]; k < grafo.inicio[u + 1]; k++) {
      const w = grafo.vecino[k];
      if (cerrado.has(w)) continue;
      const cw = cu + grafo.largo[k] * factorAncho(modo, grafo.ancho[k]);
      if (cw < (coste.has(w) ? coste.get(w) : Infinity)) {
        coste.set(w, cw); previo.set(w, u); cola.push(cw + h(w), w);
      }
    }
  }
  if (mejor < 0) return null;

  const camino = [];
  for (let u = mejor; u !== -1; u = previo.get(u)) camino.push([grafo.lon[u], grafo.lat[u]]);
  camino.reverse();
  return [[a.lon, a.lat], ...camino, [b.lon, b.lat]];
}
