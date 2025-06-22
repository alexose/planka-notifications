# Planka Webhook Server

A simple Node.js webhook server that listens for webhooks from the Planka kanban application.

## Features

- Listens on port 3001 for incoming webhooks
- Logs all incoming requests with detailed information
- Provides a root endpoint that auto-detects webhook format
- Provides a dedicated `/webhook` endpoint for Planka
- Provides an `/apprise` endpoint for Apprise-formatted webhooks
- Includes health check endpoint
- Graceful shutdown handling

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

## Usage

The server will start on `http://localhost:3001` with the following endpoints:

- **POST `/`** - Root endpoint that accepts webhooks (auto-detects format)
- **GET `/`** - Server information and available endpoints
- **POST `/webhook`** - Standard webhook endpoint for Planka
- **POST `/apprise`** - Apprise-formatted webhook endpoint for Planka
- **GET `/health`** - Health check endpoint
- **Any other route** - Returns 404 with available endpoints

## Webhook URLs

Configure your Planka webhook to point to any of these URLs:

**Root endpoint (recommended - auto-detects format):**
```
http://localhost:3001/
```

**Standard webhook:**
```
http://localhost:3001/webhook
```

**Apprise webhook:**
```
http://localhost:3001/apprise
```

## Auto-Detection

The root endpoint (`POST /`) automatically detects whether the webhook is in Apprise format or standard format based on the presence of `title` and `body` fields. This makes it the most flexible option for Planka configuration.

## Apprise Format

The `/apprise` endpoint and root endpoint are designed to handle Apprise-formatted webhooks from Planka. They will parse and log the following Apprise fields:

- `title` - Notification title
- `body` - Notification body/message
- `type` - Notification type
- `format` - Message format
- `tag` - Notification tags
- `url` - Related URL

## Console Output

The server will log all incoming requests with:
- Request method and URL
- Headers
- Request body
- Query parameters
- Timestamp

For Apprise webhooks, it will also display formatted fields for better readability.

## Example Output

```
🚀 Webhook server is running on port 3001
📡 Root webhook URL: http://localhost:3001/
📡 Webhook URL: http://localhost:3001/webhook
📢 Apprise URL: http://localhost:3001/apprise
🏥 Health check: http://localhost:3001/health
⏰ Started at: 2024-01-15T10:30:00.000Z

Waiting for Planka webhooks...

=== Incoming POST Request ===
URL: /
Headers: { 'content-type': 'application/json', ... }
Body: { "title": "New Card Created", "body": "A new card was added to the board", ... }
Query: {}
Timestamp: 2024-01-15T10:30:15.000Z
=====================================

🎯 Planka webhook received at root!
Webhook data: {
  "title": "New Card Created",
  "body": "A new card was added to the board",
  "type": "info",
  "format": "text"
}
📢 Detected Apprise format webhook
📋 Title: New Card Created
📝 Body: A new card was added to the board
🏷️  Type: info
📄 Format: text
```

## Stopping the Server

Press `Ctrl+C` to gracefully stop the server. 