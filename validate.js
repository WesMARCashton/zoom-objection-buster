const http = require('http');
const crypto = require('crypto');

// Load Zoom Verification Token securely from environment variables
const ZOOM_VERIFICATION_TOKEN = process.env.ZOOM_VERIFICATION_TOKEN;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const payload = JSON.parse(body);

      // Check if it's the Zoom validation event
      if (payload.event === 'endpoint.url_validation' && payload.payload?.plainToken) {
        const plainToken = payload.payload.plainToken;

        // Generate encryptedToken using HMAC-SHA256
        const encryptedToken = crypto
          .createHmac('sha256', ZOOM_VERIFICATION_TOKEN)
          .update(plainToken)
          .digest('hex');

        // Respond with plainToken and encryptedToken
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ plainToken, encryptedToken }));
      } else {
        res.writeHead(400);
        res.end('Invalid validation payload');
      }
    } catch (err) {
      console.error('Error parsing request:', err);
      res.writeHead(400);
      res.end('Bad Request');
    }
  });
});

// Start server on Render
server.listen(process.env.PORT || 3000, () => {
  console.log('Zoom webhook validation server is running...');
});
