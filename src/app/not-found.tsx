import Link from "next/link";
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-3xl font-semibold">That page doesn&apos;t exist</h1>
      <p className="text-mist">It may have been deleted, or the link is wrong.</p>
      <Link href="/dashboard" className="btn-primary">Go to dashboard</Link>
    </main>
  );
}
