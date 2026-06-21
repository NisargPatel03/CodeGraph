import { audioSonifier } from './audioSonifier';

export interface Collaborator {
  clientId: string;
  username: string;
  color: string;
  cursor?: { x: number; y: number };
  selectedNodeId?: string | null;
  viewMode?: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: Date;
  text: string;
  type: 'join' | 'leave' | 'select' | 'view' | 'trace';
}

export type CollabCallback = {
  onPeersChange: (peers: Map<string, Collaborator>) => void;
  onActivityLog: (entry: ActivityLogEntry) => void;
  onRemoteViewModeChange?: (viewMode: any) => void;
  onRemoteTraceTrigger?: (nodeId: string) => void;
  onRemoteRepoSync?: (repoName: string) => void;
  onPeerJoinedNeedSync?: () => void;
};

// Fun cyber-developer names for generation
const DEV_ADJECTIVES = ['Synth', 'Cyber', 'Byte', 'Quantum', 'Pixel', 'Vector', 'Logic', 'Hyper', 'Neural', 'Proxy'];
const DEV_NOUNS = ['Hacker', 'Coder', 'Daemon', 'Parser', 'Kernel', 'Node', 'Stack', 'Ghost', 'Matrix', 'Flow'];
const COLLAB_COLORS = [
  '#00f2fe', // Cyber Cyan
  '#ff007f', // Neon Pink
  '#10b981', // Emerald Green
  '#f59e0b', // Solar Amber
  '#a855f7', // Electric Violet
  '#f43f5e', // Rose Gold
  '#3b82f6', // Cobalt Blue
  '#ec4899', // Hot Pink
];

