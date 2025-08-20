// server.js
// Zoom Phone Objection Buster: Webhooks + OAuth + RTMS (auto) + Live UI

const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

/* =======================
   ENV CONFIG (set in Render)
   ======================= */
const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;
const ZOOM_REDIRECT_URI = process.env.ZOOM_REDIRECT_URI;
const ZOOM_SECRET_TOKEN = process.env.ZOOM_SECRET_TOKEN; // Event Subscriptions "Secret Token"/Verification token
const ENFORCE_SIG = process.env.ENFORCE_ZOOM_SIGNATURE === 'true';

// TEMPLATE for Zoom Phone RTMS WS endpoint.
// You MUST set this to the value Zoom gives your account (feature: Realtime Media Streams for PHONE).
// Example (may differ on your account): wss://rtms.zoom.us/v2/phone?call_id={CALL_ID}
const ZOOM_RTMS_WS_TEMPLATE = process.env.ZOOM_RTMS_WS_TEMPLATE;

// Zoom OAuth token endpoint (default is Zoom’s)
const ZOOM_OAUTH_TOKEN_URL = process.env.ZOOM_OAUTH_TOKEN_URL || 'https://zoom.us/oauth/token';

/* =======================
   BODY PARSER (keep RAW)
   ======================= */
app.use(bodyParser.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

/* =======================
   OBJECTION RESPONSES (full list)
   ======================= */
const objectionResponses = {
  // Money
  'budget is allocated': "I understand that you have a budget to stick to and may have already allocated it to other projects, that’s pretty normal. Out of curiosity, may I ask what you’ve invested in this year marketing-wise?” Respond: \"I appreciate your budget constraints, and we do have options available to fit any budget and still deliver fantastic results. In fact, many of our clients have seen great results with a small advertising budget, or even made room in the existing budget because they’ve absolutely fallen in love with the product after I go through the details. Let me tell you why our clients love us!\"",
  "it's too expensive": "I understand that cost is a concern for you. Out of curiosity, may I ask what you’re currently doing to drive new business? Respond by building Value: \"Something that sometimes gets overlooked on first impression is that Bagvertising is actually one of the most cost-effective advertising options, We’re talking pennies per impression. You have to consider that for a one-time cost - our product lasts for years, generates millions of repeat impressions, AND is a necessity given that society is moving towards reusable bags over plastic or paper.\"",
  "don't want to pay up front": "I understand that you don't want to pay upfront for advertising without having seen the ad design/results”. Respond: \"I can appreciate that, and it’s something had folks say to me before.The reason we work upfront so we CAN start working on your ad design right away. Typically you will receive your first ad proof within only a few days and you get unlimited revisions to make sure you are completely satisfied with the ad. The way our system actually works, I can only reserve your ad space and get my design team to start the creative process if I open you an account and input payment information. Does that make sense?\" Worst case scenario, get creative and offer an alternative payment option.",
  "don't see the value": "I understand that you don't see the value of this type of advertising right now.\" Respond: \"I appreciate your concerns, and assure you that this program has delivered some amazing results for other businesses like yours. Now, find out what they actually value and would be looking to achieve if they were to advertise, and how BagVertising can best help them achieve that goal – introduce new info – Hammer home our 5 key points, Storytell, Give References, Talk About Impressions, Targeted Ad Design etc. \"",
  "can't afford it": "I can understand that, I called out of the blue and you weren’t expecting to spend (X amount of dollars today).\" Respond: \"I can appreciate that, and we do have options that can accommodate any budget. I’m sure we can come to a solution that works for both of us! But let me ask you this, if you could afford it…would you move forward? ” Now get creative….",
  // Time
  'very busy': "I completely understand that you have a busy schedule.\" Respond: \" I can appreciate the importance of your time. That's why I'll make this quick and to the point. If you like what you hear, we can continue the conversation, if not I can move on - no hard feelings. Is that fair?\"",
  "i'm driving": "I completely understand that you're driving right now and can't talk on the phone.\" Respond: \"I appreciate your safety first and foremost. I promise to make the call brief and to the point, so you can get back to your day as soon as possible.\"",
  "i'll call you back later": "I completely understand that you're busy right now and you’ll have more time later on to chat.\" Respond: \"That being said, why don’t I briefly run you through the details while we have each other? I promise not to take more than 3 minutes of your time, and this way, you'll have all the information you need to see if it even makes sense for us to schedule a follow up call later today.Is that fair?\"",
  'can you send me an email': "Sure, I understand that you prefer to receive information through email, That’s pretty normal.\" Respond: \" I'd be happy to send you an email with more information. But, if I could just take a few minutes of your time right now, we can go over that email together and that way I can answer any questions you may have. Does that make sense?\"",
  'not the right time of year': "I understand your concerns, it can be difficult to invest in advertising during certain times of the year.\" Respond: \"While I understand your concern, this type of advertising can help you reach your target audience year-round, and for many years… help consistently build your brand, and stay ahead of your competition.\"",
  // Need
  "don't need to advertise": "I understand that not everyone needs advertising to grow their business. Out of curiosity, what are you currently doing to drive new business?\" Respond: \"While I understand your perspective, this program can help you reach a wider audience and bring new customers to your business. It can also help you stand out from your competitors and build your brand.”",
  'too busy to take on new clients': "I know how busy you are, and understand that you aren’t looking to take on new clients at this time\" Respond: \"While I can understand that, many business owners in your position view our advertising services as an insurance policy, to make sure their brand is staying visible in the community, keeping themselves in front of potential new customers, and staying ahead of the competition. Someone like you doesn’t advertise because you need to, you advertise because you can!\"",
  'well established in the community already': "I'm impressed with how well established you are in the community.\" Respond: \"While I understand your perspective, this type of advertising can help you reach new customers and stay ahead of the competition. It can also help you continue to grow and maintain your well-established reputation in the community that you’ve worked so hard to attain!\"",
  'all our business is referral': "I completely understand the power of referrals and word of mouth. It's a great way to attract new customers.\" Respond: \"While I understand your perspective, this type of advertising can help you reach new customers who may not have heard about your business through referrals or word of mouth. It can also help you increase brand awareness and build credibility with potential customers through the power of Co-Branding with a National Brand/Staple of the Community”",
  "i've done this before didn't work": "I understand that advertising can be disappointing when it doesn't produce the desired results.\" It’s important to clarify \"My apologies let me clarify, are you're saying that you've tried this exact type of advertising before, or are you referring to something similar that didn't quite work out for you?\" Respond: After acknowledging and repeating the customer's objection, respond by addressing their concerns and providing additional information. Emphasize the differences between what they tried before and what is being offered. Explain how you can help them achieve better results through a new ad design, more targeted approach, better measurement, unique benefits of this particular program, or working with YOU as their personal advertising specialist.",
  'i only do online advertising': "I understand the value of online/social media/radio/TV advertising and the results it can deliver.\" Respond: \"While I understand you have your tried and true plan, many of our clients who have the same strategy look at our products as a fantastic compliment to their existing marketing plans that provides some extra reach and impact in the local community that helps them get to the next level. We’re like gum at the checkout, you didn’t plan on buying it… but it sure came in handy right?\"",
  "i'm retiring soon": "I understand that you're planning to retire soon and that must be an exciting time for you, congratulations!!\" Respond: \"While I understand your plans, a lot of our clients in similar situations still like to consider this type of advertising even if retirement is on the horizon. Advertising can help your business continue to thrive and actually make your transition to retirement smoother. Because you’ve been in the community so long it might even be a nice send-off or a way to express your gratitude to the community for their years of support\"",
  // Urgency
  'talk to my boss': "I completely understand, involving a business partner in important decisions is a smart move.\" Respond: “I assume you 2 are pretty like minded…I’m curious, when you bring this to them what do you think that they would say?” *if yes - assume the sale and close Follow-Up Question: When you do talk with them what does that decision-making process look like? I can imagine it's a pretty quick conversation right? Ask: a) If partner/boss is available b) To speak with partner/boss directly c) Put the call on hold and get an answer Close Using FUJI",
  'send me an email and get back to you': "Sure, I can do that! What’s your email? I’ll send that to you now, and do you mind checking to see if it went through for me?” … Now while we wait for that to go through…I was just curious (name)…what exactly is your role with the company? …. And how long have you been there? …. Now, did my email come through? Ok, Great! Pop that open for me and I’ll quickly run you through the details, I’d just love to grab your first impressions before taking this to (Decisonmaker’s Name). Working directly with the owner, you must have a pulse on what matters most to the business and I definitely want to grab your opinion!!",
  'let me think about it': "Of course, I understand that you want to take some time to consider the offer. How long do you think you’ll need?” Respond: , \"I completely understand. Taking time to make the right decision is important, is there anything specific you would need to think about?\" Isolate the true objection, handle it, and Close",
  'call me next year': "I hear you wanting to consider this for a future run or perhaps next year.\" Respond: \"This particular opportunity has been in high demand, and we offer first rights of refusal to whichever company in your industry who signs up this year. I can't guarantee the same terms or if this will even be available in the future. It's a unique chance right now, and I'd hate for you to miss out.\"",
  'call me back later': "I appreciate your interest and the notion of revisiting this conversation later.\" Respond: \"The nature of this offer means spots are filling up fast. Delaying might mean missing out on this opportunity. Can we quickly clarify any questions or concerns you have now?\"",
  'what is your deadline': "Yesterday! We have to run this program first-come-first served to make sure we hit our distribution window. Full transparency, my job today is simply to call every company in the industry today until someone in the industry picks it up. That being said, how are you feeling about this?”",
  // Trust
  'how do I know this is legitimate': "I completely understand your concern, you can never be too careful these days, I get it.\" Respond: \"We're working with many reputable businesses and have a solid reputation. Here’s some other businesses that have signed up so you know you’re in good company (Use Jones Effect & list the businesses already signed up) . Some other approaches can be: Take the Client to our website/Social Media, Show them an email, Facetime, Name Drop your contact at the vendor. We have nothing to hide here, just show them we are legit and be confident.\"",
  "don't give my credit card over the phone": "No worries, I respect you wanting to air on the side of caution, I get that.\" Respond: \"Just know that this is a standard process. Our system is secure, and we prioritize the confidentiality of your information. We use credit card exclusively for your convenience, and because that way we are both insured. Does that make sense?” It's the fastest way to secure this unique advertising spot before it's taken.\"",
  "don't think this type of advertising works": "I get that, It's natural to be skeptical of new advertising methods.\" Respond: \"Many of our clients have had amazing results with with bagvertising. It's unique, constant, and targets the local audience directly. If you write this off without giving it a shot you could be leaving money on the table. Let me ask you this…what do you usually do to drive new business?”",
  'see an art proof/sample first': "Absolutely, I get that, and I’ve definitely heard that before.\" Respond: ”The way our system works, I can only reserve your ad space and get the ball rolling on your artwork if I open you an account and input payment information.Typically you will receive your first ad proof within only a few days and you get unlimited revisions to make sure you are %100 satisfied with the ad. We don’t print until we have your full approval so there’s nothing to worry about! Does that sound fair?”",
  'scammed before': "That's unfortunate, I’m sorry that happened to you.\" Respond: \"I assure you this is a legitimate opportunity.” \"We're working with many reputable businesses and have a solid reputation. Here’s some other businesses that have signed up so you know you’re in good company (Use Jones Effect & list the businesses already signed up). Some other approaches can be: Take the Client to our website/Social Media, Show them an email, Facetime, name drop your contact at the vendor, help them understand the scale we are doing this on and other vendors partners we work with. We have nothing to hide here, just show them we are legit and be confident.\"",
  'send a cheque': "We always appreciate flexibility in our clients, and I understand you're looking for other payment methods.\" Respond: \"To maintain efficiency, quickly secure spots, and for your convenience we streamline our process with credit card payments. It's the quickest and easiest way for both of us.\"",
  // Misc
  'not interested': "No worries, that makes sense though…I haven’t given you anything to be interested in yet hahaha! \"Just for my own notes here, do you mind sharing what makes you say that?\"",
  "don't like that vendor": "No worries, for my own notes here, do you mind sharing what makes you say that?\"",
  'already spoken to someone': "My apologies, I don’t mean to bug you! What did you think about the idea?\" Or \"No worries, in that case…I won’t waste your time going though the same song and dance twice - how much do you already know?\"",
  "don't shop there": "No worries, I hear you! Out of curiosity, how would you describe your clientele or ideal client? Then proceed to explain how this IS their ideal clientele",
  "don't use reusable bags": "No worries, I hear that! Do you prefer paper or plastic?\" ---- \"Well hey the way the world’s going…we’re all going to have to go with reusable bags sooner or later. At least these ones are free right? Who doesn’t like free stuff?\""
};

/* =======================
   RUNTIME STATE + HELPERS
   ======================= */
const wss = new WebSocket.Server({ noServer: true });
const clients = new Set();
let lastDetection = null;

// in-memory tokens (demo). For production, store in DB/KV.
let ACCESS_TOKEN = null;
let REFRESH_TOKEN = null;
let ACCESS_EXPIRES_AT = 0; // unix ms

function broadcast(json) {
  const msg = JSON.stringify(json);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(msg);
}

function objectionDetectAndBroadcast(transcript) {
  const text = (transcript || '').toLowerCase();
  for (const key of Object.keys(objectionResponses)) {
    if (text.includes(key)) {
      lastDetection = { objection: key, response: objectionResponses[key] };
      broadcast({ type: 'objection_detected', ...lastDetection });
      console.log(`Objection detected: "${key}"`);
      break;
    }
  }
}

/* =======================
   SIMPLE UI (lights up)
   ======================= */
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html><meta charset="utf-8">
<title>Objection Buster – Live</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;padding:24px;background:#0b1220;color:#e6edf3}
.card{max-width:720px;margin:0 auto;background:#121829;border-radius:16px;padding:24px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
h1{margin:0 0 8px;font-size:24px}
.status{display:inline-flex;align-items:center;gap:8px;margin-bottom:16px}
.dot{width:12px;height:12px;border-radius:999px;background:#444;transition:background .2s ease}
.dot.on{background:#22c55e}
.pill{font-size:12px;padding:4px 8px;border-radius:999px;background:#24304a}
.objection{font-weight:600;color:#a5b4fc}
.response{white-space:pre-wrap;line-height:1.5;margin-top:8px}
.muted{color:#9aa4b2}
</style>
<div class="card">
  <h1>Objection Buster</h1>
  <div class="status"><span class="dot" id="dot"></span><span id="stateText" class="muted">Listening for objections…</span></div>
  <div id="content">
    <div><span class="muted">Objection Detected:</span> <span class="objection" id="objection">—</span></div>
    <div class="muted" style="margin-top:12px;">Suggested Response:</div>
    <div class="response" id="response">—</div>
  </div>
  <div class="pill" style="margin-top:16px;">WebSocket: <span id="wsState">connecting…</span></div>
</div>
<script>
const dot=document.getElementById('dot'),objectionEl=document.getElementById('objection'),responseEl=document.getElementById('response'),stateText=document.getElementById('stateText'),wsState=document.getElementById('wsState');
const wsUrl=(location.protocol==='https:'?'wss://':'ws://')+location.host;
const ws=new WebSocket(wsUrl);
wsState.textContent='connecting';
ws.onopen=()=>wsState.textContent='connected';
ws.onclose=()=>wsState.textContent='disconnected';
ws.onerror=()=>wsState.textContent='error';
ws.onmessage=(e)=>{try{const m=JSON.parse(e.data);if(m.type==='objection_detected'){dot.classList.add('on');objectionEl.textContent=m.objection||'—';responseEl.textContent=m.response||'—';stateText.textContent='Objection detected!'}}catch{}};
</script>`);
});

/* =======================
   RTMS: start/stop helpers
   ======================= */
let activeRtms = new Map(); // callId -> { ws }

function rtmsWsUrlFor(callId) {
  if (!ZOOM_RTMS_WS_TEMPLATE) return null;
  return ZOOM_RTMS_WS_TEMPLATE.replace('{CALL_ID}', encodeURIComponent(callId));
}

async function getValidAccessToken() {
  const now = Date.now();
  if (ACCESS_TOKEN && now < ACCESS_EXPIRES_AT - 10_000) {
    return ACCESS_TOKEN;
  }
  if (!REFRESH_TOKEN) {
    throw new Error('No refresh token available. Authorize the app first.');
  }
  const resp = await axios.post(ZOOM_OAUTH_TOKEN_URL, null, {
    params: { grant_type: 'refresh_token', refresh_token: REFRESH_TOKEN },
    headers: {
      Authorization: `Basic ${Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64')}`,
    },
  });
  ACCESS_TOKEN = resp.data.access_token;
  REFRESH_TOKEN = resp.data.refresh_token || REFRESH_TOKEN;
  const expiresIn = resp.data.expires_in || 3500;
  ACCESS_EXPIRES_AT = Date.now() + expiresIn * 1000;
  console.log('Refreshed Zoom access token.');
  return ACCESS_TOKEN;
}

async function startRtmsForCall(callId) {
  const wsUrl = rtmsWsUrlFor(callId);
  if (!wsUrl) {
    console.warn('ZOOM_RTMS_WS_TEMPLATE not set; cannot start RTMS.');
    return;
  }
  const token = await getValidAccessToken();
  console.log('Connecting RTMS WS:', wsUrl);

  const headers = { Authorization: `Bearer ${token}` };
  const ws = new WebSocket(wsUrl, { headers });

  ws.on('open', () => console.log('RTMS connected for call', callId));
  ws.on('close', () => {
    console.log('RTMS closed for call', callId);
    activeRtms.delete(callId);
  });
  ws.on('error', (e) => console.error('RTMS error', callId, e?.message || e));
  ws.on('message', (buf) => {
    try {
      // Different accounts may get slightly different message shapes.
      const txt = buf.toString('utf8');
      let msg;
      try { msg = JSON.parse(txt); } catch { msg = { transcript: txt }; }

      // Common patterns to extract transcript text:
      const t =
        msg.text ||
        msg.transcript ||
        msg?.payload?.transcript ||
        msg?.result?.alternatives?.[0]?.transcript ||
        '';

      if (t) {
        console.log('RTMS transcript:', t);
        objectionDetectAndBroadcast(t);
      }
    } catch (e) {
      console.error('RTMS message parse error:', e);
    }
  });

  activeRtms.set(callId, { ws });
}

function stopRtmsForCall(callId) {
  const entry = activeRtms.get(callId);
  if (entry?.ws && entry.ws.readyState === entry.ws.OPEN) entry.ws.close(1000);
  activeRtms.delete(callId);
}

/* =======================
   WEBSOCKET (UI/Dev)
   ======================= */
wss.on('connection', (ws) => {
  clients.add(ws);
  if (lastDetection) ws.send(JSON.stringify({ type: 'objection_detected', ...lastDetection }));
  ws.on('close', () => clients.delete(ws));
});

/* =======================
   WEBHOOK (Zoom v2)
   ======================= */
app.post('/zoom_webhook_endpoint', (req, res) => {
  const sigHeader = req.headers['x-zm-signature'];

  // URL validation challenge
  if (req.body?.event === 'endpoint.url_validation') {
    const plainToken = req.body?.payload?.plainToken;
    if (!plainToken) return res.status(400).send('Missing plainToken');
    const encryptedToken = crypto.createHmac('sha256', ZOOM_SECRET_TOKEN).update(plainToken).digest('base64');
    return res.status(200).json({ plainToken, encryptedToken });
  }

  // Signature check (dev-mode lenient)
  if (sigHeader) {
    try {
      const parts = String(sigHeader).split(',').map(x => x.trim());
      const provided = (parts.find(p => p.startsWith('v0-signature=')) || '').split('=')[1] || sigHeader;
      const ts = (parts.find(p => p.startsWith('v0=')) || '').split('=')[1] || '';
      const raw = (req.rawBody || Buffer.from('')).toString('utf8');
      const message = ts ? `v0:${ts}:${raw}` : raw;
      const expected = crypto.createHmac('sha256', ZOOM_SECRET_TOKEN).update(message).digest('hex');
      if (!provided || provided !== expected) {
        console.warn('Zoom signature mismatch. (dev-mode accepting)');
        if (ENFORCE_SIG) return res.status(401).send('Invalid signature');
      }
    } catch (e) {
      console.warn('Zoom signature parse error. (dev-mode accepting)', e);
      if (ENFORCE_SIG) return res.status(401).send('Invalid signature');
    }
  } else {
    console.warn('x-zm-signature missing; continuing (dev mode).');
  }

  // Events
  const event = req.body?.event;
  console.log('Zoom event:', event);

  if (event === 'phone_call.started') {
    const callId = req.body?.payload?.object?.callId;
    console.log('Call started:', callId);
    // Fire-and-forget start; errors logged internally
    startRtmsForCall(callId).catch(err => console.error('Failed to start RTMS:', err?.response?.data || err.message));
  }

  if (event === 'phone_call.ended') {
    const callId = req.body?.payload?.object?.callId;
    console.log('Call ended:', callId);
    stopRtmsForCall(callId);
  }

  res.status(200).send('ok');
});

/* =======================
   OAUTH CALLBACK
   ======================= */
app.get('/zoom_oauth_callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Authorization code not found.');

  try {
    const response = await axios.post(ZOOM_OAUTH_TOKEN_URL, null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: ZOOM_REDIRECT_URI,
      },
      headers: {
        Authorization: `Basic ${Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64')}`,
      },
    });

    ACCESS_TOKEN = response.data.access_token;
    REFRESH_TOKEN = response.data.refresh_token;
    const expiresIn = response.data.expires_in || 3500;
    ACCESS_EXPIRES_AT = Date.now() + expiresIn * 1000;

    console.log('OAuth success. Access token acquired.');
    res.send('Authorized! You can close this window.');
  } catch (err) {
    console.error('OAuth error:', err?.response?.data || err.message);
    res.status(500).send('Authorization error; see logs.');
  }
});

/* =======================
   SERVER + WS UPGRADE
   ======================= */
const server = app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});
server.on('upgrade', (req, sock, head) => {
  wss.handleUpgrade(req, sock, head, (ws) => wss.emit('connection', ws, req));
});
