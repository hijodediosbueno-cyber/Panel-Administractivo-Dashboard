"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

// Configuración de Supabase
const supabaseUrl = "https://rqbexzndnzzfbonafzop.supabase.co";
const supabaseServiceKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxYmV4em5kbnp6ZmJvbmFmem9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTQ5MzMyNiwiZXhwIjoyMDc3MDY5MzI2fQ.wf7FOv5vV_PW8ejcPpDxok3mU2z331us23G34iMs2pQ";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Helper: obtener el día siguiente en formato YYYY-MM-DD
const getNextDay = (dateStr: string): string => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
};

// Funciones administrativas
const adminFunctions = {
  async getStats(dateStr: string) {
    const nextDayStr = getNextDay(dateStr);

    const [
      users,
      deposits,
      totalBalance,
      approvedDeposits,
      completedWithdrawals,
    ] = await Promise.all([
      supabaseAdmin.from("users").select("id", { count: "exact" }),
      supabaseAdmin
        .from("pending_deposits")
        .select("id", { count: "exact" })
        .eq("status", "pending"),
      // Balance del sistema: SIEMPRE en tiempo real (sin filtro de fecha)
      supabaseAdmin.from("wallets").select("balance"),
      // Depósitos aprobados EN el día seleccionado (por updated_at = cuando se aprobó)
      supabaseAdmin
        .from("pending_deposits")
        .select("amount")
        .eq("status", "approved")
        .gte("updated_at", dateStr)
        .lt("updated_at", nextDayStr),
      // Retiros completados EN el día seleccionado
      supabaseAdmin
        .from("withdrawals")
        .select("amount")
        .in("status", ["completed", "approved"])
        .gte("updated_at", dateStr)
        .lt("updated_at", nextDayStr),
    ]);

    const totalUsers = users.count || 0;
    const pendingDeposits = deposits.count || 0;
    const systemBalance =
      totalBalance.data?.reduce(
        (sum: number, w: any) => sum + (w.balance || 0),
        0,
      ) || 0;
    const totalDeposited =
      approvedDeposits.data?.reduce(
        (sum: number, d: any) => sum + (d.amount || 0),
        0,
      ) || 0;
    const totalWithdrawn =
      completedWithdrawals.data?.reduce(
        (sum: number, w: any) => sum + (w.amount || 0),
        0,
      ) || 0;
    const depositadoReal = totalDeposited - totalWithdrawn;
    const totalLost = Math.max(0, depositadoReal - systemBalance);

    return {
      totalUsers,
      pendingDeposits,
      systemBalance,
      totalDeposited,
      totalWithdrawn,
      totalLost,
    };
  },
};

