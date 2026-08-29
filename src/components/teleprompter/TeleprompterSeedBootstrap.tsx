"use client";

import { useEffect, useState } from "react";
import { loadTeleprompterDocuments } from "@/lib/teleprompter/seeded-storage";

export default function TeleprompterSeedBootstrap({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadTeleprompterDocuments();
    setReady(true);
  }, []);

  if (!ready) return null;
  return children;
}
