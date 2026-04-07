/**
 * connectionStore tests — Zustand store coverage
 *
 * Tests state management: toggles, telemetry updates, message history buffer,
 * Pip-Boy state (tools, MCP servers, command history), hardware feedback,
 * terminal fullscreen, and edge cases (buffer overflow, initial state).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useConnectionStore } from '@/store/connectionStore';
import type { MessageHistoryEntry, ToolInfo, McpServerInfo, StatusResponse } from '@/types/squad-rc';

function resetStore() {
  useConnectionStore.setState({
    status: 'disconnected',
    tunnelUrl: null,
    agentCount: 0,
    crtEnabled: true,
    audioEnabled: false,
    drawerOpen: false,
    telemetry: {
      latencyMs: null,
      inboundMps: 0,
      outboundMps: 0,
      connectedAt: null,
      reconnectCount: 0,
      lastDisconnectAt: null,
      statusResponse: null,
      statusFetchedAt: null,
      tokenUsage: 0,
      messageCount: 0,
      successCount: 0,
    },
    messageHistory: [],
    tools: [],
    mcpServers: [],
    activeAgent: null,
    commandHistory: [],
    uplinkOverride: false,
    radsAlert: false,
    thinking: false,
    terminalFullscreen: false,
  });
}

describe('connectionStore', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('Initial state', () => {
    it('starts disconnected', () => {
      expect(useConnectionStore.getState().status).toBe('disconnected');
    });

    it('starts with CRT enabled', () => {
      expect(useConnectionStore.getState().crtEnabled).toBe(true);
    });

    it('starts with audio disabled', () => {
      expect(useConnectionStore.getState().audioEnabled).toBe(false);
    });

    it('starts with drawer closed', () => {
      expect(useConnectionStore.getState().drawerOpen).toBe(false);
    });

    it('starts with null telemetry latency', () => {
      expect(useConnectionStore.getState().telemetry.latencyMs).toBeNull();
    });

    it('starts with terminal not fullscreen', () => {
      expect(useConnectionStore.getState().terminalFullscreen).toBe(false);
    });
  });

  describe('Connection actions', () => {
    it('setStatus updates connection state', () => {
      useConnectionStore.getState().setStatus('connected');
      expect(useConnectionStore.getState().status).toBe('connected');
    });

    it('setTunnelUrl stores URL', () => {
      useConnectionStore.getState().setTunnelUrl('https://tunnel.devtunnels.ms');
      expect(useConnectionStore.getState().tunnelUrl).toBe('https://tunnel.devtunnels.ms');
    });

    it('setTunnelUrl can clear to null', () => {
      useConnectionStore.getState().setTunnelUrl('https://tunnel.devtunnels.ms');
      useConnectionStore.getState().setTunnelUrl(null);
      expect(useConnectionStore.getState().tunnelUrl).toBeNull();
    });

    it('setAgentCount updates count', () => {
      useConnectionStore.getState().setAgentCount(5);
      expect(useConnectionStore.getState().agentCount).toBe(5);
    });
  });

  describe('Toggle actions', () => {
    it('toggleCRT flips crtEnabled', () => {
      expect(useConnectionStore.getState().crtEnabled).toBe(true);
      useConnectionStore.getState().toggleCRT();
      expect(useConnectionStore.getState().crtEnabled).toBe(false);
      useConnectionStore.getState().toggleCRT();
      expect(useConnectionStore.getState().crtEnabled).toBe(true);
    });

    it('toggleAudio flips audioEnabled', () => {
      expect(useConnectionStore.getState().audioEnabled).toBe(false);
      useConnectionStore.getState().toggleAudio();
      expect(useConnectionStore.getState().audioEnabled).toBe(true);
    });

    it('toggleDrawer flips drawerOpen', () => {
      expect(useConnectionStore.getState().drawerOpen).toBe(false);
      useConnectionStore.getState().toggleDrawer();
      expect(useConnectionStore.getState().drawerOpen).toBe(true);
      useConnectionStore.getState().toggleDrawer();
      expect(useConnectionStore.getState().drawerOpen).toBe(false);
    });

    it('setDrawerOpen sets directly', () => {
      useConnectionStore.getState().setDrawerOpen(true);
      expect(useConnectionStore.getState().drawerOpen).toBe(true);
      useConnectionStore.getState().setDrawerOpen(false);
      expect(useConnectionStore.getState().drawerOpen).toBe(false);
    });

    it('toggleFullscreen flips terminalFullscreen', () => {
      expect(useConnectionStore.getState().terminalFullscreen).toBe(false);
      useConnectionStore.getState().toggleFullscreen();
      expect(useConnectionStore.getState().terminalFullscreen).toBe(true);
      useConnectionStore.getState().toggleFullscreen();
      expect(useConnectionStore.getState().terminalFullscreen).toBe(false);
    });

    it('toggleUplinkOverride flips uplinkOverride', () => {
      expect(useConnectionStore.getState().uplinkOverride).toBe(false);
      useConnectionStore.getState().toggleUplinkOverride();
      expect(useConnectionStore.getState().uplinkOverride).toBe(true);
    });
  });

  describe('Telemetry actions', () => {
    it('updateTelemetry merges partial updates', () => {
      useConnectionStore.getState().updateTelemetry({ latencyMs: 42 });
      expect(useConnectionStore.getState().telemetry.latencyMs).toBe(42);
      // Other fields unchanged
      expect(useConnectionStore.getState().telemetry.inboundMps).toBe(0);
    });

    it('updateTelemetry supports multiple fields at once', () => {
      useConnectionStore.getState().updateTelemetry({
        latencyMs: 100,
        inboundMps: 2.5,
        outboundMps: 1.0,
        reconnectCount: 3,
      });
      const t = useConnectionStore.getState().telemetry;
      expect(t.latencyMs).toBe(100);
      expect(t.inboundMps).toBe(2.5);
      expect(t.outboundMps).toBe(1.0);
      expect(t.reconnectCount).toBe(3);
    });

    it('setStatusResponse stores response and timestamp', () => {
      const now = Date.now();
      const response: StatusResponse = {
        uptime: 3600,
        connections: 2,
        agents: [{ name: 'Woz', role: 'Dev', status: 'online' }],
      };
      useConnectionStore.getState().setStatusResponse(response);
      const t = useConnectionStore.getState().telemetry;
      expect(t.statusResponse).toEqual(response);
      expect(t.statusFetchedAt).toBeGreaterThanOrEqual(now);
    });
  });

  describe('Message history', () => {
    function makeEntry(id: string): MessageHistoryEntry {
      return {
        id,
        timestamp: Date.now(),
        direction: 'inbound',
        type: 'text',
        content: `Message ${id}`,
        raw: { type: 'text', content: `Message ${id}` },
      };
    }

    it('addMessageHistory appends entries', () => {
      useConnectionStore.getState().addMessageHistory(makeEntry('1'));
      useConnectionStore.getState().addMessageHistory(makeEntry('2'));
      expect(useConnectionStore.getState().messageHistory).toHaveLength(2);
    });

    it('caps at 50 entries (MAX_MESSAGE_HISTORY)', () => {
      for (let i = 0; i < 60; i++) {
        useConnectionStore.getState().addMessageHistory(makeEntry(String(i)));
      }
      const history = useConnectionStore.getState().messageHistory;
      expect(history).toHaveLength(50);
      // Oldest entries should be dropped — first entry should be #10
      expect(history[0].id).toBe('10');
      expect(history[49].id).toBe('59');
    });
  });

  describe('Command history', () => {
    it('addCommand appends commands', () => {
      useConnectionStore.getState().addCommand('/status');
      useConnectionStore.getState().addCommand('/help');
      expect(useConnectionStore.getState().commandHistory).toEqual(['/status', '/help']);
    });

    it('caps at 10 commands (MAX_COMMAND_HISTORY)', () => {
      for (let i = 0; i < 15; i++) {
        useConnectionStore.getState().addCommand(`/cmd${i}`);
      }
      const cmds = useConnectionStore.getState().commandHistory;
      expect(cmds).toHaveLength(10);
      expect(cmds[0]).toBe('/cmd5');
      expect(cmds[9]).toBe('/cmd14');
    });
  });

  describe('Pip-Boy state', () => {
    it('setTools stores tool list', () => {
      const tools: ToolInfo[] = [
        { name: 'grep', type: 'search', status: 'active' },
        { name: 'edit', type: 'file', status: 'inactive' },
      ];
      useConnectionStore.getState().setTools(tools);
      expect(useConnectionStore.getState().tools).toEqual(tools);
    });

    it('setMcpServers stores server list', () => {
      const servers: McpServerInfo[] = [
        { name: 'github-mcp', status: 'connected', url: 'https://mcp.example.com' },
      ];
      useConnectionStore.getState().setMcpServers(servers);
      expect(useConnectionStore.getState().mcpServers).toEqual(servers);
    });

    it('setActiveAgent stores agent name', () => {
      useConnectionStore.getState().setActiveAgent('Woz');
      expect(useConnectionStore.getState().activeAgent).toBe('Woz');
    });

    it('setActiveAgent can clear to null', () => {
      useConnectionStore.getState().setActiveAgent('Woz');
      useConnectionStore.getState().setActiveAgent(null);
      expect(useConnectionStore.getState().activeAgent).toBeNull();
    });
  });

  describe('Hardware feedback', () => {
    it('setRadsAlert sets alert state', () => {
      useConnectionStore.getState().setRadsAlert(true);
      expect(useConnectionStore.getState().radsAlert).toBe(true);
      useConnectionStore.getState().setRadsAlert(false);
      expect(useConnectionStore.getState().radsAlert).toBe(false);
    });

    it('setThinking sets thinking state', () => {
      useConnectionStore.getState().setThinking(true);
      expect(useConnectionStore.getState().thinking).toBe(true);
      useConnectionStore.getState().setThinking(false);
      expect(useConnectionStore.getState().thinking).toBe(false);
    });
  });
});
