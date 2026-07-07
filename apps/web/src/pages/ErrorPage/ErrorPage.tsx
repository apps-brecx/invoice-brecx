import { Link } from "react-router-dom";

export function ErrorPage({ message = "Something went wrong" }: { message?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">🧭</div>
      <div className="empty-state-title">{message}</div>
      <div className="empty-state-desc">
        The page you're looking for doesn't exist or has moved.
      </div>
      <p>
        <Link className="btn" to="/dashboard">
          Back to Dashboard
        </Link>
      </p>
    </div>
  );
}
