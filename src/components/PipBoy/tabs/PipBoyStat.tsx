import { useConnectionStore } from '@/store/connectionStore';

export function PipBoyStat() {
  const thinking = useConnectionStore((s) => s.thinking);

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

        {/* Stat icons with numbers — each icon sits above its value */}
        <div className="pipboy-info-bar pipboy-info-bar-inline">
          <span className="pipboy-stat-icon-group">
            <span className="pipboy-weapon" />
            <p>21</p>
          </span>
          <span className="pipboy-stat-icon-group">
            <span className="pipboy-helmet" />
            <p>110</p>
          </span>
          <span className="pipboy-stat-icon-group">
            <span className="pipboy-voltage" />
            <p>126</p>
          </span>
          <span className="pipboy-stat-icon-group">
            <span className="pipboy-nuclear" />
            <p>35</p>
          </span>
        </div>
      </div>
    </div>
  );
}
