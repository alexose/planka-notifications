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
  slackTargets: [],
  commentText: null,
  isComment: false,
  description: null,
};

/**
 * Parses a description for Slack channel and user notifications.
 *
 * This function looks for lines that contain the words "notify" or "notification"
 * and extracts any Slack channel names or user mentions.
 *
 * Slack prefixes:
 * - & (ampersand) - for shared channels
 * - # (hash/pound) - for regular channels
 * - @ (at sign) - for user mentions
 *
 * The function is flexible and handles various formats:
 * - "notify &general" → finds &general
 * - "notification: #team-alpha" → finds #team-alpha
 * - "please notify @john &urgent, #important" → finds @john, &urgent, #important
 * - "NOTIFY &channel-name @user" → finds &channel-name, @user (case insensitive)
 * - "notify &channel1 #channel2 @user1 @user2" → finds all four targets
 *
 * @param {string} description - The text to parse for notifications
 * @returns {string[]} Array of Slack channels and users (including the prefix symbol)
 *
 * @example
 * const description = `
 *   This is a regular description line
 *   notify &general #team-alpha @john
 *   Another line with notification: &urgent @admin
 * `;
 * const targets = parseNotifyChannels(description);
 * // Returns: ['&general', '#team-alpha', '@john', '&urgent', '@admin']
 */
function parseNotifyChannels(description) {
  if (!description || typeof description !== 'string') {
    return [];
  }

  const targets = [];
  const lines = description.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check if line contains "notify" or "notification" (case insensitive)
    if (trimmedLine.toLowerCase().includes('notify') || trimmedLine.toLowerCase().includes('notification')) {
      // Find all strings starting with &, #, or @ followed by valid characters
      // This regex matches: &, #, or @ + one or more word characters, hyphens, or underscores
      const targetMatches = trimmedLine.match(/[&#@][a-zA-Z0-9_-]+/g);

      if (targetMatches) {
        // Add unique targets only (avoid duplicates)
        for (const target of targetMatches) {
          if (!targets.includes(target)) {
            targets.push(target);
          }
        }
      }
    }
  }

  return targets;
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
    'commentUpdate',
  ];

  return relevantEvents.includes(event) && details.slackTargets.length > 0;
}

