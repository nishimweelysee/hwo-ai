"use client";

import Link from "next/link";
import {
  BarChart3,
  Calendar,
  Bell,
  ChevronRight,
  CheckCircle2,
  Activity,
  Clock,
  Users,
  TrendingUp,
  Heart,
  ArrowRight,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

/* ── Animated counter hook ─────────────────────────────────────── */
function useCounter(target: number, duration = 2000, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setValue(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return value;
}

/* ── Feature card ──────────────────────────────────────────────── */
function FeatureCard({
  icon: Icon, title, description, color,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-teal-200 hover:shadow-md">
      <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mb-1 text-base font-semibold text-slate-800">{title}</h3>
      <p className="text-xs leading-relaxed text-slate-600">{description}</p>
    </div>
  );
}

/* ── Nav links config ──────────────────────────────────────────── */
const SECTIONS = ["home", "features", "how-it-works", "benefits"] as const;
type Section = typeof SECTIONS[number];

const NAV_LABELS: Record<Section, string> = {
  "home":         "Home",
  "features":     "Features",
  "how-it-works": "How it works",
  "benefits":     "Benefits",
};

/* ── Main page ─────────────────────────────────────────────────── */
export default function HomePage() {
  const [active, setActive] = useState<Section>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [statsStarted, setStatsStarted] = useState(false);

  const stat40  = useCounter(40,  1800, statsStarted);
  const stat95  = useCounter(95,  1800, statsStarted);
  const stat30  = useCounter(30,  1800, statsStarted);
  const stat500 = useCounter(500, 1800, statsStarted);

  function navigate(section: Section) {
    setActive(section);
    setMenuOpen(false);
    if (section === "features") setStatsStarted(true);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">

      {/* ── Skip nav ──────────────────────────────────────────── */}
      <a
        href="#panel"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-teal-600 focus:px-4 focus:py-2 focus:text-white focus:outline-none"
      >
        Skip to main content
      </a>

      {/* ── Navbar ────────────────────────────────────────────── */}
      <nav
        aria-label="Main navigation"
        className="shrink-0 border-b border-slate-100 bg-white/90 backdrop-blur-md z-50"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <button
            onClick={() => navigate("home")}
            className="flex items-center gap-2 focus:outline-none"
            aria-label="HWO home"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500">
              <BarChart3 className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            <span className="font-bold text-slate-800">HWO</span>
          </button>

          {/* Desktop nav */}
          <div className="hidden items-center gap-1 md:flex" role="tablist" aria-label="Page sections">
            {SECTIONS.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={active === s}
                onClick={() => navigate(s)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                  active === s
                    ? "bg-teal-50 text-teal-600"
                    : "text-slate-600 hover:text-teal-600 hover:bg-slate-50"
                }`}
              >
                {NAV_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Auth buttons */}
          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:text-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="flex items-center justify-center rounded-lg p-2 text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen
              ? <X className="h-5 w-5" aria-hidden="true" />
              : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div id="mobile-menu" className="border-t border-slate-100 bg-white px-6 pb-4 md:hidden">
            <div className="flex flex-col gap-1 pt-2">
              {SECTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => navigate(s)}
                  className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                    active === s
                      ? "bg-teal-50 text-teal-600"
                      : "text-slate-700 hover:bg-slate-50 hover:text-teal-600"
                  }`}
                >
                  {NAV_LABELS[s]}
                </button>
              ))}
              <hr className="my-2 border-slate-100" />
              <Link href="/login"    onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-teal-600">Sign In</Link>
              <Link href="/register" onClick={() => setMenuOpen(false)} className="rounded-lg bg-teal-500 px-3 py-2 text-center text-sm font-medium text-white hover:bg-teal-600">Get Started</Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Panel container ───────────────────────────────────── */}
      <main id="panel" className="flex-1 overflow-hidden">

        {/* ════ HOME ════════════════════════════════════════════ */}
        {active === "home" && (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-6 text-center">
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-teal-500/10 blur-3xl" />
              <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-teal-600/10 blur-3xl" />
            </div>

            <div className="relative mx-auto max-w-4xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-1.5 text-sm text-teal-300">
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                Healthcare Workforce Management
              </div>

              <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-white md:text-6xl">
                Optimize Your Health
                <br />
                <span className="bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
                  Workforce Smarter
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
                Reduce burnout, balance workloads, and improve patient outcomes with
                smart scheduling, real-time analytics, and predictive staffing
                — built for modern healthcare teams.
              </p>

              <div className="mt-10 flex flex-wrap justify-center gap-4">
                <Link
                  href="/register"
                  className="flex items-center gap-2 rounded-xl bg-teal-500 px-8 py-3.5 font-semibold text-white shadow-lg shadow-teal-500/30 transition-all hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  Start for Free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/login"
                  className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800/60 px-8 py-3.5 font-semibold text-slate-200 transition-all hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  Sign In <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <button
                  onClick={() => navigate("features")}
                  className="flex items-center gap-2 rounded-xl border border-teal-500/40 px-8 py-3.5 font-semibold text-teal-300 transition-all hover:bg-teal-500/10 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  Explore Features <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <p className="mt-8 text-sm text-slate-400">
                No credit card required &nbsp;·&nbsp; Free trial &nbsp;·&nbsp; HIPAA-friendly design
              </p>
            </div>
          </div>
        )}

        {/* ════ FEATURES ════════════════════════════════════════ */}
        {active === "features" && (
          <div className="flex h-full flex-col overflow-y-auto bg-white px-6 py-10">
            <div className="mx-auto w-full max-w-6xl">
              {/* Section header */}
              <div className="mb-8 text-center">
                <span className="text-sm font-semibold uppercase tracking-widest text-teal-600">Features</span>
                <h2 className="mt-1 text-3xl font-bold text-slate-800">Everything your team needs</h2>
                <p className="mx-auto mt-2 max-w-xl text-slate-600">
                  One platform to manage your entire healthcare workforce.
                </p>
              </div>

              {/* Stats bar */}
              <div className="mb-8 grid grid-cols-2 gap-6 rounded-2xl bg-slate-900 px-8 py-6 md:grid-cols-4">
                {[
                  { value: stat40,  suffix: "%", label: "Reduction in overtime"      },
                  { value: stat95,  suffix: "%", label: "Schedule accuracy"          },
                  { value: stat30,  suffix: "%", label: "Less admin time"            },
                  { value: stat500, suffix: "+", label: "Healthcare professionals"   },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col items-center gap-1">
                    <span className="text-3xl font-extrabold text-teal-400">{s.value}{s.suffix}</span>
                    <span className="text-xs text-slate-400">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Feature cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <FeatureCard icon={BarChart3}  title="Smart Scheduling"    color="bg-teal-50 text-teal-600"
                  description="Generate optimal shift schedules based on staff skills, availability, and patient load." />
                <FeatureCard icon={TrendingUp} title="Workload Analytics"  color="bg-blue-50 text-blue-600"
                  description="Visualise real-time workload distribution. Spot overloaded staff before burnout happens." />
                <FeatureCard icon={Heart}      title="Wellness Monitoring" color="bg-rose-50 text-rose-600"
                  description="Track staff wellness scores, fatigue indicators, and overtime trends proactively." />
                <FeatureCard icon={Calendar}   title="Leave Management"    color="bg-amber-50 text-amber-600"
                  description="Manage leave with conflict detection — always maintain minimum safe staffing levels." />
                <FeatureCard icon={Bell}       title="Real-Time Alerts"    color="bg-orange-50 text-orange-600"
                  description="Push notifications for urgent shift changes, on-call activations, and reminders." />
                <FeatureCard icon={Users}      title="Staff Management"    color="bg-green-50 text-green-600"
                  description="Centralise profiles, roles, skills, and certifications across all departments." />
                <FeatureCard icon={Activity}   title="Demand Forecasting"  color="bg-cyan-50 text-cyan-600"
                  description="Forecast future staffing needs from historical workload data — plan weeks ahead." />
                <FeatureCard icon={Clock}      title="On-Call Scheduling"  color="bg-indigo-50 text-indigo-600"
                  description="Manage on-call rosters with automatic conflict checks and mobile notifications." />
              </div>
            </div>
          </div>
        )}

        {/* ════ HOW IT WORKS ════════════════════════════════════ */}
        {active === "how-it-works" && (
          <div className="flex h-full items-center justify-center bg-slate-50 px-6 py-10">
            <div className="mx-auto w-full max-w-5xl">
              <div className="mb-10 text-center">
                <span className="text-sm font-semibold uppercase tracking-widest text-teal-600">How it works</span>
                <h2 className="mt-1 text-3xl font-bold text-slate-800">Up and running in minutes</h2>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                {/* Steps */}
                <ol className="flex flex-col gap-8" aria-label="Setup steps">
                  {[
                    { n: "01", title: "Import your staff data",
                      desc: "Upload a CSV or enter staff manually. Profiles, departments, and roles are set up automatically." },
                    { n: "02", title: "Set scheduling rules",
                      desc: "Define shift patterns, skill requirements, and minimum staffing levels per department." },
                    { n: "03", title: "Generate schedules",
                      desc: "The system optimises rosters — balancing fairness, compliance, and patient demand." },
                    { n: "04", title: "Monitor and adapt",
                      desc: "Real-time dashboards surface anomalies instantly. Adjust on the fly." },
                  ].map((s) => (
                    <li key={s.n} className="flex gap-5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-500 text-sm font-bold text-white" aria-hidden="true">
                        {s.n}
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-800">{s.title}</h4>
                        <p className="mt-1 text-sm text-slate-600">{s.desc}</p>
                      </div>
                    </li>
                  ))}
                </ol>

                {/* Mock dashboard */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" role="img" aria-label="Dashboard preview">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500">
                      <BarChart3 className="h-5 w-5 text-white" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">Dashboard Overview</p>
                      <p className="text-xs text-slate-500">Live workforce metrics</p>
                    </div>
                  </div>
                  {[
                    { label: "ICU",        value: 78, color: "bg-teal-500" },
                    { label: "Emergency",  value: 92, color: "bg-rose-400" },
                    { label: "Pediatrics", value: 61, color: "bg-blue-400" },
                    { label: "Oncology",   value: 55, color: "bg-amber-400" },
                  ].map((d) => (
                    <div key={d.label} className="mb-3">
                      <div className="mb-1 flex justify-between text-xs text-slate-600">
                        <span>{d.label}</span><span>{d.value}% capacity</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className={`h-2 rounded-full ${d.color}`} style={{ width: `${d.value}%` }} role="presentation" />
                      </div>
                    </div>
                  ))}
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    {[
                      { label: "On shift", value: "124", icon: Users },
                      { label: "On call",  value: "18",  icon: Clock },
                      { label: "Alerts",   value: "3",   icon: Bell  },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="rounded-xl bg-slate-50 p-3 text-center">
                        <Icon className="mx-auto mb-1 h-4 w-4 text-teal-500" aria-hidden="true" />
                        <p className="text-lg font-bold text-slate-800">{value}</p>
                        <p className="text-xs text-slate-600">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════ BENEFITS ════════════════════════════════════════ */}
        {active === "benefits" && (
          <div className="flex h-full items-center justify-center bg-white px-6 py-10">
            <div className="mx-auto w-full max-w-5xl">
              <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 p-10 text-white shadow-xl shadow-teal-600/20 md:p-14">
                <div className="grid gap-10 md:grid-cols-2">
                  <div>
                    <span className="text-sm font-semibold uppercase tracking-widest text-teal-200">Why HWO</span>
                    <h2 className="mt-3 text-3xl font-bold leading-snug">
                      Built for the realities of healthcare
                    </h2>
                    <p className="mt-4 text-teal-100">
                      Healthcare staffing is uniquely complex — changing patient acuity,
                      mandatory rest rules, skill mix requirements. HWO was designed from
                      the ground up for these constraints.
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                      <Link
                        href="/register"
                        className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-teal-700 transition-colors hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-teal-600"
                      >
                        Try it free <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                      <Link
                        href="/dashboard"
                        className="inline-flex items-center gap-2 rounded-xl border border-teal-400/50 px-6 py-3 font-semibold text-white transition-colors hover:bg-teal-500/30 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-teal-600"
                      >
                        View Dashboard
                      </Link>
                    </div>
                  </div>

                  <ul className="flex flex-col gap-3" aria-label="Key capabilities">
                    {[
                      "Adapts to your organisation's unique scheduling patterns",
                      "Full audit trail for regulatory compliance",
                      "Mobile app for staff — iOS & Android",
                      "Role-based access control for managers & admins",
                      "Import existing rosters via CSV",
                      "On-call schedule management built in",
                      "Wellness trends tracked automatically",
                      "Anomaly detection on workload spikes",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-200" aria-hidden="true" />
                        <span className="text-teal-50">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer
        aria-label="Site footer"
        className="shrink-0 border-t border-slate-200 bg-white px-6 py-3"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-xs text-slate-400 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-500">
              <BarChart3 className="h-3 w-3 text-white" aria-hidden="true" />
            </div>
            <span className="font-semibold text-slate-600">Health Workforce Optimizer</span>
          </div>
          <p>© {new Date().getFullYear()} HWO — Health Workforce Optimization System</p>
          <nav aria-label="Footer navigation">
            <div className="flex gap-5">
              <Link href="/login"     className="transition-colors hover:text-slate-600 focus:outline-none focus:text-slate-600">Sign In</Link>
              <Link href="/register"  className="transition-colors hover:text-slate-600 focus:outline-none focus:text-slate-600">Register</Link>
              <Link href="/dashboard" className="transition-colors hover:text-slate-600 focus:outline-none focus:text-slate-600">Dashboard</Link>
            </div>
          </nav>
        </div>
      </footer>
    </div>
  );
}
