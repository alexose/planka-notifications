const http = require('http');
const url = require('url');

// Load configuration
let config;
try {
  config = require('./config.js');
} catch (error) {
  console.error('❌ Error loading config.js. Please copy config.js.example to config.js and update the values.');
  process.exit(1);
}

const PORT = config.port || 3001;

// Default webhook details
const DEFAULT_DETAILS = {
  cardTitle: 'N/A',
  boardName: 'N/A', 
  listName: 'N/A',
  username: 'N/A',
  slackChannels: [],
  commentText: null,
  isComment: false,
  description: null
};

/**
 * Parses a description for Slack channel notifications.
 * 
 * This function looks for lines that contain the words "notify" or "notification"
 * and extracts any Slack channel names that start with an ampersand (&) or hash (#).
 * 
 * Slack channel prefixes:
 * - & (ampersand) - for shared channels
 * - # (hash/pound) - for regular channels
 * 
 * The function is flexible and handles various formats:
 * - "notify &general" → finds &general
 * - "notification: #team-alpha" → finds #team-alpha  
 * - "please notify &urgent, #important" → finds &urgent, #important
 * - "NOTIFY &channel-name" → finds &channel-name (case insensitive)
 * - "notify &channel1 #channel2 &channel3" → finds all three channels
 * 
 * @param {string} description - The text to parse for notifications
 * @returns {string[]} Array of Slack channel names (including the prefix symbol)
 * 
 * @example
 * const description = `
 *   This is a regular description line
 *   notify &general #team-alpha
 *   Another line with notification: &urgent
 * `;
 * const channels = parseNotifyChannels(description);
 * // Returns: ['&general', '#team-alpha', '&urgent']
 */
function parseNotifyChannels(description) {
  if (!description || typeof description !== 'string') {
    return [];
  }
  
  const channels = [];
  const lines = description.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if line contains "notify" or "notification" (case insensitive)
    if (trimmedLine.toLowerCase().includes('notify') || 
        trimmedLine.toLowerCase().includes('notification')) {
      
      // Find all strings starting with & or # followed by valid channel characters
      // This regex matches: & or # + one or more word characters, hyphens, or underscores
      const channelMatches = trimmedLine.match(/[&#][a-zA-Z0-9_-]+/g);
      
      if (channelMatches) {
        // Add unique channels only (avoid duplicates)
        for (const channel of channelMatches) {
          if (!channels.includes(channel)) {
            channels.push(channel);
          }
        }
      }
    }
  }
  
  return channels;
}

// Helper function to determine if a notification should be sent
function shouldSendNotification(event, details) {
  // Send notifications for relevant card events and comment events
  const relevantEvents = [
    'cardCreate',
    'cardUpdate', 
    'cardEdit',
    'cardMove',
    'cardArchive',
    'cardRestore',
    'commentCreate',
    'commentUpdate'
  ];
  
  return relevantEvents.includes(event) && details.slackChannels.length > 0;
}

// Helper function to send notification (placeholder for now)
function sendNotification(event, details) {
  console.log(`🔔 NOTIFICATION SHOULD BE SENT:`);
  console.log(`  Event: ${event}`);
  console.log(`  Card: ${details.cardTitle}`);
  console.log(`  Board: ${details.boardName}`);
  console.log(`  List: ${details.listName}`);
  console.log(`  User: ${details.username}`);
  console.log(`  Channels: ${details.slackChannels.join(', ')}`);
  console.log(`  Description: ${details.description || 'N/A'}`);
  console.log(`  ---`);
  
  // TODO: Integrate with Slack API here
  // For now, just log that notification should be sent
}

// Helper function to extract webhook details
function extractWebhookDetails(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    return { ...DEFAULT_DETAILS };
  }

  let details = { ...DEFAULT_DETAILS };

  // Handle Planka webhook format
  const { data: webhookData, user } = data || {};
  const { item, included } = webhookData || {};
  
  if (item) {
    // For comment events, the card title might be in included data
    if (data.event && (data.event.includes('Comment') || data.event.includes('comment'))) {
      details.isComment = true;
      details.commentText = item.text || item.content || 'N/A';
      
      // Try to get card title and description from included cards data
      const cards = included?.cards;
      if (cards && cards.length > 0) {
        details.cardTitle = cards[0].name || 'N/A';
        details.description = cards[0].description || null;
      }
    } else {
      // For regular card events, title is in item.name
      details.cardTitle = item.name || 'N/A';
      details.description = item.description || null;
    }
    
    details.username = user?.name || user?.username || 'N/A';
    
    // Extract board and list from included data
    const { boards, lists } = included || {};
    
    details.boardName = boards?.[0]?.name || 'N/A';
    details.listName = lists?.[0]?.name || 'N/A';
    
    // Parse description for Slack channels (for both card and comment events)
    details.slackChannels = parseNotifyChannels(details.description);
  }

  return details;
}

