import { redirect } from "next/navigation";
import { UserNav } from "@/components/nav";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.kind !== "STORE") redirect("/admin");

  return (
    <div className="min-h-screen">
      <UserNav />
      {children}
    </div>
  );
}
