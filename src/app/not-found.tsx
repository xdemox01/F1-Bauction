export default function NotFound() {
  return (
    <div className="empty empty--page">
      <h1>That card isn’t in the catalogue</h1>
      <p>The link may be out of date, or the card was retired.</p>
      <a className="button button--primary" href="/cards">Browse all cards</a>
    </div>
  );
}
