import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { RouteGuard } from "@/components/RouteGuard";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100/50">
      <Sidebar />
      <div className="pl-64">
        <Header />
        <main className="p-8 text-slate-800">
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>
    </div>
  );
}
