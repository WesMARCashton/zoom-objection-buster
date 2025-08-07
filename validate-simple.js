const http = require('http');

const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => {
        body += chunk;
    });
    req.on('end', () => {
        try {
            const payload = JSON.parse(body);
            if (payload.plainToken) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ plainToken: payload.plainToken, status: 'success' }));
            } else {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Invalid validation payload');
            }
        } catch (e) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid JSON');
        }
    });
});

server.listen(process.env.PORT || 3000, () => {
    console.log(`Server listening on port ${process.env.PORT || 3000}`);
});
