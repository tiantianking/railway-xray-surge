// Front door for the Railway service.
// - WebSocket upgrade on /tk-rail -> VMess inbound (127.0.0.1:10000, for Surge)
// - WebSocket upgrade on /tk-vless -> VLESS inbound (127.0.0.1:10001, other clients)
// - GET /sub-<SUB_TOKEN> -> Surge managed config, filled with the real public host
// - everything else -> 400, so from outside it just looks like a broken website
const http = require('http');
const net = require('net');

const PORT = parseInt(process.env.PORT || '8080', 10);
const UUID = process.env.UUID || '';
const SUB_TOKEN = process.env.SUB_TOKEN || '';

// Surge does not support VLESS, so the Surge-facing path /tk-rail is VMess.
// VLESS stays available for other clients on /tk-vless.
const WS_ROUTES = {
  '/tk-rail': 10000,
  '/tk-vless': 10001
};
const WS_PATH = '/tk-rail';

function surgeConfig(hostHeader) {
  const host = (hostHeader || '').split(':')[0];
  const self = `https://${host}/sub-${SUB_TOKEN}`;
  return `#!MANAGED-CONFIG ${self} interval=43200 strict=true

[General]
loglevel = notify
ipv6 = false
dns-server = 1.1.1.1, 8.8.8.8

[Proxy]
Railway-US = vmess, ${host}, 443, username=${UUID}, vmess-aead=true, tls=true, ws=true, ws-path=${WS_PATH}, ws-headers=Host:${host}, sni=${host}

[Proxy Group]
PROXY = select, Railway-US, DIRECT

[Rule]
GEOIP,CN,DIRECT
FINAL,PROXY
`;
}

const server = http.createServer((req, res) => {
  const host = req.headers.host || '';

  if (SUB_TOKEN && req.url === `/sub-${SUB_TOKEN}`) {
    const body = surgeConfig(host);
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(body);
    return;
  }

  if (req.url === '/vless') {
    const hostname = (host || '').split(':')[0];
    const link = `vless://${UUID}@${hostname}:443?encryption=none&security=tls&type=ws&host=${hostname}&path=%2Ftk-vless&sni=${hostname}#Railway-US`;
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(link);
    return;
  }

  // Decoy: anything that does not knock correctly gets a plain 400.
  res.writeHead(400, { 'content-type': 'text/plain' });
  res.end('400 Bad Request');
});

server.on('upgrade', (req, socket, head) => {
  const path = (req.url || '').split('?')[0];
  const xrayPort = WS_ROUTES[path];
  if (!xrayPort) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  const upstream = net.connect(xrayPort, '127.0.0.1', () => {
    // Replay the original upgrade request verbatim to xray.
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    }
    raw += '\r\n';
    upstream.write(raw);
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`front door listening on ${PORT}, ws path ${WS_PATH}`);
});
