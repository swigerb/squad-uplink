import { useConnectionStore } from '@/store/connectionStore';

export function PipBoyStat() {
  const thinking = useConnectionStore((s) => s.thinking);
  const telemetry = useConnectionStore((s) => s.telemetry);

  return (
    <div className="pipboy-stat pipboy-stat-with-vaultboy" data-testid="pipboy-stat">
      <div className="pipboy-stat-vaultboy-col">
        <div className="pipboy-bar-above" />
        <div
          className={`pipboy-vaultboy ${thinking ? 'pipboy-vaultboy-thinking' : ''}`}
          data-testid="vault-boy"
          role="img"
          aria-label="Vault Boy character"
        >
          <div className="pipboy-bar1" />
          <div className="pipboy-bar2" />
          <div className="pipboy-bar3" />
          <div className="pipboy-bar4" />
          <div className="pipboy-bar5" />
          <div className="pipboy-bar6" />
        </div>

        {/* Stat icons with numbers — STAT tab only */}
        <div className="pipboy-info-bar pipboy-info-bar-inline">
          <span className="pipboy-weapon" />
          <span className="pipboy-aim"><p>21</p></span>
          <span className="pipboy-helmet" />
          <span className="pipboy-shield"><p>110</p></span>
          <span className="pipboy-voltage"><p>126</p></span>
          <span className="pipboy-nuclear"><p>35</p></span>
        </div>
      </div>

      <div className="pipboy-stat-footer">
        MSGS: {telemetry.messageCount} | RECONNECTS:{' '}
        {telemetry.reconnectCount}
      </div>
    </div>
  );
}
