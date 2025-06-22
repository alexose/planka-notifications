const http = require('http');
const url = require('url');

const PORT = 3001;

// Default webhook details
const DEFAULT_DETAILS = {
  cardTitle: 'N/A',
  boardName: 'N/A', 
  listName: 'N/A',
  username: 'N/A',
  slackChannels: [],
  commentText: null,
  isComment: false
};

// Helper function to parse card description for Slack channels
function parseSlackChannels(description) {
  if (!description) return [];
  
  const channels = [];
  const lines = description.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if line starts with "notify"
    if (trimmedLine.toLowerCase().startsWith('notify')) {
      // Find all strings starting with ampersand
      const ampersandMatches = trimmedLine.match(/&[^\s]+/g);
      if (ampersandMatches) {
        channels.push(...ampersandMatches);
      }
    }
  }
  
  return channels;
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
      
      // Try to get card title from included cards data
      const cards = included?.cards;
      if (cards && cards.length > 0) {
        details.cardTitle = cards[0].name || 'N/A';
      }
    } else {
      // For regular card events, title is in item.name
      details.cardTitle = item.name || 'N/A';
    }
    
    details.username = user?.name || user?.username || 'N/A';
    
    // Extract board and list from included data
    const { boards, lists } = included || {};
    
    details.boardName = boards?.[0]?.name || 'N/A';
    details.listName = lists?.[0]?.name || 'N/A';
    
    // Parse description for Slack channels (only for non-comment events)
    if (!details.isComment) {
      details.slackChannels = parseSlackChannels(item.description);
    }
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

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS requests
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Read request body for POST requests
  let body = '';
  if (method === 'POST') {
    body = await readRequestBody(req);
  }

  // Route handling
  if (method === 'GET' && path === '/') {
    // Root GET endpoint for basic info
    sendJsonResponse(res, 200, {
      name: 'Planka Webhook Server',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        webhook: 'POST /webhook - Webhook endpoint',
        health: 'GET /health - Health check'
      },
      timestamp: new Date().toISOString()
    });

  } else if (method === 'POST' && path === '/webhook') {
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