import { Link } from "react-router-dom";

export function ErrorPage({ message = "Something went wrong" }: { message?: string }) {
  return (
    <section className="view">
      <div className="card" style={{ maxWidth: 480, margin: "10vh auto", padding: 32, textAlign: "center" }}>
        <span className="stamp overdue" style={{ fontSize: 13, padding: "5px 13px" }}>
          404
        </span>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, margin: "16px 0 6px" }}>
          {message}
        </h1>
        <p style={{ color: "var(--mut)", fontSize: 13.5, marginBottom: 20 }}>
          The page you're looking for doesn't exist or has moved.
        </p>
        <Link className="btn btn-primary" to="/dashboard">
          Back to Dashboard
        </Link>
      </div>
    </section>
  );
}
