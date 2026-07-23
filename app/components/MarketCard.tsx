import Link from "next/link";

export type MarketCardProps = {
  address: string;
  symbol: string;
  name: string;
  creator: string;
  price: string;
  volume: string;
  progress: number;
  change: string;
  tone: "green" | "peach" | "blue" | "violet";
};

export function MarketCard(props: MarketCardProps) {
  const positive = !props.change.startsWith("-");
  return (
    <Link className="market-card" href={`/token/${props.address}`}>
      <div className={`token-avatar tone-${props.tone}`} aria-hidden="true">
        {props.symbol.slice(0, 2)}
      </div>
      <div className="market-card-title">
        <div>
          <h3>${props.symbol}</h3>
          <p>{props.name}</p>
        </div>
        <span className={positive ? "change-up" : "change-down"}>
          {props.change}
        </span>
      </div>
      <dl className="market-stats">
        <div>
          <dt>Price</dt>
          <dd>{props.price} HOODIE</dd>
        </div>
        <div>
          <dt>24h volume</dt>
          <dd>{props.volume}</dd>
        </div>
      </dl>
      <div className="progress-meta">
        <span>Market forming</span>
        <strong>{props.progress}%</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${props.progress}%` }} />
      </div>
      <p className="creator-line">by {props.creator}</p>
    </Link>
  );
}

