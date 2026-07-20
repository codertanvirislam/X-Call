import Link from "next/link";
import { PublicNav } from "@/components/nav";
import { Button, Card } from "@/components/ui";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <PublicNav />
      <main className="mx-auto max-w-5xl px-4 py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            Call Center API Portal
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
            Buy minutes. Get your API. Start calling.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Sign up with your phone, complete NID verification, choose a Human or AI calling
            package, pay securely, and receive API credentials for your own system.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button>Create account</Button>
            </Link>
            <Link href="/login">
              <Button variant="secondary">Login</Button>
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "1. Verify",
              body: "OTP signup once, then password login. Submit NID front & back for KYC.",
            },
            {
              title: "2. Buy package",
              body: "Choose Human Calling or AI Auto Calling minutes with an expiry date.",
            },
            {
              title: "3. Use API",
              body: "After payment, get token + user id and integrate calling into your system.",
            },
          ].map((item) => (
            <Card key={item.title}>
              <h2 className="font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{item.body}</p>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
