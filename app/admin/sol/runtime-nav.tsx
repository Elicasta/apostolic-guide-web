import Link from "next/link";

export function SolRuntimeNav() {
  return <nav className="sol-runtime-nav" aria-label="SOL Runtime">
    <Link href="/admin/sol">SOL</Link>
    <Link href="/admin/sol/runs">Runs</Link>
    <Link href="/admin/sol/reviews">Reviews</Link>
    <Link href="/admin/sol/artifacts">Artifacts</Link>
    <Link href="/admin/sol/system">System</Link>
  </nav>;
}
