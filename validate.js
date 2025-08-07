const http = require('http');
const crypto = require('crypto');

// Put your Zoom Verification Token here (from Zoom App Credentials)
const ZOOM_VERIFICATION_TOKEN = 'your_zoom_verification_token_here';

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const payload = JSON.parse(body);

      // Zoom sends event and payload inside this body
      if (payload.event === 'endpoint.url_validation' && payload.payload?.plainToken) {
        const plainToken = payload.payload.plainToken;

        // Create the encryptedToken using HMAC-SHA256
        const encryptedToken = crypto
          .createHmac('sha256', ZOOM_VERIFICATION_TOKEN)
          .update(plainToken)
          .digest('hex');

        // Respond with both tokens
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ plainToken, encryptedToken }));
      } else {
        res.writeHead(400);
        res.end('Invalid validation payload');
      }
    } catch (e) {
      console.error('JSON parse error:', e);
      res.writeHead(400);
      res.end('Bad Request');
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log('Zoom validation server running...');
});
