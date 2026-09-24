import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const sharedDataFile = path.resolve(process.cwd(), '.meso-shared-data.json');

function readSharedData(): Record<string, unknown[]> {
  try {
    return JSON.parse(fs.readFileSync(sharedDataFile, 'utf8')) as Record<string, unknown[]>;
  } catch {
    return {};
  }
}

function writeSharedData(data: Record<string, unknown[]>) {
  fs.writeFileSync(sharedDataFile, JSON.stringify(data, null, 2));
}

function sharedDataPlugin() {
  const install = (middlewares: {
    use: (
      handler: (
        req: IncomingMessage,
        res: ServerResponse,
        next: () => void,
      ) => void,
    ) => void;
  }) => {
    middlewares.use((req, res, next) => {
      const match = req.url?.match(/^\/__meso_shared_data\/([a-z0-9_-]+)$/i);
      if (!match) return next();

      const table = match[1];
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const store = readSharedData();
          const body = chunks.length
            ? (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { rows?: unknown[]; fallback?: unknown[] })
            : {};

          if (req.method === 'PUT') {
            store[table] = Array.isArray(body.rows) ? body.rows : [];
            writeSharedData(store);
          } else if (!Array.isArray(store[table])) {
            store[table] = Array.isArray(body.fallback) ? body.fallback : [];
            writeSharedData(store);
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ rows: store[table] ?? [] }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Shared data error' }));
        }
      });
    });
  };

  return {
    name: 'meso-shared-browser-data',
    configureServer(server: { middlewares: Parameters<typeof install>[0] }) {
      install(server.middlewares);
    },
    configurePreviewServer(server: { middlewares: Parameters<typeof install>[0] }) {
      install(server.middlewares);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  // Relative assets keep the same build working locally and on GitHub Pages.
  base: './',
  plugins: [react(), sharedDataPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