// Helper function to send JSON response
function sendJsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Helper function to read request body
function readRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
  });
}

// Helper function to validate access token
function validateAccessToken(req) {
  const authHeader = req.headers.authorization;
  const tokenHeader = req.headers['x-access-token'];
  const queryToken = url.parse(req.url, true).query.token;
  
  const providedToken = authHeader?.replace('Bearer ', '') || tokenHeader || queryToken;
  
  return providedToken === config.accessToken;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Access-Token');

  // Handle OPTIONS requests
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Route handling
  if (method === 'GET' && path === '/') {
    // Root GET endpoint for basic info
    sendJsonResponse(res, 200, {
      name: 'Planka Webhook Server',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        webhook: 'POST /webhook - Webhook endpoint (requires access token)',
        health: 'GET /health - Health check'
      },
      timestamp: new Date().toISOString()
    });

  } else if (method === 'POST' && path === '/webhook') {
    // Validate access token for webhook endpoint
    if (!validateAccessToken(req)) {
      console.log(`⚠️  Unauthorized webhook attempt from ${req.socket.remoteAddress}`);
      sendJsonResponse(res, 401, {
        error: 'Unauthorized',
        message: 'Invalid or missing access token',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Read request body for POST requests
    const body = await readRequestBody(req);
    
    // Webhook endpoint for Planka
    const details = extractWebhookDetails(body);
    console.log(`Webhook POST received via /webhook`);
    console.log(`  Event: ${JSON.parse(body).event || 'unknown'}`);
    console.log(`  Card: ${details.cardTitle}`);
    console.log(`  Board: ${details.boardName}`);
    console.log(`  List: ${details.listName}`);
    console.log(`  User: ${details.username}`);
    
    if (details.isComment) {
      console.log(`  Comment: ${details.commentText}`);
    } else if (details.slackChannels.length > 0) {
      console.log(`  Slack Channels: ${details.slackChannels.join(', ')}`);
    }
    
    if (shouldSendNotification(JSON.parse(body).event, details)) {
      sendNotification(JSON.parse(body).event, details);
    }
    
    sendJsonResponse(res, 200, {
      status: 'success',
      message: 'Webhook received successfully',
      timestamp: new Date().toISOString()
    });

  } else if (method === 'GET' && path === '/health') {
    // Health check endpoint
    sendJsonResponse(res, 200, {
      status: 'healthy',
      message: 'Webhook server is running',
      timestamp: new Date().toISOString()
    });

  } else {
    // Catch-all route for any other requests
    console.log(`⚠️  Unhandled ${method} request to ${path}`);
    sendJsonResponse(res, 404, {
      error: 'Not found',
      message: 'This endpoint is not configured',
      availableEndpoints: ['POST /webhook', 'GET /', 'GET /health']
    });
  }
});

// Start the server
server.listen(PORT, () => {
  console.log(`🚀 Webhook server is running on port ${PORT}`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('\nWaiting for Planka webhooks...\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down webhook server...');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
  
  // Force exit after 5 seconds if server doesn't close
  setTimeout(() => {
    console.log('⚠️  Forcing shutdown...');
    process.exit(1);
  }, 5000);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down webhook server...');
  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });
  
  // Force exit after 5 seconds if server doesn't close
  setTimeout(() => {
    console.log('⚠️  Forcing shutdown...');
    process.exit(1);
  }, 5000);
}); 