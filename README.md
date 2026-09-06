# KChat 2

A premium, Gemini-inspired personal AI chat workspace rebuilt with **Next.js + TypeScript**.

## Stack

- Next.js 16 / App Router
- React 19
- TypeScript
- Lucide icons
- Custom CSS design system (no UI kit dependency)

## Features

- Gemini-style spacious AI workspace
- Premium dark/light visual system
- Responsive desktop + mobile sidebar
- Multiple conversations and local history
- Search conversations
- Streaming OpenAI Responses API output
- BYOK API key flow stored in browser session storage
- Editable model ID, system instructions, and temperature
- Stop generation, copy responses, starter prompts
- No KChat backend required

## Run

```bash
npm install
npm run dev
```

Open the local URL, add your API key, choose a model ID supported by your API account, and start chatting.

## Security

The API key stays in the browser's `sessionStorage` and is sent directly to the selected API endpoint. It is not included in source code or this repository. Browser-side API keys are still not equivalent to a server-side secret, so use appropriate API limits and billing controls.

## Design direction

KChat 2 intentionally avoids copying proprietary assets. The visual language is inspired by modern premium AI products: calm spacing, minimal chrome, soft gradients, elevated composer, restrained borders, and a conversation-first layout.
