"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const SolManagerSidecar = dynamic(
  () => import("@/sol-manager-sidecar").then((mod) => mod.SolManagerSidecar),
  { ssr: false }
);

/** Analytics keeps its own brief. Teleprompter stays free of operator chrome. */
const HIDDEN_PREFIXES = ["/admin/analytics", "/admin/teleprompter"];

export function SolStudioMount({ canView, canOperate }: { canView: boolean; canOperate: boolean }) {
  const pathname = usePathname() || "/admin";
  if (!canView) return null;
  if (HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;
  return <SolManagerSidecar canOperate={canOperate} />;
}
