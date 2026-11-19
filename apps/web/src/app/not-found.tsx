import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-5xl">🧭</p>
      <h1 className="mt-3 text-2xl font-bold">Page not found</h1>
      <Link className="btn btn-primary mt-6" href="/">
        Back to today’s games
      </Link>
    </main>
  );
}
