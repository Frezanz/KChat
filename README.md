# KChat

KChat is a premium, private AI chat workspace built with Next.js, TypeScript and React.

## Highlights

- Cinematic purple/black interface inspired by premium AI products
- Responsive desktop and mobile layouts
- Multiple local conversations with search and deletion
- Streaming Responses API chat
- Bring-your-own OpenAI API key
- Model ID, system prompt and temperature controls
- Dark/light appearance
- Copy assistant responses

## Security model

KChat does not proxy requests through its own server. The API key is stored in `sessionStorage` and sent directly from the browser to the configured API endpoint. Never put a real API key in source code or commit it to GitHub.

## Run

```bash
npm install
npm run dev
```

The app is designed to work as a static-friendly browser client, but it uses the Next.js runtime for development and deployment.
