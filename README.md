# AI Voice Sales Agent

An AI-powered voice assistant that conducts interactive sales conversations, captures customer responses, and generates actionable sales insights.

<p align="center">
  <img src="https://img.shields.io/badge/React-Vite-61DAFB?style=flat-square&logo=react&logoColor=white" alt="React and Vite" />
  <img src="https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js and Express" />
  <img src="https://img.shields.io/badge/AI-Google%20Gemini-4285F4?style=flat-square&logo=googlegemini&logoColor=white" alt="Google Gemini" />
  <img src="https://img.shields.io/badge/Status-In%20Development-orange?style=flat-square" alt="In development" />
</p>

## Overview

AI Voice Sales Agent is a web application designed to simulate a sales representative through natural voice and text interactions.

The application uses Google Gemini to generate conversational responses and analyze customer interactions. It provides a live transcript, consent-based recording, automated conversation summaries, sales status classification, and a call history dashboard.

The demonstration uses FlowPilot, a fictional workflow automation SaaS product.

## Features

| Feature | Description |
| --- | --- |
| AI voice conversations | Interact with an AI sales assistant using spoken or typed responses. |
| Multilingual interaction | Support depends on the selected language and the browser's speech capabilities. |
| Live transcript | View customer messages and AI responses during a conversation. |
| Call controls | Start and end calls while tracking duration and status. |
| Audio recording | Save and replay recordings when the required consent is provided. |
| Conversation summaries | Generate summaries of customer needs, objections, and suggested next steps. |
| Sales classification | Categorize conversations using six sales statuses. |
| Call history | Review saved conversations, transcripts, summaries, recordings, and outcomes. |
| Call management | Organize saved conversations and use the available restore and deletion controls. |

### Sales status categories

The application uses the following sales outcomes:

- Converted
- Interested
- Follow-up Required
- Not Interested
- Demo Requested
- No Response

## Technology stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend | React | User interface and interactive dashboard |
| Frontend tooling | Vite | Development server and production builds |
| Backend | Node.js | Server-side runtime |
| API framework | Express | HTTP endpoints and application logic |
| AI | Google Gemini API | Conversational responses and sales analysis |
| Speech input | Browser speech recognition | Convert customer speech into text |
| Speech output | Browser speech synthesis | Read AI responses aloud |
| Data storage | JSON files | Store call metadata and conversation history |
| Audio | MediaRecorder and Web Audio/Media APIs | Browser-side audio capture and recording support |

## Architecture

The application follows a client-server architecture.

```text
Customer
   |
   v
React + Vite frontend
   |
   | HTTP requests
   v
Node.js + Express backend
   |
   +------> Google Gemini API
   |          |
   |          v
   |      AI response and analysis
   |
   +------> JSON call storage
   |
   +------> Local recording storage
```

The frontend manages the conversation interface and browser speech capabilities. The backend handles AI requests, call records, conversation analysis, and recording persistence.

## Getting started

### Prerequisites

Install the following before running the application:

- Node.js with npm
- A Google Gemini API key
- A modern browser, preferably Chrome or Edge, for speech recognition support

Check your installation:

```bash
node --version
npm --version
```

### 1. Clone the repository

```bash
git clone https://github.com/saiabhiramdevarakonda-dot/ai-voice-sales-agent.git
cd ai-voice-sales-agent
```

### 2. Install dependencies

Install the root, frontend, and backend dependencies:

```bash
npm install
npm --prefix client install
npm --prefix server install
```

### 3. Configure environment variables

Create a file named `.env` inside the `server` directory.

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

Replace `your_gemini_api_key` with your own API key. Keep this file private and never commit it to Git.

`GEMINI_MODEL` selects the Gemini model. `PORT` sets the backend port, and `CLIENT_ORIGIN` configures the allowed frontend origin.

The server has a default model and port, so the corresponding variables can be omitted when those defaults are suitable.

### 4. Start the backend

Open a terminal in the project root:

```bash
npm --prefix server run dev
```

The backend should start on port `3001`, unless configured otherwise.

### 5. Start the frontend

Open a second terminal in the project root:

```bash
npm --prefix client run dev
```

Vite normally serves the frontend at:

```text
http://localhost:5173
```

Open that address in your browser.

Keep both terminal sessions running while using the application.

## Using the application

1. Open the web interface.
2. Select the available language and review the recording consent.
3. Start a call and allow microphone access if prompted.
4. Speak to the AI assistant or use the text input when available.
5. Review the live transcript and the assistant's responses.
6. End the conversation to save and analyze the call.
7. Review the summary, customer requirements, objections, next steps, and sales status.
8. Open call history to inspect saved conversations and use recording playback where available.

Actual speech recognition and playback support depend on the browser, operating system, and selected language.

## Configuration and storage

The backend uses JSON-file storage for this development version.

| Setting | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Authenticates requests to the Gemini API |
| `GEMINI_MODEL` | Selects the Gemini model |
| `PORT` | Sets the backend server port |
| `CLIENT_ORIGIN` | Configures the allowed frontend origin |
| `VOICE_SALES_DATA_DIR` | Optional override for the backend data directory, if supported by the current server implementation |

By default, call metadata is stored under the server's data directory, and recordings are saved in its recordings subdirectory.

For production use, configure persistent storage. Temporary deployment filesystems may not preserve recordings or call history across restarts or redeployments.

## Testing

Run the backend integration tests from the project root:

```bash
npm --prefix server test
```

Build the frontend for production:

```bash
npm --prefix client run build
```

These commands check the implemented backend test suite and generate a production frontend build. They do not replace end-to-end testing of microphone access, audio recording, playback, AI responses, or the deployed application.

## Security and privacy

- Keep API keys in environment variables.
- Do not commit `.env` files, recordings, or customer data.
- Obtain appropriate consent before recording conversations.
- Validate AI-generated summaries and sales classifications before relying on them for business decisions.
- Restrict access to call history and recordings before deploying for real customers.
- Use persistent, appropriately protected storage for production deployments.

## Limitations

- Speech recognition availability varies by browser and language.
- AI responses require a valid API key and available Gemini service.
- JSON-file storage is intended for a lightweight application and is not a substitute for a production database.
- The example SaaS product and its pricing are illustrative, not verified commercial offerings.
- Production deployment, recording completeness, persistence, and access control must be validated before real-world use.

## Future improvements

- Persistent database integration
- Secure user authentication and role-based access
- Cloud-based recording storage
- Automated end-to-end tests
- Deployment monitoring and error reporting
- Expanded language and speech compatibility

## Project information

Repository: [ai-voice-sales-agent](https://github.com/saiabhiramdevarakonda-dot/ai-voice-sales-agent)

This project is under active development. Features and setup instructions may evolve as the application is tested and deployed.