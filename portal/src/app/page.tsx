import Link from "next/link";
import Image from "next/image";

const steps = [
  {
    n: "1",
    title: "Verify",
    body: "OTP signup once, then password login. Submit NID front & back for KYC.",
  },
  {
    n: "2",
    title: "Buy package",
    body: "Choose Human Calling or AI Auto Calling minutes with an expiry date.",
  },
  {
    n: "3",
    title: "Use API",
    body: "After payment, get your token + user ID and integrate calling into your own system.",
    accent: true,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-ink">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-line px-6 py-[18px] md:px-12 md:py-[22px]">
        <Link href="/" className="inline-flex items-center">
          <Image
            src="/selorax-logo.png"
            alt="SeloraX"
            width={117}
            height={36}
            priority
            className="h-9 w-auto"
          />
        </Link>
        <div className="flex items-center gap-4 md:gap-[22px]">
          <Link
            href="/login"
            className="px-1 py-2.5 text-[15px] font-semibold text-navy-deep"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-[10px] bg-navy px-5 py-3 text-[15px] font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-navy-deep hover:shadow-lg hover:shadow-navy/20"
          >
            Create account
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-[1200px] overflow-hidden px-6 pb-6 pt-8 md:px-12 md:pb-8 md:pt-12">
        <svg
          className="pointer-events-none absolute right-5 top-[20px] hidden h-[300px] w-[300px] opacity-90 md:block"
          viewBox="0 0 340 340"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="170" cy="170" r="168" stroke="#E6E8F2" strokeWidth="1.2" />
          <circle cx="170" cy="170" r="120" stroke="#E6E8F2" strokeWidth="1.2" />
          <path
            d="M60 210 L150 130 L190 165 L280 90"
            stroke="#2A2A78"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M240 90 L280 90 L280 130"
            stroke="#FF8025"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="60" cy="210" r="6" fill="#2A2A78" />
          <circle cx="150" cy="130" r="5" fill="#2A2A78" />
          <circle cx="190" cy="165" r="5" fill="#2A2A78" />
          <circle cx="280" cy="90" r="7" fill="#FF8025" />
        </svg>

        <div className="mb-5 inline-flex items-center gap-2.5 rounded-[4px] border border-line border-l-[3px] border-l-orange bg-surface px-4 py-2 font-display text-[12.5px] font-bold tracking-[0.16em] text-navy-deep">
          <span className="inline-block h-[5px] w-[5px] rotate-45 bg-orange" />
          CALL CENTER API PORTAL
        </div>

        <h1 className="mb-[22px] max-w-[760px] font-display text-[38px] font-bold leading-[1.08] tracking-[-0.01em] text-ink md:text-[56px]">
          Buy minutes. Get your API.
          <br />
          Start <span className="text-orange">calling.</span>
        </h1>

        <p className="mb-7 max-w-[600px] text-[18px] leading-[1.6] text-brand-slate">
          Sign up with your phone, complete NID verification, choose a Human or AI
          calling package, pay securely, and receive API credentials for your own
          system.
        </p>

        <div className="flex flex-wrap gap-[14px]">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-[10px] bg-navy px-7 py-3.5 text-[15.5px] font-semibold text-white shadow-sm transition hover:-translate-y-px hover:bg-navy-deep hover:shadow-lg hover:shadow-navy/20"
          >
            Create account
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-[10px] border border-line bg-transparent px-7 py-3.5 text-[15.5px] font-semibold text-navy-deep transition hover:border-navy hover:bg-surface"
          >
            Log in
          </Link>
        </div>

        <div className="mt-6 flex items-center gap-2.5 text-[13px] text-brand-slate-soft">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path
              d="M12 2L4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6l-8-4z"
              stroke="#8A8FA3"
              strokeWidth="1.6"
            />
          </svg>
          NID-verified accounts · Encrypted payments · Instant API tokens
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-[1200px] px-6 pb-[70px] pt-0 md:px-12 md:pb-[100px]">
        <div className="mb-7 flex flex-wrap items-baseline justify-between gap-6">
          <h2 className="font-display text-[22px] font-semibold text-ink">
            How it works
          </h2>
          <span className="text-[13px] font-medium text-brand-slate-soft">
            Verify → Buy → Integrate
          </span>
        </div>

        <div className="relative grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.n}
              className="group rounded-[14px] border border-line bg-surface px-[26px] py-7 transition hover:-translate-y-0.5 hover:border-navy/25"
            >
              <div
                className={`mb-[18px] flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-[13px] font-bold text-white ${
                  step.accent ? "bg-orange" : "bg-navy"
                }`}
              >
                {step.n}
              </div>
              <h3 className="mb-2 font-display text-[17px] font-semibold text-ink">
                {step.title}
              </h3>
              <p className="text-[14.5px] leading-[1.55] text-brand-slate">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
