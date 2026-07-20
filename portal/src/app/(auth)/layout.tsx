import { PublicNav } from "@/components/nav";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <PublicNav />
      <main className="mx-auto flex max-w-md flex-col px-4 py-10">{children}</main>
    </div>
  );
}
