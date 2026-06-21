import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { WebSocketServer } from 'ws'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'collab-websocket-server',
      configureServer(server) {
        const wss = new WebSocketServer({ noServer: true });

        server.httpServer?.on('upgrade', (request, socket, head) => {
          const url = new URL(request.url || '', `http://${request.headers.host}`);
          if (url.pathname === '/collab') {
            wss.handleUpgrade(request, socket, head, (ws) => {
              wss.emit('connection', ws, request);
            });
          }
        });

        // Store client sets for each room: roomId -> Set of ws connections
        const rooms = new Map<string, Set<any>>();

        wss.on('connection', (ws, request) => {
          const url = new URL(request.url || '', `http://${request.headers.host}`);
          const roomId = url.searchParams.get('roomId') || 'default';
          const clientId = url.searchParams.get('clientId') || Math.random().toString(36).substring(2, 9);
          const username = url.searchParams.get('username') || 'Unknown';
          const color = url.searchParams.get('color') || '#ffffff';

          // Assign room metadata to socket connection
          (ws as any).roomId = roomId;
          (ws as any).clientId = clientId;
          (ws as any).username = username;
          (ws as any).color = color;

          if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
          }
          const clients = rooms.get(roomId)!;
          clients.add(ws);

          // Notify existing clients in the room about the new user,
          // and inform the new user about existing clients in the room.
          const currentPeers: any[] = [];
          clients.forEach((client) => {
            if (client !== ws && client.readyState === 1) {
              currentPeers.push({
                clientId: client.clientId,
                username: client.username,
                color: client.color,
                selectedNodeId: client.selectedNodeId || null,
                viewMode: client.viewMode || 'dependency'
              });
              // Send user_joined to existing client
              client.send(JSON.stringify({
                type: 'user_joined',
                clientId,
                username,
                color
              }));
            }
          });

          // Send list of current peers in room to the newly joined client
          ws.send(JSON.stringify({
            type: 'room_peers',
            peers: currentPeers
          }));

          ws.on('message', (messageStr) => {
            try {
              const message = JSON.parse(messageStr.toString());
              
              // Cache some state on the socket object for synchronization on new joins
              if (message.type === 'node_select') {
                (ws as any).selectedNodeId = message.nodeId;
              } else if (message.type === 'view_mode_change') {
                (ws as any).viewMode = message.viewMode;
              }

              // Broadcast message to all other clients in the same room
              clients.forEach((client) => {
                if (client !== ws && client.readyState === 1) {
                  client.send(JSON.stringify({
                    ...message,
                    clientId // ensure sender ID is attached
                  }));
                }
              });
            } catch (e) {
              console.error('Failed to process incoming WebSocket message:', e);
            }
          });

          ws.on('close', () => {
            clients.delete(ws);
            if (clients.size === 0) {
              rooms.delete(roomId);
            } else {
              // Notify remaining clients that this peer left
              clients.forEach((client) => {
                if (client.readyState === 1) {
                  client.send(JSON.stringify({
                    type: 'user_left',
                    clientId
                  }));
                }
              });
            }
          });
        });
      }
    }
  ],
})

