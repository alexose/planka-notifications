# Planka Notifications

A minimal webhook server that bridges Planka's notification system with Slack, turning card activities into beautiful, contextual messages.

## Philosophy

Planka is a great kanban tool, but its notifications are limited to the web interface. This project extends Planka's reach by transforming card events—creations, updates, moves, comments—into rich Slack notifications that keep teams informed without context switching.

The goal is simple: when something happens on a card, the right people get notified in the right place with the right context.

## How It Works

Cards with `notify` in their description trigger Slack messages. The system is flexible—you can notify channels (`&shared`, `#general`) and users (`@john`) in natural language:

```
notify &team-alpha @john
please notify #general &urgent
notification: @admin
```

## Setup

1. Copy `config.js.example` to `config.js`
2. Add your Slack webhook URL
3. Configure Planka to send webhooks to your server
4. Add `notify` strings to card descriptions

That's it. No complex integrations, no external dependencies—just a simple bridge between two systems that should talk to each other.

## The Result

Instead of checking Planka constantly, your team gets contextual updates in Slack:

- 🆕 New cards appear with board/list context
- ✏️ Updates show what changed and by whom  
- 📤 Card moves track workflow progress
- 💬 Comments include the full conversation

The notifications are rich, actionable, and respect your team's existing workflow. 