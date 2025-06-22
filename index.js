const http = require('http');
const url = require('url');

const PORT = 3001;

// Helper function to extract webhook details
function extractWebhookDetails(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    return {
      cardTitle: 'N/A',
      boardName: 'N/A', 
      listName: 'N/A',
      username: 'N/A'
    };
  }

  let details = {
    cardTitle: 'N/A',
    boardName: 'N/A', 
    listName: 'N/A',
    username: 'N/A'
  };

  // Handle Planka webhook format
  if (data.data && data.data.item) {
    details.cardTitle = data.data.item.name || 'N/A';
    details.username = data.user?.name || data.user?.username || 'N/A';
    
    // Extract board and list from included data
    const boards = data.data.included?.boards;
    const lists = data.data.included?.lists;
    
    details.boardName = boards?.[0]?.name || 'N/A';
    details.listName = lists?.[0]?.name || 'N/A';
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
  if (method === 'POST' && path === '/') {
    // Root endpoint - handles webhooks sent to the base URL
    const details = extractWebhookDetails(body);
    console.log(`Webhook POST received via /`);
    console.log(`  Card: ${details.cardTitle}`);
    console.log(`  Board: ${details.boardName}`);
    console.log(`  List: ${details.listName}`);
    console.log(`  User: ${details.username}`);
    
    sendJsonResponse(res, 200, {
      status: 'success',
      message: 'Webhook received successfully at root endpoint',
      timestamp: new Date().toISOString()
    });

  } else if (method === 'GET' && path === '/') {
    // Root GET endpoint for basic info
    sendJsonResponse(res, 200, {
      name: 'Planka Webhook Server',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        root: 'POST / - Accepts webhooks',
        webhook: 'POST /webhook - Standard webhook endpoint',
        health: 'GET /health - Health check'
      },
      timestamp: new Date().toISOString()
    });

  } else if (method === 'POST' && path === '/webhook') {
    // Webhook endpoint for Planka
    const details = extractWebhookDetails(body);
    console.log(`Webhook POST received via /webhook`);
    console.log(`  Card: ${details.cardTitle}`);
    console.log(`  Board: ${details.boardName}`);
    console.log(`  List: ${details.listName}`);
    console.log(`  User: ${details.username}`);
    
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
      availableEndpoints: ['POST /', 'POST /webhook', 'GET /', 'GET /health']
    });
  }
});

// Start the server
server.listen(PORT, () => {
  console.log(`🚀 Webhook server is running on port ${PORT}`);
  console.log(`📡 Root webhook URL: http://localhost:${PORT}/`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('\nWaiting for Planka webhooks...\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down webhook server...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down webhook server...');
  server.close(() => {
    process.exit(0);
  });
}); 