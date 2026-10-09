import { useEffect, useState, type FormEvent } from "react";
import { Ticket, Lock, LogOut, Users, Database, Radio } from "lucide-react";

interface AdminStats {
  users: number;
  activeSessions: number;
  saves: number;
  activeAdminSessions: number;
  supabaseConfigured: boolean;
  nodeEnv: string;
}

interface AdminUser {
  id: string;
  email: string;
  createdAt: number;
  saveCount: number;
}

type View = "checking" | "redeem" | "panel";

export function AdminScreen() {
  const [view, setView] = useState<View>("checking");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState<string | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);

  async function checkSession() {
    try {
      const res = await fetch("/api/admin/me");
      setView(res.ok ? "panel" : "redeem");
    } catch {
      setView("redeem");
    }
  }

  async function loadPanel() {
    try {
      const [s, u] = await Promise.all([
        fetch("/api/admin/stats").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/users").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (s) setStats(s as AdminStats);
      if (u) setUsers((u as { users: AdminUser[] }).users ?? []);
    } catch {
      // keep whatever we have
    }
  }

  useEffect(() => {
    void checkSession();
  }, []);

  useEffect(() => {
    if (view === "panel") void loadPanel();
  }, [view]);

  async function handleRedeem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error === "invalid code" ? "Código inválido" : "Error al canjear");
        return;
      }
      setView("panel");
    } catch {
      setError("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBroadcast(e: FormEvent) {
    e.preventDefault();
    setBroadcastMsg(null);
    setBroadcasting(true);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: broadcastTitle.trim(), body: broadcastBody.trim() || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setBroadcastMsg(data.error === "supabase not configured" ? "Supabase no configurado" : "Error al enviar");
        return;
      }
      setBroadcastMsg("Broadcast enviado al mundo compartido ✓");
      setBroadcastTitle("");
      setBroadcastBody("");
    } catch {
      setBroadcastMsg("Error de conexión");
    } finally {
      setBroadcasting(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      setView("redeem");
      setStats(null);
      setUsers([]);
      setCode("");
    }
  }

  if (view === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <span className="animate-pulse uppercase tracking-widest text-xs">Verificando…</span>
      </div>
    );
  }

  // ── Redeem gate (canjeos) ────────────────────────────────────────────────
  if (view === "redeem") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="card-arcade rounded-2xl border-glow p-8 w-full max-w-sm flex flex-col gap-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/30">
              <Ticket className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-black font-display uppercase tracking-wide">
              NERV4 <span className="text-primary">Admin</span>
            </h1>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Canjea tu código de acceso
            </p>
          </div>

          <form onSubmit={handleRedeem} className="flex flex-col gap-4">
            <div className="card-arcade rounded-xl p-1.5">
              <div className="relative flex items-center">
                <Lock className="absolute left-4 w-5 h-5 text-muted-foreground pointer-events-none" />
                <input
                  type="password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Código de canjeo"
                  autoFocus
                  className="w-full bg-transparent border-0 pl-12 pr-4 py-3 text-base font-mono text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-center text-destructive uppercase tracking-wider font-semibold">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !code.trim()}
              className="flex items-center justify-center gap-3 w-full py-3.5 px-6 bg-primary text-primary-foreground rounded-xl font-bold text-base uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] glow-primary border-0 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              {submitting ? "Validando…" : "Canjear y entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Admin panel ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-black font-display uppercase tracking-wider">
            NERV4 <span className="text-primary">Admin</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors bg-transparent border-0 cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard icon={<Users className="w-5 h-5 text-primary" />} label="Usuarios" value={stats?.users ?? "—"} />
          <StatCard icon={<Database className="w-5 h-5 text-accent" />} label="Saves" value={stats?.saves ?? "—"} />
          <StatCard
            icon={<span className={`inline-block w-3 h-3 rounded-full ${stats?.supabaseConfigured ? "bg-primary" : "bg-muted-foreground/40"}`} />}
            label="Supabase"
            value={stats ? (stats.supabaseConfigured ? "Conectado" : "Sin config") : "—"}
          />
          <StatCard icon={<Lock className="w-5 h-5 text-chart-4" />} label="Sesiones" value={stats?.activeSessions ?? "—"} />
        </section>

        {/* Broadcast to shared world */}
        <section className="card-arcade rounded-2xl border-glow p-6">
          <h2 className="flex items-center gap-2 font-black font-display uppercase tracking-wider mb-4">
            <Radio className="w-5 h-5 text-primary" /> Broadcast al mundo
          </h2>
          <form onSubmit={handleBroadcast} className="flex flex-col gap-3">
            <input
              value={broadcastTitle}
              onChange={(e) => setBroadcastTitle(e.target.value)}
              placeholder="Título del anuncio"
              className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
            />
            <textarea
              value={broadcastBody}
              onChange={(e) => setBroadcastBody(e.target.value)}
              placeholder="Mensaje (opcional)"
              rows={3}
              className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 resize-y"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={broadcasting || !broadcastTitle.trim()}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-bold text-sm uppercase tracking-wider glow-primary border-0 cursor-pointer disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {broadcasting ? "Enviando…" : "Enviar"}
              </button>
              {broadcastMsg && <span className="text-xs text-muted-foreground">{broadcastMsg}</span>}
            </div>
          </form>
        </section>

        {/* Users */}
        <section className="card-arcade rounded-2xl border-glow p-6">
          <h2 className="flex items-center gap-2 font-black font-display uppercase tracking-wider mb-4">
            <Users className="w-5 h-5 text-accent" /> Usuarios ({users.length})
          </h2>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin usuarios registrados todavía.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border/50">
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Saves</th>
                    <th className="py-2 pr-4">Registrado</th>
                    <th className="py-2">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border/20">
                      <td className="py-2 pr-4 font-medium">{u.email}</td>
                      <td className="py-2 pr-4">{u.saveCount}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 font-mono text-[10px] text-muted-foreground">{u.id.slice(0, 8)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="card-arcade rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon} {label}
      </div>
      <span className="text-2xl font-black font-display text-foreground">{value}</span>
    </div>
  );
}

