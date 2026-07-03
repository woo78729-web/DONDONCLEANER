export function PageAlert({ type = 'info', message }) {
  if (!message) {
    return null;
  }

  return <div className={`alert alert-${type}`}>{message}</div>;
}
