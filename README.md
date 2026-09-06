# KChat

A minimal, private-by-design AI chat workspace with Bring Your Own API Key.

## Use

1. Install dependencies: `npm install`
2. Start: `npm run dev`
3. Open KChat and paste your OpenAI API key in **Settings**.
4. Set the model ID available to your account (the default is `gpt-6`).
5. Start chatting.

## Architecture

- React + Vite frontend.
- Requests go directly from the browser to the OpenAI Responses API.
- The API key is stored in `sessionStorage`, not in KChat's database or source code.
- Conversations and model settings are stored locally in the browser.
- No KChat backend is required for the BYOK flow.

> Important: a browser app cannot make an API key completely secret. Treat a key used in a client-side app as exposed to the browser environment and use a key with appropriate limits/billing controls.
