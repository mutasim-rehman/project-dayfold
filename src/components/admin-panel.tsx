"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, ArrowLeft, ArrowUpRight, BarChart3, BookOpen, Download, Eye, LockKeyhole, LogOut, MessageCircle, RefreshCw, ShieldCheck, Sparkles, Users } from "lucide-react";

type Overview = { registered_readers: number; activated_readers: number; active_readers_30d: number; published_editions_30d: number; failed_jobs_30d: number };
type FunnelStep = { key: string; label: string; users: number };
type Feature = { key: string; label: string; events: number; users: number; repeat_users: number; repeat_rate: number; active_reader_reach: number };
type DayActivity = { day: string; events: number; users: number };
type ModelUsage = { task: string; model: string; calls: number; tokens: number };
type Analytics = { generated_at: string; overview: Overview; funnel_30d: FunnelStep[]; features: Feature[]; daily_activity: DayActivity[]; model_usage_30d: ModelUsage[] };

const icons: Record<string, typeof BookOpen> = { paper: BookOpen, ask: MessageCircle, pdf: Download, source: ArrowUpRight, feedback: Sparkles, changes: Activity, onboarding: Users };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "The request could not be completed."), { status: response.status });
  return data as T;
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: number | string; detail: string }) {
  return <article className="admin-metric"><span className="admin-metric-icon"><Icon size={17}/></span><span className="admin-metric-label">{label}</span><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong><small>{detail}</small></article>;
}

function ActivityChart({ days }: { days: DayActivity[] }) {
  const points = useMemo(() => {
    const values = days.map(day => day.events);
    const max = Math.max(...values, 1);
    return values.map((value, index) => `${values.length < 2 ? 50 : 8 + index * 84 / (values.length - 1)},${88 - value * 72 / max}`).join(" ");
  }, [days]);
  if (!days.length) return <p className="admin-empty">No activity has been recorded yet.</p>;
  return <div className="admin-chart-wrap"><svg className="admin-chart" viewBox="0 0 100 100" role="img" aria-label="Daily product events over the last 14 days"><line x1="5" x2="95" y1="88" y2="88"/><polyline points={points}/>{days.map((day, index) => <circle key={day.day} cx={days.length < 2 ? 50 : 8 + index * 84 / (days.length - 1)} cy={88 - day.events * 72 / Math.max(...days.map(item => item.events), 1)} r="1.6"><title>{day.day}: {day.events} events</title></circle>)}</svg><div className="admin-chart-labels"><span>{days[0].day}</span><span>{days[Math.floor((days.length - 1) / 2)].day}</span><span>{days.at(-1)?.day}</span></div></div>;
}

