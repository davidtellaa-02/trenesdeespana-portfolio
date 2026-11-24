// Fragmento de Trenes de España (trenesdeespana.es) — © David Tella. Todos los derechos reservados.
// para que miles de peticiones iguales no obliguen al servidor a calcular lo mismo miles de veces.
const net = require('net');

// ¿La conexión viene de la red interna? (el proxy de Railway, Fly.io, Caddy en el mismo servidor...)
function redInterna(ip) {
  ip = String(ip || '').replace(/^::ffff:/, '');
  if (ip === '::1' || /^f[cd]/i.test(ip)) return true;
  const [a, b] = ip.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

// Direcciones de Cloudflare (https://www.cloudflare.com/ips/)
const CLOUDFLARE = new net.BlockList();
for (const red of ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18',
  '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14',
  '172.64.0.0/13', '131.0.72.0/22']) CLOUDFLARE.addSubnet(red.split('/')[0], Number(red.split('/')[1]), 'ipv4');
for (const red of ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32']) {
  CLOUDFLARE.addSubnet(red.split('/')[0], Number(red.split('/')[1]), 'ipv6');
}
const deCloudflare = (ip) => CLOUDFLARE.check(ip, net.isIPv6(ip) ? 'ipv6' : 'ipv4');

// IP real del visitante. Las cabeceras como X-Forwarded-For las puede inventar cualquiera, así que solo se miran
// si la conexión llega desde un proxy de la red interna, y solo la que pone ese proxy:
//   - Fly-Client-IP (Fly.io), X-Real-IP (Railway, Caddy...) o el último salto de X-Forwarded-For
//   - IP_CABECERA=cf-connecting-ip → la web está detrás de Cloudflare. Esa cabecera solo se cree si quien conecta
//     es de verdad Cloudflare: si alguien entra directo por la dirección de Fly, no puede inventarse otra IP
function ipDe(req) {
  const directa = req.socket.remoteAddress || 'desconocida';
  if (!redInterna(directa)) return directa;
  let cliente = directa;
  for (const c of [req.headers['fly-client-ip'], req.headers['x-real-ip'], String(req.headers['x-forwarded-for'] || '').split(',').pop()]) {
    const ip = String(c || '').trim();
    if (net.isIP(ip)) { cliente = ip; break; }
  }
  const cabecera = String(process.env.IP_CABECERA || '').toLowerCase().trim();
  if (cabecera && net.isIP(cliente) && deCloudflare(cliente)) {
    const ip = String(req.headers[cabecera] || '').trim();
    if (net.isIP(ip)) return ip;
  }
  return cliente;
}

// Con IPv6 cada conexión doméstica recibe un bloque /64 entero (millones de direcciones): para los límites
// cuenta el bloque, no la dirección, o bastaría con ir cambiando de IP para saltárselos
function claveIp(ip) {
  ip = String(ip).replace(/^::ffff:/i, '');
  if (!net.isIPv6(ip)) return ip;
  const [izq, der = ''] = ip.split('::');
  const a = izq ? izq.split(':') : [], b = der ? der.split(':') : [];
  const grupos = ip.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
  return grupos.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

// Ventanas fijas: como mucho «maximo» peticiones de una IP cada «ventanaMs» en cada grupo
const contadores = new Map();
function superaLimite(req, grupo, maximo, ventanaMs = 60000) {
  const clave = grupo + '|' + claveIp(ipDe(req));
  const ahora = Date.now();
  let c = contadores.get(clave);
  if (!c || ahora - c.inicio >= c.ventana) { c = { inicio: ahora, ventana: ventanaMs, n: 0 }; contadores.set(clave, c); }
  c.n++;
  return c.n > maximo;
}

// Cuántas veces ha contado ya una IP en un grupo (sin sumar una más)
function cuenta(req, grupo) {
  const c = contadores.get(grupo + '|' + claveIp(ipDe(req)));
  return c && Date.now() - c.inicio < c.ventana ? c.n : 0;
}
