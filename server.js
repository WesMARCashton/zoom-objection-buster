// A complete Node.js backend for your Zoom App.
// This server will handle Zoom webhooks and manage the Realtime Media Streams.

const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const crypto = require('crypto');
const axios = require('axios'); // For making HTTP requests to Zoom API

const app = express();
const port = process.env.PORT || 3000;

// Replace with your actual credentials from the Zoom App Marketplace
const ZOOM_CLIENT_ID = 'Y9hEXPC8QE63dPNGVuQYVg';
const ZOOM_CLIENT_SECRET = 'py1vYRRgSSWyk1cq09H1SX2RwuZUieTC';
const ZOOM_SECRET_TOKEN = 'aybjQtVDTpGeWgjw54aAbA'; // From your Event Subscription

// In-memory "database" for storing objection responses
const objectionResponses = {
    'too expensive': "I understand that cost is a key consideration. Could you tell me what a reasonable budget looks like for a solution like this?",
    'don\'t have time': "I appreciate you're busy. I can make this quick. What's the best time for a short, 5-minute call next week?",
    'need to think about it': "That's fair. What specific information do you need to review before making a decision?",
    'not interested': "I understand. Could you help me understand what's not a fit so I don't waste your time in the future?",
};

app.use(bodyParser.json());

// --- WebSocket Server for Realtime Media Streams (RTMS) ---
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', ws => {
    console.log('RTMS WebSocket connection established.');
    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            // Check for transcription data
            if (data.type === 'transcript') {
                const transcript = data.text;
                console.log(`Received transcript: ${transcript}`);

                // Simple objection detection
                for (const objection in objectionResponses) {
                    if (transcript.toLowerCase().includes(objection)) {
                        const response = objectionResponses[objection];
                        // Send the objection and response to the frontend
                        ws.send(JSON.stringify({ type: 'objection_detected', objection, response }));
                        console.log(`Objection detected: "${objection}". Sending response.`);
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error processing RTMS message:', error);
        }
    });

    ws.on('close', () => console.log('RTMS WebSocket connection closed.'));
    ws.on('error', error => console.error('RTMS WebSocket error:', error));
});

// --- Webhook Endpoint for Zoom Events ---
app.post('/zoom_webhook_endpoint', (req, res) => {
    // Zoom's URL validation handshake
    if (req.body.plainToken) {
        console.log('Webhook URL validated successfully.');
        return res.json({ plainToken: req.body.plainToken, status: 'success' });
    }

    // Verify the webhook request with the secret token
    const authorization = req.headers.authorization;
    if (authorization !== ZOOM_SECRET_TOKEN) {
        console.warn('Invalid Secret Token from webhook.');
        return res.status(403).send('Invalid Secret Token');
    }

    const event = req.body.event;
    console.log(`Received Zoom event: ${event}`);

    // Process events
    if (event === 'phone_call.started') {
        const callId = req.body.payload.object.callId;
        // In a real app, you would use this callId to start the RTMS session
        // For this example, we'll just log it.
        console.log(`Phone call started with ID: ${callId}. Ready to start RTMS.`);
    } else if (event === 'phone_call.ended') {
        const callId = req.body.payload.object.callId;
        // In a real app, you would use this callId to stop the RTMS session
        console.log(`Phone call ended with ID: ${callId}. Disconnecting RTMS.`);
    }

    res.status(200).send('Event received');
});

// --- OAuth Redirect URL Endpoint ---
app.get('/zoom_oauth_callback', async (req, res) => {
    console.log('Received OAuth callback.');
    const code = req.query.code;

    if (!code) {
        return res.status(400).send('Authorization code not found.');
    }

    try {
        const response = await axios.post('https://zoom.us/oauth/token', null, {
            params: {
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: 'https://themarcgroupinc.com/zoom_oauth_callback'
            },
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64')}`
            }
        });

        const accessToken = response.data.access_token;
        const refreshToken = response.data.refresh_token;

        console.log('Successfully received access token:', accessToken);
        // Here, you should securely store the access and refresh tokens
        // For this example, we'll just show a success message.
        res.send('Your app has been successfully authorized! You can now close this window.');

    } catch (error) {
        console.error('Error exchanging code for token:', error.response.data);
        res.status(500).send('Error during authorization. Please check the server logs.');
    }
});


// --- Starting the Server ---
const server = app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
});

// Handle WebSocket upgrades for RTMS
server.on('upgrade', (request, socket, head) => {
    // This is a placeholder for RTMS WebSocket connection logic.
    // The RTMS endpoint URL will be configured in the Zoom App Marketplace.
    // In a real-world scenario, Zoom's servers would connect to this WebSocket endpoint directly.
    wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
    });
});
