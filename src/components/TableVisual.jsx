/** A dining table drawn from above with chairs around it (colour follows the .tcard status). */
export default function TableVisual({ name, capacity = 4 }) {
  const seats = Math.max(1, Math.min(12, Number(capacity) || 4));
  const top = Math.ceil(seats / 2);
  const bot = Math.floor(seats / 2);
  return (
    <div className="tbl">
      <div className="chairs">{Array.from({ length: top }, (_, i) => <span key={i} className="chair" />)}</div>
      <div className="top"><bdi>{name}</bdi></div>
      {bot > 0 && <div className="chairs bot">{Array.from({ length: bot }, (_, i) => <span key={i} className="chair" />)}</div>}
    </div>
  );
}
