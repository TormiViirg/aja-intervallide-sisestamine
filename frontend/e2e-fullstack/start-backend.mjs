// Starts the unchanged Express app from ../backend with its in-memory repository for full-stack tests.
// (backend/src/server.js additionally needs `dotenv`, which isn't in the committed backend/node_modules.)
import { createApp } from '../../backend/src/app.js';

const port = Number(process.env.PORT ?? 3001);
createApp().listen(port, () => console.log(`backend (memory) on ${port}`));
