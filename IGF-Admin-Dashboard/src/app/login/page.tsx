"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const success = login(username.trim(), password);
    if (success) {
      router.push("/");
    } else {
      setError("Usuario o contraseña incorrectos.");
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse at center, rgba(0,40,0,0.55) 0%, rgba(0,0,0,0.85) 100%),
          repeating-linear-gradient(
            0deg,
            transparent,
            transparent 60px,
            rgba(255,255,255,0.04) 60px,
            rgba(255,255,255,0.04) 62px
          ),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 80px,
            rgba(255,255,255,0.03) 80px,
            rgba(255,255,255,0.03) 82px
          ),
          linear-gradient(160deg, #0a3d0a 0%, #0d5c1a 30%, #0a3d0a 60%, #062b06 100%)
        `,
      }}
    >
      {/* Field markings */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Center circle */}
        <div
          className="absolute"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 340,
            height: 340,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.12)",
          }}
        />
        {/* Center dot */}
        <div
          className="absolute rounded-full"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 10,
            height: 10,
            background: "rgba(255,255,255,0.2)",
          }}
        />
        {/* Center line */}
        <div
          className="absolute"
          style={{
            top: 0,
            bottom: 0,
            left: "50%",
            width: 2,
            background: "rgba(255,255,255,0.07)",
          }}
        />
        {/* Penalty box left */}
        <div
          className="absolute"
          style={{
            top: "50%",
            left: 0,
            transform: "translateY(-50%)",
            width: 160,
            height: 260,
            border: "2px solid rgba(255,255,255,0.1)",
            borderLeft: "none",
          }}
        />
        {/* Penalty box right */}
        <div
          className="absolute"
          style={{
            top: "50%",
            right: 0,
            transform: "translateY(-50%)",
            width: 160,
            height: 260,
            border: "2px solid rgba(255,255,255,0.1)",
            borderRight: "none",
          }}
        />
      </div>

      {/* Card */}
      <div className="w-full max-w-md relative z-10">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 shadow-2xl"
            style={{
              background: "linear-gradient(135deg, #1a6e2e 0%, #0d4a1a 100%)",
              border: "3px solid rgba(255,255,255,0.25)",
              boxShadow: "0 0 40px rgba(0,200,0,0.3), 0 8px 32px rgba(0,0,0,0.5)",
            }}
          >
            <span className="text-4xl">⚽</span>
          </div>
          <h1
            className="text-3xl font-extrabold tracking-tight mb-1"
            style={{ color: "#fff", textShadow: "0 2px 16px rgba(0,0,0,0.7)" }}
          >
            IGF Football
          </h1>
          <p className="text-sm font-medium" style={{ color: "rgba(180,255,180,0.7)" }}>
            Panel Administrativo
          </p>
        </div>

        {/* Login card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
          }}
        >
          <h2 className="text-lg font-bold text-white mb-6">Iniciar Sesión</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "rgba(200,255,200,0.85)" }}>
                Correo
              </label>
              <input
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="email"
                placeholder="correo@ejemplo.com"
                className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 transition"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "rgba(200,255,200,0.85)" }}>
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400 transition"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.18)",
                }}
              />
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-500/50 text-red-300 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full font-bold rounded-lg py-3 text-sm transition-all disabled:opacity-60"
              style={{
                background: loading
                  ? "rgba(22,101,52,0.7)"
                  : "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
                color: "#fff",
                boxShadow: loading ? "none" : "0 4px 20px rgba(22,163,74,0.4)",
                letterSpacing: "0.03em",
              }}
            >
              {loading ? "Verificando..." : "Entrar al Panel"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