export function generateRandomUsername(): string {
  const adj = DEV_ADJECTIVES[Math.floor(Math.random() * DEV_ADJECTIVES.length)];
  const noun = DEV_NOUNS[Math.floor(Math.random() * DEV_NOUNS.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${adj}${noun}-${num}`;
}

export function getRandomColor(): string {
  return COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];
}

export class CollabManager {
  private ws: WebSocket | null = null;
  private roomId: string = '';
  private clientId: string = '';
  private username: string = '';
  private color: string = '';
  private peers: Map<string, Collaborator> = new Map();
  private callbacks: CollabCallback;

  // Throttle timer for outgoing mouse positions
  private lastCursorSendTime: number = 0;
  private cursorSendThrottleMs: number = 30; // Max 33 updates per second

  // Simulation parameters
  private isSimulating: boolean = false;
  private simIntervals: any[] = [];
  private nodesList: any[] = [];

  constructor(callbacks: CollabCallback) {
    this.callbacks = callbacks;
    this.clientId = Math.random().toString(36).substring(2, 9);
    this.username = generateRandomUsername();
    this.color = getRandomColor();
  }

  public getClientId() { return this.clientId; }
  public getUsername() { return this.username; }
  public getColor() { return this.color; }
  public getRoomId() { return this.roomId; }
  public getPeers() { return this.peers; }
  public getIsConnected() { return this.ws !== null && this.ws.readyState === WebSocket.OPEN; }
  public getIsSimulating() { return this.isSimulating; }

  public updateIdentity(username: string, color: string) {
    this.username = username;
    this.color = color;
    
    // If connected, we send an identity update message
    if (this.getIsConnected()) {
      this.send({
        type: 'identity_update',
        username,
        color
      });
    }
  }

  public joinRoom(roomId: string) {
    this.leaveRoom();
    this.roomId = roomId;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/collab?roomId=${encodeURIComponent(roomId)}&clientId=${this.clientId}&username=${encodeURIComponent(this.username)}&color=${encodeURIComponent(this.color)}`;

    console.log(`Connecting to Collaboration Room on: ${wsUrl}`);
    
    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        audioSonifier.playJoin();
        this.addLog(`Joined live room: ${roomId}`, 'join');
        this.notifyPeers();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.error('CollabManager message parsing error:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.error('Collaboration WebSocket encountered an error:', err);
      };

      this.ws.onclose = () => {
        audioSonifier.playLeave();
        this.addLog('Disconnected from room.', 'leave');
        this.peers.clear();
        this.notifyPeers();
        this.ws = null;
      };
    } catch (e) {
      console.error('Failed to instantiate WebSocket:', e);
      this.addLog('Failed to connect to collaboration server.', 'leave');
    }
  }

  public leaveRoom() {
    this.stopSimulation();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.peers.clear();
    this.notifyPeers();
    this.roomId = '';
  }

  public sendCursorMove(x: number | null, y: number | null) {
    if (this.isSimulating) return; // Simulation controls the cursor
    if (!this.getIsConnected()) return;

    const now = Date.now();
    if (now - this.lastCursorSendTime >= this.cursorSendThrottleMs) {
      if (x === null || y === null) {
        this.send({
          type: 'cursor_leave'
        });
      } else {
        this.send({
          type: 'cursor_move',
          x,
          y
        });
      }
      this.lastCursorSendTime = now;
    }
  }

  public sendNodeSelect(nodeId: string | null) {
    if (this.isSimulating) return;
    if (!this.getIsConnected()) return;

    this.send({
      type: 'node_select',
      nodeId
    });
  }

  public sendViewModeChange(viewMode: string) {
    if (this.isSimulating) return;
    if (!this.getIsConnected()) return;

    this.send({
      type: 'view_mode_change',
      viewMode
    });
  }

  public sendTraceTrigger(nodeId: string) {
    if (this.isSimulating) return;
    if (!this.getIsConnected()) return;

    this.send({
      type: 'trace_trigger',
      nodeId
    });
  }

  public sendRepoSync(repoName: string) {
    if (!this.getIsConnected()) return;

    this.send({
      type: 'repo_sync',
      repoName
    });
  }

  private send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(msg: any) {
    const senderId = msg.clientId;
    if (!senderId || senderId === this.clientId) return;

    switch (msg.type) {
      case 'room_peers': {
        const peerList = msg.peers || [];
        peerList.forEach((p: any) => {
          this.peers.set(p.clientId, {
            clientId: p.clientId,
            username: p.username,
            color: p.color,
            selectedNodeId: p.selectedNodeId || null,
            viewMode: p.viewMode || 'dependency'
          });
        });
        this.notifyPeers();
        break;
      }

      case 'user_joined': {
        audioSonifier.playJoin();
        this.peers.set(senderId, {
          clientId: senderId,
          username: msg.username,
          color: msg.color
        });
        this.addLog(`Developer '${msg.username}' joined.`, 'join');
        this.notifyPeers();
        if (this.callbacks.onPeerJoinedNeedSync) {
          this.callbacks.onPeerJoinedNeedSync();
        }
        break;
      }

      case 'repo_sync': {
        if (this.callbacks.onRemoteRepoSync) {
          this.callbacks.onRemoteRepoSync(msg.repoName);
        }
        break;
      }

      case 'user_left': {
        audioSonifier.playLeave();
        const peer = this.peers.get(senderId);
        if (peer) {
          this.addLog(`Developer '${peer.username}' left.`, 'leave');
          this.peers.delete(senderId);
          this.notifyPeers();
        }
        break;
      }

      case 'identity_update': {
        const peer = this.peers.get(senderId);
        if (peer) {
          const oldName = peer.username;
          peer.username = msg.username;
          peer.color = msg.color;
          this.addLog(`Developer '${oldName}' updated identity to '${msg.username}'.`, 'join');
          this.notifyPeers();
        }
        break;
      }

      case 'cursor_move': {
        const peer = this.peers.get(senderId);
        if (peer) {
          peer.cursor = { x: msg.x, y: msg.y };
          this.notifyPeers();
        }
        break;
      }

      case 'cursor_leave': {
        const peer = this.peers.get(senderId);
        if (peer && peer.cursor) {
          delete peer.cursor;
          this.notifyPeers();
        }
        break;
      }

      case 'node_select': {
        const peer = this.peers.get(senderId);
        if (peer) {
          peer.selectedNodeId = msg.nodeId;
          if (msg.nodeId) {
            audioSonifier.playCollaboratorSelect();
            this.addLog(`'${peer.username}' inspected '${msg.nodeId.split('/').pop() || msg.nodeId}'`, 'select');
          }
          this.notifyPeers();
        }
        break;
      }

      case 'view_mode_change': {
        const peer = this.peers.get(senderId);
        if (peer) {
          peer.viewMode = msg.viewMode;
          this.addLog(`'${peer.username}' switched view to '${msg.viewMode}'`, 'view');
          if (this.callbacks.onRemoteViewModeChange) {
            this.callbacks.onRemoteViewModeChange(msg.viewMode);
          }
          this.notifyPeers();
        }
        break;
      }

      case 'trace_trigger': {
        const peer = this.peers.get(senderId);
        if (peer) {
          const funcName = msg.nodeId.split('::').pop() || msg.nodeId;
          this.addLog(`'${peer.username}' initiated call trace on '${funcName}()'`, 'trace');
          if (this.callbacks.onRemoteTraceTrigger) {
            this.callbacks.onRemoteTraceTrigger(msg.nodeId);
          }
        }
        break;
      }
    }
  }

  private addLog(text: string, type: ActivityLogEntry['type']) {
    const entry: ActivityLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      text,
      type
    };
    this.callbacks.onActivityLog(entry);
  }

  private notifyPeers() {
    // Return a shallow copy of peers Map
    this.callbacks.onPeersChange(new Map(this.peers));
  }

  // --- Simulation Engine ---
  public startSimulation(nodes: any[]) {
    this.leaveRoom(); // Disconnect real ws if simulating
    this.isSimulating = true;
    this.nodesList = nodes;

    this.addLog('Started Local Room Simulation Mode', 'join');
    audioSonifier.playJoin();

    // Spawn 2 bot developers
    const bot1: Collaborator = {
      clientId: 'bot-cyber',
      username: 'DevCyber-🚀',
      color: '#00f2fe',
      cursor: { x: 0, y: 0 },
      selectedNodeId: null,
      viewMode: 'dependency'
    };

    const bot2: Collaborator = {
      clientId: 'bot-neo',
      username: 'DevNeo-🧬',
      color: '#ff007f',
      cursor: { x: 100, y: -100 },
      selectedNodeId: null,
      viewMode: 'dependency'
    };

    this.peers.set(bot1.clientId, bot1);
    this.peers.set(bot2.clientId, bot2);
    this.notifyPeers();

    this.addLog(`Developer '${bot1.username}' connected.`, 'join');
    this.addLog(`Developer '${bot2.username}' connected.`, 'join');

    // Bot 1 loop (Smooth Cursor Movements)
    let bot1Angle = 0;
    const bot1MoveInterval = setInterval(() => {
      if (!this.isSimulating) return;
      bot1Angle += 0.08;
      const targetRadius = 250;
      // Orbit around the center with some noise
      const x = Math.cos(bot1Angle) * targetRadius + Math.sin(bot1Angle * 2.3) * 50;
      const y = Math.sin(bot1Angle) * targetRadius + Math.cos(bot1Angle * 1.5) * 50;
      bot1.cursor = { x, y };
      this.notifyPeers();
    }, 45); // 22 FPS movement
    this.simIntervals.push(bot1MoveInterval);

    // Bot 2 loop (Lissajous Cursor Movements)
    let bot2Time = 0;
    const bot2MoveInterval = setInterval(() => {
      if (!this.isSimulating) return;
      bot2Time += 0.05;
      const x = Math.sin(bot2Time * 1.3) * 350;
      const y = Math.cos(bot2Time * 1.7) * 250;
      bot2.cursor = { x, y };
      this.notifyPeers();
    }, 45);
    this.simIntervals.push(bot2MoveInterval);

    // Bot 1 Random clicks & selections
    const bot1ActionInterval = setInterval(() => {
      if (this.nodesList.length === 0) return;
      const randomNode = this.nodesList[Math.floor(Math.random() * this.nodesList.length)];
      bot1.selectedNodeId = randomNode.id;
      audioSonifier.playCollaboratorSelect();
      this.addLog(`'${bot1.username}' selected '${randomNode.name || randomNode.id.split('/').pop()}'`, 'select');
      this.notifyPeers();
    }, 6000);
    this.simIntervals.push(bot1ActionInterval);

    // Bot 2 Random clicks & selections
    const bot2ActionInterval = setInterval(() => {
      if (this.nodesList.length === 0) return;
      const randomNode = this.nodesList[Math.floor(Math.random() * this.nodesList.length)];
      bot2.selectedNodeId = randomNode.id;
      audioSonifier.playCollaboratorSelect();
      this.addLog(`'${bot2.username}' selected '${randomNode.name || randomNode.id.split('/').pop()}'`, 'select');
      this.notifyPeers();
    }, 8500);
    this.simIntervals.push(bot2ActionInterval);

    // Bot random view mode switches
    const botViewInterval = setInterval(() => {
      const views = ['dependency', 'cluster', 'call', 'hierarchy'];
      const view = views[Math.floor(Math.random() * views.length)];
      const bot = Math.random() > 0.5 ? bot1 : bot2;
      bot.viewMode = view;
      this.addLog(`'${bot.username}' shifted view mode to '${view}'`, 'view');
      this.notifyPeers();
    }, 18000);
    this.simIntervals.push(botViewInterval);
  }

  public stopSimulation() {
    if (!this.isSimulating) return;
    this.isSimulating = false;
    this.simIntervals.forEach(clearInterval);
    this.simIntervals = [];
    this.peers.clear();
    this.notifyPeers();
    this.addLog('Simulation stopped.', 'leave');
    audioSonifier.playLeave();
  }
}
