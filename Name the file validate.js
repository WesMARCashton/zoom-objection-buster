const http = require('http');
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => {
    try {
      const payload = JSON.parse(body);
      if (payload.plainToken) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ plainToken: payload.plainToken, status: 'success' }));
      } else {
        res.writeHead(400);
        res.end();
      }
    } catch (e) {
      res.writeHead(400);
      res.end();
    }
  });
});
server.listen(process.env.PORT || 3000);