interface DashboardStats {
  totalUsers: number;
  pendingDeposits: number;
  systemBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalLost: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );

  useEffect(() => {
    loadStats();
  }, [selectedDate]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await adminFunctions.getStats(selectedDate);
      setStats(data);
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Cargando estadísticas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 rounded-2xl p-8 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">
              Dashboard Administrativo
            </h1>
            <p className="text-blue-200 text-sm">
              Gestiona usuarios y transacciones de IGF Football en tiempo real
            </p>
            <p className="mt-3 text-xs text-blue-300">
              Última actualización: {new Date().toLocaleString("es-ES")}
            </p>
          </div>
          {/* Selector de fecha */}
          <div className="flex flex-col items-start sm:items-end gap-1">
            <label className="text-blue-200 text-xs font-medium">
              📅 Filtrar por día
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/10 border border-white/30 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/50"
            />
            {selectedDate !== new Date().toISOString().split("T")[0] && (
              <button
                onClick={() =>
                  setSelectedDate(new Date().toISOString().split("T")[0])
                }
                className="text-xs text-blue-300 hover:text-white underline"
              >
                Volver a hoy
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Resumen General - Fila 1: Usuarios y operaciones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/users" className="group block">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 cursor-pointer transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Total Usuarios
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {stats?.totalUsers || 0}
                </p>
                <p className="text-xs text-blue-500 mt-1 group-hover:underline">Ver usuarios →</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl group-hover:bg-blue-500 transition-colors">
                <svg
                  className="w-8 h-8 text-blue-500 group-hover:text-white transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </Link>

        <Link href="/transactions" className="group block">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-orange-200 cursor-pointer transition-all duration-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Depósitos Pendientes
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {stats?.pendingDeposits || 0}
                </p>
                <p className="text-xs text-orange-500 mt-1 group-hover:underline">
                  Ver transacciones →
                </p>
              </div>
              <div className="p-3 bg-orange-50 rounded-xl group-hover:bg-orange-500 transition-colors">
                <svg
                  className="w-8 h-8 text-orange-500 group-hover:text-white transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {/* Resumen Financiero - Fila 2 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">
            Resumen Financiero
          </h2>
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            📅{" "}
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("es-DO", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/transactions" className="group block">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-green-500 hover:shadow-md hover:border-green-300 cursor-pointer transition-all duration-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Total Depositado
              </p>
              <p className="text-2xl font-bold text-green-600 mt-2">
                RD$
                {(stats?.totalDeposited || 0).toLocaleString("es-DO", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-gray-400 mt-1 group-hover:text-green-500 group-hover:underline">Ver transacciones →</p>
            </div>
          </Link>

          <Link href="/wallets" className="group block">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-orange-500 hover:shadow-md hover:border-orange-300 cursor-pointer transition-all duration-200">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Total Retirado
              </p>
              <p className="text-2xl font-bold text-orange-600 mt-2">
                RD$
                {(stats?.totalWithdrawn || 0).toLocaleString("es-DO", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-gray-400 mt-1 group-hover:text-orange-500 group-hover:underline">Ver billeteras →</p>
            </div>
          </Link>

          <Link href="/wallets" className="group block">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-5 rounded-xl shadow-sm border border-blue-200 border-l-4 border-l-blue-500 hover:shadow-md cursor-pointer transition-all duration-200">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">
                Balance del Sistema
              </p>
              <p className="text-2xl font-bold text-blue-600 mt-2">
                RD$
                {(stats?.systemBalance || 0).toLocaleString("es-DO", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-blue-400 mt-1 group-hover:underline">
                ⚡ Ver billeteras →
              </p>
            </div>
          </Link>

          <Link href="/wallets" className="group block">
            <div className="bg-gradient-to-br from-red-50 to-red-100 p-5 rounded-xl shadow-sm border border-red-200 border-l-4 border-l-red-500 hover:shadow-md cursor-pointer transition-all duration-200">
              <p className="text-xs font-medium text-red-500 uppercase tracking-wide">
                Total Perdido
              </p>
              <p className="text-2xl font-bold text-red-600 mt-2">
                RD$
                {(stats?.totalLost || 0).toLocaleString("es-DO", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-red-400 mt-1 group-hover:underline">Ver billeteras →</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Accesos Rápidos */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          Accesos Rápidos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/users" className="group block">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-200 h-full">
              <div className="p-3 bg-blue-50 rounded-xl w-fit group-hover:bg-blue-500 transition-colors">
                <svg
                  className="w-6 h-6 text-blue-500 group-hover:text-white transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mt-3 group-hover:text-blue-600 transition-colors">
                Gestión de Usuarios
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Ver, editar y administrar usuarios
              </p>
            </div>
          </Link>

          <Link href="/transactions" className="group block">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-green-200 transition-all duration-200 h-full">
              <div className="p-3 bg-green-50 rounded-xl w-fit group-hover:bg-green-500 transition-colors">
                <svg
                  className="w-6 h-6 text-green-500 group-hover:text-white transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mt-3 group-hover:text-green-600 transition-colors">
                Aprobación de Depósitos
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Revisar y aprobar depósitos pendientes
              </p>
            </div>
          </Link>

          <Link href="/apuestas" className="group block">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-purple-200 transition-all duration-200 h-full">
              <div className="p-3 bg-purple-50 rounded-xl w-fit group-hover:bg-purple-500 transition-colors">
                <svg
                  className="w-6 h-6 text-purple-500 group-hover:text-white transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mt-3 group-hover:text-purple-600 transition-colors">
                Gestión de Apuestas
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Crear eventos y definir ganadores
              </p>
            </div>
          </Link>

          <Link href="/wallets" className="group block">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-orange-200 transition-all duration-200 h-full">
              <div className="p-3 bg-orange-50 rounded-xl w-fit group-hover:bg-orange-500 transition-colors">
                <svg
                  className="w-6 h-6 text-orange-500 group-hover:text-white transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a1 1 0 11-2 0 1 1 0 012 0z"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mt-3 group-hover:text-orange-600 transition-colors">
                Gestión de Retiros
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Aprobar o rechazar solicitudes de retiro
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