// Helper function to send notification
async function sendNotification(event, details) {
  console.log(`🔔 NOTIFY: ${event} on "${details.cardTitle}" → ${details.slackTargets.join(', ')}`);

  // Send to Slack
  await sendSlackNotification(event, details, details.slackTargets);
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
    details.slackTargets = parseNotifyChannels(details.description);
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
    req.on('data', (chunk) => {
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

/**
 * Sends a notification to Slack using the Web API (Bot Token).
 *
 * @param {string} event - The Planka event type (e.g., 'cardCreate', 'commentCreate')
 * @param {Object} details - The card/comment details
 * @param {string[]} targets - Array of Slack targets (&channels, #channels, @users)
 * @returns {Promise<boolean>} - True if successful, false if failed
 */
async function sendSlackNotification(event, details, targets) {
  // Check if Slack Bot Token is configured
  if (!config.slack || !config.slack.botToken) {
    console.log('⚠️  Slack bot token not configured. Skipping notification.');
    return false;
  }

  try {
    // Determine the channel to post to
    let channel = config.slack.defaultChannel || '#general';
    const channelTargets = targets.filter((target) => target.startsWith('&') || target.startsWith('#'));

    if (channelTargets.length > 0) {
      // Use the first channel found
      channel = channelTargets[0];
    }

    // Build the message
    const message = buildSlackMessage(event, details, targets);

    // Convert channel name to proper format (remove prefix for API call)
    const channelName = channel.replace(/^[&#]/, '');

    // Prepare the API payload
    const payload = {
      channel: channelName,
      username: config.slack.botUsername || 'Planka Bot',
      icon_emoji: config.slack.botIcon || ':card_index:',
      text: message.attachments[0].text,
      attachments: message.attachments,
    };

    // Send via Web API
    const response = await makeSlackApiRequest('chat.postMessage', payload);

    if (response.ok) {
      console.log(`✅ Slack notification sent to ${channel}`);
      return true;
    } else {
      console.log(`❌ Slack notification failed: ${response.error}`);
      // If API fails due to channel access, log it
      if (response.error === 'channel_not_found' || response.error === 'not_in_channel') {
        await logChannelAccessError(channel, details.cardTitle);
      }
      return false;
    }
  } catch (error) {
    console.log(`❌ Error sending Slack notification: ${error.message}`);
    return false;
  }
}

/**
 * Builds the Slack message based on the event type and details.
 *
 * @param {string} event - The Planka event type
 * @param {Object} details - The card/comment details
 * @param {string[]} targets - Array of Slack targets
 * @returns {Object} - Slack message object
 */
function buildSlackMessage(event, details, targets) {
  const userTargets = targets.filter((target) => target.startsWith('@'));
  const userMentions = userTargets.length > 0 ? ` ${userTargets.join(' ')}` : '';

  // Event-specific messages
  let title, text, color;

  switch (event) {
    case 'cardCreate':
      title = '🆕 New Card Created';
      text = `*${details.cardTitle}* was created by ${details.username} in *${details.boardName}* > *${details.listName}*${userMentions}`;
      color = '#36a64f'; // Green
      break;

    case 'cardUpdate':
    case 'cardEdit':
      title = '✏️ Card Updated';
      text = `*${details.cardTitle}* was updated by ${details.username} in *${details.boardName}* > *${details.listName}*${userMentions}`;
      color = '#ff9500'; // Orange
      break;

    case 'cardMove':
      title = '📤 Card Moved';
      text = `*${details.cardTitle}* was moved by ${details.username} to *${details.listName}* in *${details.boardName}*${userMentions}`;
      color = '#007cba'; // Blue
      break;

    case 'commentCreate':
      title = '💬 New Comment';
      text = `${details.username} commented on *${details.cardTitle}* in *${details.boardName}* > *${details.listName}*${userMentions}\n\n>${details.commentText}`;
      color = '#9c27b0'; // Purple
      break;

    default:
      title = '📋 Card Activity';
      text = `*${details.cardTitle}* - ${event} by ${details.username} in *${details.boardName}* > *${details.listName}*${userMentions}`;
      color = '#607d8b'; // Grey
  }

  return {
    attachments: [
      {
        color: color,
        title: title,
        text: text,
        footer: 'Planka',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };
}

/**
 * Checks if the bot has access to a specific Slack channel using the Web API.
 *
 * @param {string} channel - The channel name (with # or & prefix)
 * @returns {Promise<boolean>} - True if bot has access, false otherwise
 */
async function checkChannelAccess(channel) {
  if (!config.slack.botToken) {
    return true; // Skip check if no bot token configured
  }

  try {
    // Convert channel name to proper format (remove prefix for API call)
    const channelName = channel.replace(/^[&#]/, '');
    
    const response = await makeSlackApiRequest('conversations.info', {
      channel: channelName,
    });

    return response.ok;
  } catch (error) {
    console.log(`❌ Error checking channel access for ${channel}: ${error.message}`);
    return false;
  }
}

/**
 * Logs a channel access error to the designated logging channel.
 *
 * @param {string} channel - The channel that couldn't be accessed
 * @param {string} cardTitle - The card title that triggered the notification
 */
async function logChannelAccessError(channel, cardTitle) {
  if (!config.slack.loggingChannel || !config.slack.botToken) {
    console.log(`⚠️  Cannot access ${channel} and no logging channel configured`);
    return;
  }

  try {
    const message = {
      channel: config.slack.loggingChannel.replace(/^#/, ''),
      text: `🚫 *Channel Access Needed*\n\nI need to be invited to ${channel} to send notifications.\n\nTriggered by Planka card: "${cardTitle}"\n\nTo fix this, someone with access to ${channel} should run:\n\`/invite @${config.slack.botUsername || 'Planka Bot'}\``,
      username: config.slack.botUsername || 'Planka Bot',
      icon_emoji: config.slack.botIcon || ':warning:',
    };

    await makeSlackApiRequest('chat.postMessage', message);
    console.log(`📝 Logged channel access error for ${channel} to ${config.slack.loggingChannel}`);
  } catch (error) {
    console.log(`❌ Error logging channel access error: ${error.message}`);
  }
}

/**
 * Makes a request to the Slack Web API.
 *
 * @param {string} method - The API method (e.g., 'chat.postMessage')
 * @param {Object} data - The request data
 * @returns {Promise<Object>} - The API response
 */
async function makeSlackApiRequest(method, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'slack.com',
      port: 443,
      path: `/api/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.slack.botToken}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = require('https').request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          resolve(response);
        } catch (error) {
          reject(new Error(`Invalid JSON response: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
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
        health: 'GET /health - Health check',
      },
      timestamp: new Date().toISOString(),
    });
  } else if (method === 'POST' && path === '/webhook') {
    // Validate access token for webhook endpoint
    if (!validateAccessToken(req)) {
      console.log(`⚠️  Unauthorized webhook attempt from ${req.socket.remoteAddress}`);
      sendJsonResponse(res, 401, {
        error: 'Unauthorized',
        message: 'Invalid or missing access token',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Read request body for POST requests
    const body = await readRequestBody(req);

    // Webhook endpoint for Planka
    const details = extractWebhookDetails(body);
    const event = JSON.parse(body).event || 'unknown';

    // Minimal debug output
    console.log(`📨 ${event} on "${details.cardTitle}"`);

    if (shouldSendNotification(event, details)) {
      sendNotification(event, details);
    }

    sendJsonResponse(res, 200, {
      status: 'success',
      message: 'Webhook received successfully',
      timestamp: new Date().toISOString(),
    });
  } else if (method === 'GET' && path === '/health') {
    // Health check endpoint
    sendJsonResponse(res, 200, {
      status: 'healthy',
      message: 'Webhook server is running',
      timestamp: new Date().toISOString(),
    });
  } else {
    // Catch-all route for any other requests
    console.log(`⚠️  Unhandled ${method} request to ${path}`);
    sendJsonResponse(res, 404, {
      error: 'Not found',
      message: 'This endpoint is not configured',
      availableEndpoints: ['POST /webhook', 'GET /', 'GET /health'],
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
