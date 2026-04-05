import { useConnectionStore } from '@/store/connectionStore';
import type { ToolInfo, McpServerInfo } from '@/types/squad-rc';

function ToolItem({ tool }: { tool: ToolInfo }) {
  const statusChar = tool.status === 'active' ? '●' : '○';
  const statusClass =
    tool.status === 'active' ? 'pipboy-inv-active' : 'pipboy-inv-inactive';

  return (
    <div className="pipboy-inv-item" data-testid={`tool-${tool.name}`}>
      <span className="pipboy-inv-cursor">&gt; </span>
      <span className={`pipboy-inv-status ${statusClass}`}>{statusChar}</span>
      <span className="pipboy-inv-name">{tool.name}</span>
      <span className="pipboy-inv-type">[{tool.type}]</span>
    </div>
  );
}

function McpItem({
  server,
  onToggle,
}: {
  server: McpServerInfo;
  onToggle: (name: string) => void;
}) {
  const statusChar = server.status === 'connected' ? '●' : '○';
  const statusClass =
    server.status === 'connected' ? 'pipboy-inv-active' : 'pipboy-inv-inactive';

  return (
    <div className="pipboy-inv-item pipboy-inv-mcp">
      <span className="pipboy-inv-cursor">&gt; </span>
      <span className={`pipboy-inv-status ${statusClass}`}>{statusChar}</span>
      <span className="pipboy-inv-name">{server.name}</span>
      {server.url && <span className="pipboy-inv-url">{server.url}</span>}
      <button
        className="pipboy-inv-toggle"
        onClick={() => onToggle(server.name)}
        aria-label={`Toggle ${server.name}`}
        data-testid={`mcp-toggle-${server.name}`}
      >
        [{server.status === 'connected' ? 'ON' : 'OFF'}]
      </button>
    </div>
  );
}

export function PipBoyInv() {
  const tools = useConnectionStore((s) => s.tools);
  const mcpServers = useConnectionStore((s) => s.mcpServers);
  const status = useConnectionStore((s) => s.status);

  const handleMcpToggle = (name: string) => {
    const store = useConnectionStore.getState();
    const updated = store.mcpServers.map((s) =>
      s.name === name
        ? {
            ...s,
            status: (s.status === 'connected'
              ? 'disconnected'
              : 'connected') as McpServerInfo['status'],
          }
        : s,
    );
    store.setMcpServers(updated);
  };

  const hasItems = tools.length > 0 || mcpServers.length > 0;

  return (
    <div className="pipboy-inv" data-testid="pipboy-inv">
      <div className="pipboy-inv-header">INVENTORY</div>

      {status === 'disconnected' && !hasItems ? (
        <div className="pipboy-inv-empty" data-testid="pipboy-inv-empty">
          NO ITEMS IN INVENTORY
        </div>
      ) : (
        <>
          <div className="pipboy-inv-section">
            <div className="pipboy-inv-section-title">
              TOOLS ({tools.length})
            </div>
            {tools.length === 0 ? (
              <div className="pipboy-inv-none">No tools registered</div>
            ) : (
              <div className="pipboy-inv-list">
                {tools.map((tool) => (
                  <ToolItem key={tool.name} tool={tool} />
                ))}
              </div>
            )}
          </div>

          <div className="pipboy-inv-section">
            <div className="pipboy-inv-section-title">
              MCP SERVERS ({mcpServers.length})
            </div>
            {mcpServers.length === 0 ? (
              <div className="pipboy-inv-none">No MCP connections</div>
            ) : (
              <div className="pipboy-inv-list">
                {mcpServers.map((server) => (
                  <McpItem
                    key={server.name}
                    server={server}
                    onToggle={handleMcpToggle}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
