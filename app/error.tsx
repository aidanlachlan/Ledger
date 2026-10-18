"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="card">
      <h1>Something could not be loaded.</h1>
      <p className="muted">
        Your saved purchases are still there. Please try again.
      </p>
      <button onClick={reset}>Try again</button>
    </section>
  );
}
