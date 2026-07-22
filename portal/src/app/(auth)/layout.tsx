export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f4fa] px-6 py-10">
      <div className="w-full max-w-[400px]">{children}</div>
    </div>
  );
}
