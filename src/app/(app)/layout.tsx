import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/login");
  return (
    <div className="md:pl-60">
      <Nav email={user.email ?? ""} />
      <main className="mx-auto max-w-5xl px-5 pb-28 pt-8 md:px-10 md:pb-12">{children}</main>
    </div>
  );
}
