"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel p-6">
      <h1 className="text-2xl font-semibold">This page couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-bad">{error.message}</p>
      <p className="mt-2 text-sm text-mist">Check that the database migration has been run and the Supabase environment variables are set.</p>
      <button className="btn-primary mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
