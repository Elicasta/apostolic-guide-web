"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "apostolic-guide:navigation-stack";

function readStack(): string[] {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack.slice(-24)));
  } catch {
    // Navigation still works through the homepage fallback when storage is unavailable.
  }
}

export function GlobalBackNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    const stack = readStack();
    if (stack.at(-1) !== pathname) stack.push(pathname);
    writeStack(stack);
    setCanGoBack(stack.length > 1);
  }, [pathname]);

  if (pathname === "/") return null;

  const goBack = () => {
    const stack = readStack();
    if (stack.at(-1) === pathname) stack.pop();
    const destination = stack.at(-1) ?? "/";
    writeStack(stack.length ? stack : ["/"]);
    router.push(destination);
  };

  return (
    <nav className="global-back-nav" aria-label="Page history">
      <div className="shell global-back-nav-inner">
        <button type="button" onClick={goBack} aria-label={canGoBack ? "Go back to the previous Apostolic Guide page" : "Return to the Apostolic Guide homepage"}>
          <ArrowLeft size={17} aria-hidden />
          <span>{canGoBack ? "Back" : "Home"}</span>
        </button>
      </div>
    </nav>
  );
}
