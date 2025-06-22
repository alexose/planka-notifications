const express = require('express');

const app = express();
const PORT = 3001;

// Middleware to parse JSON bodies
app.use(express.json());

// Middleware to parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Helper function to extract webhook details
function extractWebhookDetails(req) {
  const data = req.body;
  let details = {
    cardTitle: 'N/A',
    boardName: 'N/A', 
    listName: 'N/A',
    username: 'N/A'
  };

  // Handle different webhook formats
  if (data.data && data.data.item) {
    // Standard Planka format - card data is in data.item
    details.cardTitle = data.data.item.name || 'N/A';
    details.username = data.user?.name || data.user?.username || 'N/A';
    
    // Extract board and list from included data
    if (data.data.included) {
      if (data.data.included.boards && data.data.included.boards.length > 0) {
        details.boardName = data.data.included.boards[0].name || 'N/A';
      }
      if (data.data.included.lists && data.data.included.lists.length > 0) {
        details.listName = data.data.included.lists[0].name || 'N/A';
      }
    }
  } else if (data.title) {
    // Apprise format - title might contain card info
    details.cardTitle = data.title;
    details.username = data.body?.match(/by\s+([^\n]+)/)?.[1] || 'N/A';
  }

  return details;
}

// Root endpoint - handles webhooks sent to the base URL
app.post('/', (req, res) => {
  const details = extractWebhookDetails(req);
  console.log(`Webhook POST received via /`);
  console.log(`  Card: ${details.cardTitle}`);
  console.log(`  Board: ${details.boardName}`);
  console.log(`  List: ${details.listName}`);
  console.log(`  User: ${details.username}`);
  
  // Respond with success
  res.status(200).json({ 
    status: 'success', 
    message: 'Webhook received successfully at root endpoint',
    timestamp: new Date().toISOString()
  });
});

// Root GET endpoint for basic info
app.get('/', (req, res) => {
  res.status(200).json({ 
    name: 'Planka Webhook Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      root: 'POST / - Accepts webhooks (auto-detects format)',
      webhook: 'POST /webhook - Standard webhook endpoint',
      apprise: 'POST /apprise - Apprise format endpoint',
      health: 'GET /health - Health check'
    },
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint for Planka
app.post('/webhook', (req, res) => {
  const details = extractWebhookDetails(req);
  console.log(`Webhook POST received via /webhook`);
  console.log(`  Card: ${details.cardTitle}`);
  console.log(`  Board: ${details.boardName}`);
  console.log(`  List: ${details.listName}`);
  console.log(`  User: ${details.username}`);
  
  // Respond with success
  res.status(200).json({ 
    status: 'success', 
    message: 'Webhook received successfully',
    timestamp: new Date().toISOString()
  });
});

// Apprise endpoint for Planka
app.post('/apprise', (req, res) => {
  const details = extractWebhookDetails(req);
  console.log(`Webhook POST received via /apprise`);
  console.log(`  Card: ${details.cardTitle}`);
  console.log(`  Board: ${details.boardName}`);
  console.log(`  List: ${details.listName}`);
  console.log(`  User: ${details.username}`);
  
  // Respond with success
  res.status(200).json({ 
    status: 'success', 
    message: 'Apprise webhook received successfully',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    message: 'Webhook server is running',
    timestamp: new Date().toISOString()
  });
});

// Catch-all route for any other requests
app.all('*', (req, res) => {
  console.log(`⚠️  Unhandled ${req.method} request to ${req.url}`);
  res.status(404).json({ 
    error: 'Not found',
    message: 'This endpoint is not configured',
    availableEndpoints: ['POST /', 'POST /webhook', 'POST /apprise', 'GET /', 'GET /health']
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Webhook server is running on port ${PORT}`);
  console.log(`📡 Root webhook URL: http://localhost:${PORT}/`);
  console.log(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
  console.log(`📢 Apprise URL: http://localhost:${PORT}/apprise`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('\nWaiting for Planka webhooks...\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down webhook server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down webhook server...');
  process.exit(0);
}); 