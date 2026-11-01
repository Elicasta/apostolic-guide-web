import Link from "next/link";
import { createServiceClient } from "@/supabase";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(token);
  const service = createServiceClient();
  const subscriber = valid && service ? await service.from("email_subscribers").select("status").eq("unsubscribe_token", token).maybeSingle() : null;
  const isFound = Boolean(subscriber?.data);
  return <main style={{ maxWidth: 520, margin: "90px auto", padding: "24px", fontFamily: "Arial,sans-serif", color: "#10202a" }}>
    <Link href="/" style={{ color: "#a12d3d" }}>Apostolic Guide</Link>
    <h1>Email preferences</h1>
    {!isFound ? <p>This unsubscribe link is invalid or has expired.</p>
      : subscriber?.data?.status !== "subscribed" ? <p>You are already unsubscribed.</p>
      : <><p>Stop receiving future Apostolic Guide email updates?</p>
          <form action="/api/unsubscribe" method="post">
            <input type="hidden" name="token" value={token} />
            <button style={{ padding: "14px 20px", color: "white", background: "#a12d3d", border: 0, borderRadius: 8, cursor: "pointer" }} type="submit">Unsubscribe</button>
          </form></>}
  </main>;
}
