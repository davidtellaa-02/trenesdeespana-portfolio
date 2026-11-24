// Fragmento de Trenes de España (trenesdeespana.es) — © David Tella. Todos los derechos reservados.
// Coloca un punto GPS sobre el recorrido trazado (metros recorridos) y, al revés, obtiene el punto a X metros.
// Con esto se anima cada tren por la vía entre dos lecturas de GPS y se calcula cuánto le falta a tu estación.

// Proyecta un punto GPS sobre el recorrido y devuelve los metros recorridos
function proyectar(traza, lon, lat) {
  const { puntos, acum } = traza;
  const cos = Math.cos(lat * Math.PI / 180);
  let mejor = Infinity, mejorDist = 0;
  for (let i = 1; i < puntos.length; i++) {
    const ax = puntos[i - 1][0] * cos, ay = puntos[i - 1][1];
    const bx = puntos[i][0] * cos, by = puntos[i][1];
    const px = lon * cos, py = lat;
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    const qx = ax + t * dx - px, qy = ay + t * dy - py;
    const d2 = qx * qx + qy * qy;
    if (d2 < mejor) { mejor = d2; mejorDist = acum[i - 1] + t * (acum[i] - acum[i - 1]); }
  }
  return { metros: mejorDist, separacion: Math.sqrt(mejor) * 111195 };
}

function puntoEn(traza, metros) {
  const { puntos, acum } = traza;
  if (metros <= 0) return puntos[0];
  if (metros >= acum[acum.length - 1]) return puntos[puntos.length - 1];
  let lo = 0, hi = acum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acum[m] <= metros) lo = m; else hi = m; }
  const t = (metros - acum[lo]) / (acum[hi] - acum[lo] || 1);
  return [puntos[lo][0] + t * (puntos[hi][0] - puntos[lo][0]), puntos[lo][1] + t * (puntos[hi][1] - puntos[lo][1])];
}
