export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-teal-900/30 to-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-500/10 via-transparent to-transparent" aria-hidden="true" />
      <main className="relative z-10 w-full max-w-sm px-4">{children}</main>
    </div>
  );
}