export default function AdminPanel() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [view, setView] = useState<"checking" | "login" | "dashboard">("checking");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { const data = await request<Analytics>("/api/admin/analytics"); setAnalytics(data); setView("dashboard"); }
    catch (reason) { const err = reason as Error & { status?: number }; if (err.status === 401) setView("login"); else { setView("dashboard"); setError(err.message); } }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await request("/api/admin/login", { method: "POST", body: JSON.stringify({ name, password }) }); setPassword(""); await load(); }
    catch (reason) { setError((reason as Error).message); setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    try { await request("/api/admin/logout", { method: "POST", body: "{}" }); } finally { setAnalytics(null); setView("login"); setBusy(false); }
  }

  if (view === "checking") return <main className="admin-shell"><div className="admin-check"><RefreshCw className="admin-spin" size={18}/> Checking the admin session…</div></main>;
  if (view === "login") return <main className="admin-shell"><header className="admin-topbar"><a className="admin-wordmark" href="/">dayfold<span>.</span></a><a className="admin-home" href="/"><ArrowLeft size={15}/> Back to Dayfold</a></header><section className="admin-login"><div className="admin-lock"><LockKeyhole size={22}/></div><p className="admin-kicker">PRIVATE WORKSPACE · PRODUCT INTELLIGENCE</p><h1>Make better product bets.</h1><p className="admin-login-copy">Review how readers use Dayfold, where they return, and which experiences are ready for a closer look.</p><form onSubmit={signIn}><label htmlFor="admin-name">Admin name</label><input id="admin-name" autoComplete="username" required value={name} onChange={event => setName(event.target.value)} placeholder="Your admin name"/><label htmlFor="admin-password">Password</label><input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)}/>{error&&<p className="admin-error" role="alert">{error}</p>}<button className="admin-primary" disabled={busy}>{busy?<RefreshCw className="admin-spin" size={15}/>:<LockKeyhole size={15}/>} Sign in securely</button></form><p className="admin-login-foot"><ShieldCheck size={14}/> Aggregate product data only. No reader names, emails, or private conversations.</p></section></main>;

  const overview = analytics?.overview ?? { registered_readers: 0, activated_readers: 0, active_readers_30d: 0, published_editions_30d: 0, failed_jobs_30d: 0 };
  const topFeature = analytics?.features.find(feature => feature.events > 0);
  const maxEvents = Math.max(...(analytics?.features.map(feature => feature.events) || [0]), 1);
  const maxFunnel = Math.max(...(analytics?.funnel_30d.map(step => step.users) || [0]), 1);
  const lastUpdated = analytics ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(analytics.generated_at)) : "";

  return <main className="admin-shell"><header className="admin-topbar"><a className="admin-wordmark" href="/">dayfold<span>.</span><small>ADMIN</small></a><div className="admin-top-actions"><span className="admin-secure"><span/>Private analytics</span><button className="admin-quiet" onClick={() => void load()} disabled={busy}><RefreshCw className={busy?"admin-spin":""} size={15}/> Refresh</button><button className="admin-quiet" onClick={() => void signOut()} disabled={busy}><LogOut size={15}/> Sign out</button></div></header>
    <section className="admin-content"><div className="admin-heading"><div><p className="admin-kicker">DAYFOLD · INTERNAL</p><h1>Product pulse</h1><p>Understand adoption, repeat use, and where the product earns more investment.</p></div><div className="admin-period"><span className="admin-period-dot"/> Last 30 days <small>Updated {lastUpdated}</small></div></div>
      {error&&<div className="admin-banner" role="alert"><AlertTriangle size={17}/><span>{error}</span><button onClick={() => void load()}>Retry</button></div>}
      {!analytics?<div className="admin-empty-panel"><BarChart3 size={27}/><h2>Analytics are unavailable</h2><p>Refresh after checking the admin analytics database setup.</p></div>:<>
        <div className="admin-metrics"><Metric icon={Users} label="Registered readers" value={overview.registered_readers} detail={`${overview.activated_readers.toLocaleString()} completed setup`}/><Metric icon={Activity} label="Active readers" value={overview.active_readers_30d} detail="Seen in the last 30 days"/><Metric icon={BookOpen} label="Papers published" value={overview.published_editions_30d} detail="Last 30 days"/><Metric icon={topFeature?icons[topFeature.key]||Sparkles:Sparkles} label="Most used feature" value={topFeature?.label||"Not yet measured"} detail={topFeature?`${topFeature.events.toLocaleString()} events · ${topFeature.users} readers`:"Usage signals will appear here"}/></div>
        <div className="admin-grid"><section className="admin-panel admin-activity"><div className="admin-panel-heading"><div><p className="admin-kicker">ENGAGEMENT · 14 DAYS</p><h2>Are readers coming back?</h2></div><span className="admin-panel-badge"><Activity size={14}/> Daily activity</span></div><ActivityChart days={analytics.daily_activity}/></section>
          <section className="admin-panel admin-funnel"><div className="admin-panel-heading"><div><p className="admin-kicker">NEW READER JOURNEY</p><h2>From signup to habit</h2></div><span className="admin-panel-badge">30-day cohort</span></div><div className="admin-funnel-list">{analytics.funnel_30d.map((step,index)=><div className="admin-funnel-row" key={step.key}><div className="admin-funnel-label"><span>{String(index+1).padStart(2,"0")}</span>{step.label}<strong>{step.users}</strong></div><div className="admin-track"><span style={{width:`${Math.max(step.users/maxFunnel*100,step.users?3:0)}%`}}/></div></div>)}</div><p className="admin-footnote">This signup cohort shows how many new accounts reached each step during the same 30-day window.</p></section></div>
        <section className="admin-panel admin-features"><div className="admin-panel-heading"><div><p className="admin-kicker">FEATURE PERFORMANCE · 30 DAYS</p><h2>What readers use</h2></div><span className="admin-panel-badge">Events and distinct readers</span></div><div className="admin-feature-list">{analytics.features.map(feature=>{const Icon=icons[feature.key]||Eye;return <article className="admin-feature-row" key={feature.key}><div className="admin-feature-name"><span className="admin-feature-icon"><Icon size={16}/></span><div><strong>{feature.label}</strong><small>{feature.users.toLocaleString()} unique readers</small></div></div><div className="admin-feature-bar"><span style={{width:`${Math.max(feature.events/maxEvents*100,feature.events?2:0)}%`}}/></div><div className="admin-feature-stats"><strong>{feature.events.toLocaleString()}</strong><small>uses</small></div><div className="admin-feature-stats"><strong>{feature.repeat_rate}%</strong><small>repeat users</small></div><div className="admin-feature-stats"><strong>{feature.active_reader_reach}%</strong><small>active reach</small></div><span className={`admin-sample ${feature.users<5?"low":""}`}>{feature.users<5?"Early signal":"Measured"}</span></article>;})}</div><div className="admin-pricing-note"><div><Sparkles size={17}/><strong>Signals for product and pricing reviews</strong></div><p>High reach and repeat use can justify testing a paid tier. They do not prove willingness to pay; validate with reader interviews or a pricing experiment before gating a feature.</p></div></section>
        <div className="admin-grid admin-bottom-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">MODEL OPERATIONS</p><h2>Compute proxy · 30 days</h2></div></div>{analytics.model_usage_30d.length?<div className="admin-usage-list">{analytics.model_usage_30d.map(row=><div className="admin-usage-row" key={`${row.task}:${row.model}`}><span><strong>{row.task}</strong><small>{row.model}</small></span><span>{row.calls.toLocaleString()} calls</span><strong>{row.tokens.toLocaleString()} tokens</strong></div>)}</div>:<p className="admin-empty">No model usage recorded yet.</p>}<p className="admin-footnote">Tokens help compare workload, not provider charges. Add actual provider billing data before reporting financial ROI.</p></section><section className="admin-panel admin-readout"><p className="admin-kicker">PRODUCT HEALTH</p><h2>{overview.failed_jobs_30d?"Investigate reliability":"Build on the signal"}</h2><p>{overview.failed_jobs_30d?`${overview.failed_jobs_30d} background jobs failed in the last 30 days. Check reliability before expanding usage.`:"Compare feature reach and repeat use with feedback and interview notes before choosing what to improve or monetize."}</p><div className="admin-readout-foot"><ShieldCheck size={15}/> Privacy-first aggregate reporting <ArrowUpRight size={14}/></div></section></div>
        <footer className="admin-footer"><span>Dayfold product analytics</span><span>Aggregated from opted-in product activity · No conversation content stored in this dashboard</span></footer>
      </>}
    </section></main>;
}
