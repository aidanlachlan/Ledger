import Link from "next/link";
export default function NotFound() {
  return (
    <section className="card">
      <h1>Page not found.</h1>
      <Link className="button" href="/" prefetch={false}>
        Back to Home
      </Link>
    </section>
  );
}
