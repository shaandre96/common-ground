import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding-flow";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=/onboarding");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded")
    .eq("id", user.id)
    .single();

  if (profile?.onboarded) {
    redirect("/");
  }

  // Fetch every active proposition with its parent topic. We group them
  // client-side rather than in the query so the UI can render section
  // headers without an extra round-trip.
  const { data: propositions } = await supabase
    .from("propositions")
    .select("id, text, slug, topic:topic_id(id, name, slug)")
    .eq("active", true)
    .order("topic_id");

  type RawRow = {
    id: string;
    text: string;
    slug: string;
    topic: { id: string; name: string; slug: string } | null;
  };

  const grouped = new Map<
    string,
    {
      topic: { id: string; name: string; slug: string };
      propositions: { id: string; text: string; slug: string }[];
    }
  >();

  for (const row of (propositions ?? []) as unknown as RawRow[]) {
    if (!row.topic) continue;
    const existing = grouped.get(row.topic.id);
    if (existing) {
      existing.propositions.push({
        id: row.id,
        text: row.text,
        slug: row.slug,
      });
    } else {
      grouped.set(row.topic.id, {
        topic: row.topic,
        propositions: [{ id: row.id, text: row.text, slug: row.slug }],
      });
    }
  }

  const groups = Array.from(grouped.values()).sort((a, b) =>
    a.topic.name.localeCompare(b.topic.name),
  );

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 md:py-16">
      <Link href="/" className="font-serif text-xl tracking-tight mb-12">
        Common<span className="text-terracotta">·</span>Ground
      </Link>
      <OnboardingFlow groups={groups} />
    </div>
  );
}
