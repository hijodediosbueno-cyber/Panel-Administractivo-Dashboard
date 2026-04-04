"use client";

import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface User {
  id: string;
  full_name: string | null;
  phone: string | null;
  username: string | null;
}

interface Wallet {
  id: string;
  user_id: string;
  balance: number;
  users: User;
}

interface WalletEnriched extends Wallet {
  totalDeposited: number;
  totalWithdrawn: number;
  depositadoReal: number;
  montoPerdido: number;
}

interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  fee?: number;
  net_amount?: number;
  status: string;
  created_at: string;
  updated_at: string | null;
  user_notes?: string | null;
  admin_notes?: string | null;
  payment_method_id?: string | null;
  users: User;
}

interface Transaction {
  id: string;
  type:
    | "deposit"
    | "withdrawal"
    | "payment"
    | "bet_win"
    | "bet_refund"
    | "manual_adjustment";
  user_id: string;
  amount: number;
  status: string;
  created_at: string;
  updated_at: string | null;
  admin_notes: string | null;
  payment_method: string | null;
  description?: string | null;
  users: User;
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletEnriched[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<Withdrawal[]>(
    [],
  );
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalDeposited, setTotalDeposited] = useState(0);
  const [totalWithdrawn, setTotalWithdrawn] = useState(0);
  const [totalLost, setTotalLost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<"wallets" | "history">(
    "wallets",
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );

  const loadPendingWithdrawals = async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from("withdrawals")
        .select(
          `
          id,
          user_id,
          amount,
          fee,
          net_amount,
          status,
          created_at,
          updated_at,
          user_notes,
          admin_notes,
          payment_method_id,
          users (
            id,
            full_name,
            phone,
            username
          )
        `,
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading withdrawals:", error);
        setPendingWithdrawals([]);
        return;
      }

      const processedWithdrawals = (data || []).map((withdrawal) => {
        const user = Array.isArray(withdrawal.users)
          ? withdrawal.users[0]
          : withdrawal.users;
        return {
          ...withdrawal,
          users: {
            id: user?.id || "",
            full_name: user?.full_name || null,
            phone: user?.phone || null,
            username: user?.username || null,
          },
        };
      });

      setPendingWithdrawals(processedWithdrawals);
    } catch (error) {
      console.error("Error in loadPendingWithdrawals:", error);
      setPendingWithdrawals([]);
    }
  };

  const loadWallets = async () => {
    try {
      // 1. Cargar billeteras
      const { data, error } = await supabaseAdmin
        .from("wallets")
        .select(
          `
          *,
          users (
            id,
            full_name,
            phone,
            username
          )
        `,
        )
        .order("balance", { ascending: false });

      if (error) throw error;

      // 2. Cargar todos los depósitos aprobados
      const { data: approvedDeposits } = await supabaseAdmin
        .from("pending_deposits")
        .select("user_id, amount")
        .eq("status", "approved");

      // 3. Cargar todos los retiros completados
      const { data: completedWithdrawals } = await supabaseAdmin
        .from("withdrawals")
        .select("user_id, amount")
        .in("status", ["completed", "approved"]);

      // 4. Agrupar depósitos por usuario
      const depositsByUser: Record<string, number> = {};
      for (const dep of approvedDeposits || []) {
        depositsByUser[dep.user_id] =
          (depositsByUser[dep.user_id] || 0) + (dep.amount || 0);
      }

      // 5. Agrupar retiros por usuario
      const withdrawalsByUser: Record<string, number> = {};
      for (const w of completedWithdrawals || []) {
        withdrawalsByUser[w.user_id] =
          (withdrawalsByUser[w.user_id] || 0) + (w.amount || 0);
      }

      // 6. Enriquecer billeteras con datos calculados
      const enrichedWallets: WalletEnriched[] = (data || []).map((wallet) => {
        const totalDep = depositsByUser[wallet.user_id] || 0;
        const totalWith = withdrawalsByUser[wallet.user_id] || 0;
        const depositadoReal = totalDep - totalWith;
        const montoPerdido = depositadoReal - (wallet.balance || 0);
        return {
          ...wallet,
          totalDeposited: totalDep,
          totalWithdrawn: totalWith,
          depositadoReal,
          montoPerdido,
        };
      });

      // Ordenar por depositado real descendente
      enrichedWallets.sort((a, b) => b.depositadoReal - a.depositadoReal);

      setWallets(enrichedWallets);

      const total = enrichedWallets.reduce(
        (sum, w) => sum + (w.balance || 0),
        0,
      );
      const totalDep = enrichedWallets.reduce(
        (sum, w) => sum + w.totalDeposited,
        0,
      );
      const totalWith = enrichedWallets.reduce(
        (sum, w) => sum + w.totalWithdrawn,
        0,
      );
      const totalLostCalc = enrichedWallets.reduce(
        (sum, w) => sum + Math.max(0, w.montoPerdido),
        0,
      );

      setTotalBalance(total);
      setTotalDeposited(totalDep);
      setTotalWithdrawn(totalWith);
      setTotalLost(totalLostCalc);
    } catch (error) {
      console.error("Error loading wallets:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactionHistory = async (dateStr: string) => {
    const nextDay = new Date(dateStr + "T00:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];

    try {
      // 1. Cargar depósitos del día
      const { data: depositsData, error: depositsError } = await supabaseAdmin
        .from("pending_deposits")
        .select(
          `
          id,
          user_id,
          amount,
          status,
          created_at,
          updated_at,
          admin_notes,
          payment_method,
          users (
            id,
            full_name,
            phone,
            username
          )
        `,
        )
        .not("payment_method", "like", "RETIRO_%")
        .gte("created_at", dateStr)
        .lt("created_at", nextDayStr)
        .order("created_at", { ascending: false });

      if (depositsError) {
        console.error("Error loading deposits:", depositsError);
      }

      // 2. Cargar retiros del día desde la tabla withdrawals
      const { data: withdrawalsData, error: withdrawalsError } =
        await supabaseAdmin
          .from("withdrawals")
          .select(
            `
          id,
          user_id,
          amount,
          status,
          created_at,
          updated_at,
          admin_notes,
          user_notes,
          users (
            id,
            full_name,
            phone,
            username
          )
        `,
          )
          .gte("created_at", dateStr)
          .lt("created_at", nextDayStr)
          .order("created_at", { ascending: false });

      if (withdrawalsError) {
        console.error("Error loading withdrawals:", withdrawalsError);
      }

      // 3. Cargar otras transacciones del día (premios, reembolsos, etc)
      const { data: otherTransactionsData, error: otherTransactionsError } =
        await supabaseAdmin
          .from("transactions")
          .select(
            `
          id,
          user_id,
          amount,
          status,
          created_at,
          transaction_type,
          description,
          users (
            id,
            full_name,
            phone,
            username
          )
        `,
          )
          .gte("created_at", dateStr)
          .lt("created_at", nextDayStr)
          .order("created_at", { ascending: false });

      if (otherTransactionsError) {
        console.error(
          "Error loading other transactions:",
          otherTransactionsError,
        );
      }

      // Combinar transacciones
      const deposits = (depositsData || []).map((d) => {
        const user = Array.isArray(d.users) ? d.users[0] : d.users;
        return {
          ...d,
          type: "deposit" as const,
          payment_method: d.payment_method || "",
          users: {
            id: user?.id || "",
            full_name: user?.full_name || null,
            phone: user?.phone || null,
            username: user?.username || null,
          },
        };
      });

      const withdrawals = (withdrawalsData || []).map((w) => {
        const user = Array.isArray(w.users) ? w.users[0] : w.users;
        return {
          ...w,
          type: "withdrawal" as const,
          payment_method: "RETIRO_BANCARIO",
          users: {
            id: user?.id || "",
            full_name: user?.full_name || null,
            phone: user?.phone || null,
            username: user?.username || null,
          },
        };
      });

      const otherTransactions = (otherTransactionsData || []).map((t) => {
        const user = Array.isArray(t.users) ? t.users[0] : t.users;
        return {
          id: t.id,
          user_id: t.user_id,
          amount: t.amount,
          status: t.status,
          created_at: t.created_at,
          updated_at: t.created_at,
          admin_notes: t.description,
          type: (t.transaction_type || "payment") as any,
          payment_method: t.transaction_type,
          users: {
            id: user?.id || "",
            full_name: user?.full_name || null,
            phone: user?.phone || null,
            username: user?.username || null,
          },
        };
      });

      // Filtrar duplicados si es necesario (por si acaso withdrawals también se guardan en transactions)
      // Por ahora asumimos que no se duplican o que queremos ver todo

      const allTransactions = [
        ...deposits,
        ...withdrawals,
        ...otherTransactions,
      ].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      setTransactions(allTransactions);
    } catch (error) {
      console.error("Error in loadTransactionHistory:", error);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const processWithdrawal = async (
    withdrawalId: string,
    action: "approve" | "reject",
    notes?: string,
  ) => {
    try {
      // Obtener información del retiro
      const { data: withdrawal, error: withdrawalError } = await supabaseAdmin
        .from("withdrawals")
        .select(
          `
          *,
          users (
            id,
            full_name,
            phone
          )
        `,
        )
        .eq("id", withdrawalId)
        .single();

      if (withdrawalError) {
        console.error("Error obteniendo retiro:", withdrawalError);
        throw new Error(`Error al obtener retiro: ${withdrawalError.message}`);
      }

      if (action === "approve") {
        // 1. Obtener billetera solo para registrar el balance actual en el historial
        // NOTA: El balance YA FUE DESCONTADO al solicitar el retiro en la app móvil.
        const { data: currentWallet, error: walletGetError } =
          await supabaseAdmin
            .from("wallets")
            .select("balance")
            .eq("user_id", withdrawal.user_id)
            .single();

        if (walletGetError) {
          throw new Error(
            `Error al obtener billetera: ${walletGetError.message}`,
          );
        }

        const currentBalance = currentWallet.balance;
        // El balance "antes" de la transacción lógica sería el actual + el monto,
        // ya que el monto ya fue restado físicamente al solicitar.
        const logicalBalanceBefore = currentBalance + withdrawal.amount;

        // 2. Registrar transacción de retiro (para historial)
        // No actualizamos la tabla wallets porque ya se actualizó al solicitar
        await supabaseAdmin.from("transactions").insert([
          {
            user_id: withdrawal.user_id,
            transaction_type: "withdrawal",
            amount: -withdrawal.amount,
            balance_before: logicalBalanceBefore,
            balance_after: currentBalance,
            status: "completed",
            description: `Retiro aprobado - ${notes || "Procesado por administrador"}`,
            reference: `WITHDRAWAL_${withdrawalId.substring(0, 8).toUpperCase()}`,
          },
        ]);

        // 3. Actualizar estado del retiro a completado
        const { error: updateError } = await supabaseAdmin
          .from("withdrawals")
          .update({
            status: "completed",
            admin_notes: notes || "Retiro aprobado por administrador",
            updated_at: new Date().toISOString(),
          })
          .eq("id", withdrawalId);

        if (updateError) {
          console.error("Error actualizando retiro:", updateError);
          throw new Error(`Error al actualizar estado: ${updateError.message}`);
        }

        alert(
          `✅ Retiro aprobado exitosamente!\n\n👤 Usuario: ${withdrawal.users?.full_name}\n💰 Monto: RD$${withdrawal.amount.toLocaleString("es-DO")}\n💳 Balance actual: RD$${currentBalance.toLocaleString("es-DO")}\n\n(El monto ya había sido descontado al solicitar)`,
        );
      } else if (action === "reject") {
        // REEMBOLSAR AL USUARIO (ya que se descontó al solicitar)

        // 1. Obtener billetera actual
        const { data: currentWallet, error: walletGetError } =
          await supabaseAdmin
            .from("wallets")
            .select("balance")
            .eq("user_id", withdrawal.user_id)
            .single();

        if (walletGetError) {
          throw new Error(
            `Error al obtener billetera para reembolso: ${walletGetError.message}`,
          );
        }

        const newBalance = currentWallet.balance + withdrawal.amount;

        // 2. Devolver fondos a la billetera
        const { error: walletUpdateError } = await supabaseAdmin
          .from("wallets")
          .update({ balance: newBalance })
          .eq("user_id", withdrawal.user_id);

        if (walletUpdateError) {
          throw new Error(
            `Error al reembolsar billetera: ${walletUpdateError.message}`,
          );
        }

        // 3. Registrar transacción de reembolso
        await supabaseAdmin.from("transactions").insert([
          {
            user_id: withdrawal.user_id,
            transaction_type: "bet_refund", // O 'deposit' o un tipo específico 'withdrawal_refund'
            amount: withdrawal.amount,
            balance_before: currentWallet.balance,
            balance_after: newBalance,
            status: "completed",
            description: `Reembolso por retiro rechazado - ${notes || "Sin razón especificada"}`,
            reference: `REFUND_${withdrawalId.substring(0, 8).toUpperCase()}`,
          },
        ]);

        // 4. Actualizar estado del retiro a rechazado
        const { error: updateError } = await supabaseAdmin
          .from("withdrawals")
          .update({
            status: "rejected",
            admin_notes: notes || "Retiro rechazado por administrador",
            updated_at: new Date().toISOString(),
          })
          .eq("id", withdrawalId);

        if (updateError) {
          console.error("Error actualizando retiro:", updateError);
          throw new Error(`Error al actualizar estado: ${updateError.message}`);
        }

        alert(
          `❌ Retiro rechazado y REEMBOLSADO exitosamente.\n\n👤 Usuario: ${withdrawal.users?.full_name}\n💰 Monto Reembolsado: RD$${withdrawal.amount.toLocaleString("es-DO")}\n💳 Nuevo Balance: RD$${newBalance.toLocaleString("es-DO")}\n📝 Razón: ${notes}`,
        );
      }

      // Recargar datos
      loadWallets();
      loadPendingWithdrawals();
    } catch (error) {
      console.error("Error procesando retiro:", error);
      alert(
        `Error al procesar el retiro: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
    }
  };

  useEffect(() => {
    loadWallets();
    loadPendingWithdrawals();
  }, []);

  useEffect(() => {
    if (currentView === "history") {
      loadTransactionHistory(selectedDate);
    }
  }, [currentView, selectedDate]);

  const parseUserNotes = (
    notes: string | null | undefined,
  ): React.ReactNode => {
    if (!notes) return "Sin notas";
    try {
      const parsed = JSON.parse(notes);
      const methodLabels: Record<string, string> = {
        bank_transfer: "Transferencia Bancaria",
        cash: "Efectivo",
        card: "Tarjeta",
      };
      const method =
        methodLabels[parsed.method] || parsed.method || "Desconocido";
      const details = parsed.details || {};
      return (
        <div className="space-y-1">
          <p>
            <span className="font-medium">Método:</span> {method}
          </p>
          {details.bank_name && (
            <p>
              <span className="font-medium">Banco:</span> {details.bank_name}
            </p>
          )}
          {details.account_number && (
            <p>
              <span className="font-medium">No. Cuenta:</span>{" "}
              {details.account_number}
            </p>
          )}
          {details.account_holder && (
            <p>
              <span className="font-medium">Titular:</span>{" "}
              {details.account_holder}
            </p>
          )}
          {details.phone && (
            <p>
              <span className="font-medium">Teléfono:</span> {details.phone}
            </p>
          )}
        </div>
      );
    } catch {
      return notes;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              💰 Gestión de Billeteras
            </h1>
            <p className="text-gray-600 mt-2">
              Administra billeteras de usuarios y procesa retiros
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setCurrentView("wallets")}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                currentView === "wallets"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Vista de Billeteras
            </button>
            <button
              onClick={() => setCurrentView("history")}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                currentView === "history"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Historial Completo
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <span className="text-2xl">💰</span>
              </div>
              <div className="ml-3">
                <p className="text-xs font-medium text-gray-600">
                  Total Depositado
                </p>
                <p className="text-lg font-bold text-green-600 whitespace-nowrap">
                  {`RD$${totalDeposited.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <span className="text-2xl">📤</span>
              </div>
              <div className="ml-3">
                <p className="text-xs font-medium text-gray-600">
                  Total Retirado
                </p>
                <p className="text-lg font-bold text-orange-600 whitespace-nowrap">
                  {`RD$${totalWithdrawn.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <span className="text-2xl">🏦</span>
              </div>
              <div className="ml-3">
                <p className="text-xs font-medium text-gray-600">
                  Balance en Sistema
                </p>
                <p className="text-lg font-bold text-blue-600 whitespace-nowrap">
                  {`RD$${totalBalance.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <span className="text-2xl">📉</span>
              </div>
              <div className="ml-3">
                <p className="text-xs font-medium text-gray-600">
                  Total Perdido
                </p>
                <p className="text-lg font-bold text-red-600 whitespace-nowrap">
                  {`RD$${totalLost.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <span className="text-2xl">👥</span>
              </div>
              <div className="ml-3">
                <p className="text-xs font-medium text-gray-600">Billeteras</p>
                <p className="text-lg font-bold text-purple-600">
                  {wallets.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-5">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <span className="text-2xl">⏳</span>
              </div>
              <div className="ml-3">
                <p className="text-xs font-medium text-gray-600">
                  Retiros Pendientes
                </p>
                <p className="text-lg font-bold text-yellow-600">
                  {pendingWithdrawals.length}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {currentView === "wallets" ? (
        <div className="space-y-8">
          {/* Retiros Pendientes */}
          {pendingWithdrawals.length > 0 ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b">
                <h3 className="text-lg font-semibold text-gray-900">
                  Solicitudes de Retiro - Acción Requerida
                </h3>
              </div>

              <div className="divide-y divide-gray-200">
                {pendingWithdrawals.map((withdrawal) => (
                  <div
                    key={withdrawal.id}
                    className="p-6 hover:bg-yellow-50 transition-colors border-l-4 border-yellow-400"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-red-100 to-red-200 rounded-full flex items-center justify-center">
                            <span className="text-red-600 font-semibold text-lg">
                              {withdrawal.users?.full_name?.charAt(0) || "U"}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 text-lg">
                              {withdrawal.users?.full_name || "Usuario N/A"}
                            </h4>
                            <p className="text-gray-600">
                              {withdrawal.users?.phone || "Sin teléfono"}
                            </p>
                            <p className="text-sm text-gray-500">
                              ID: #{withdrawal.id.substring(0, 8).toUpperCase()}
                            </p>
                          </div>
                          <div className="ml-4 text-right">
                            <p className="text-3xl font-bold text-red-600 whitespace-nowrap">
                              {`RD$${withdrawal.amount.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </p>
                            <p className="text-sm text-gray-500">
                              {withdrawal.fee
                                ? `Fee: RD$${withdrawal.fee.toFixed(2)}`
                                : "Sin comisión"}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-gray-700">
                              Fecha de Solicitud
                            </p>
                            <p className="text-sm text-gray-900">
                              {format(
                                new Date(withdrawal.created_at),
                                "dd/MM/yyyy HH:mm",
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-700">
                              Notas del Usuario
                            </p>
                            <div className="text-sm text-gray-900">
                              {parseUserNotes(withdrawal.user_notes)}
                            </div>
                          </div>
                        </div>

                        {withdrawal.admin_notes && (
                          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm font-medium text-blue-700">
                              Notas del Sistema:
                            </p>
                            <p className="text-sm text-blue-900">
                              {withdrawal.admin_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-4 mt-4">
                      <button
                        onClick={() =>
                          processWithdrawal(withdrawal.id, "approve")
                        }
                        className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                      >
                        ✅ Aprobar Retiro
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt(
                            "Ingresa la razón del rechazo:",
                          );
                          if (reason && reason.trim()) {
                            processWithdrawal(
                              withdrawal.id,
                              "reject",
                              reason.trim(),
                            );
                          }
                        }}
                        className="px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                      >
                        ❌ Rechazar Retiro
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                ¡No hay retiros pendientes!
              </h3>
              <p className="text-gray-500">
                Todas las solicitudes han sido procesadas
              </p>
            </div>
          )}

          {/* Tabla de Billeteras por Cliente */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 bg-gray-50 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                📊 Billeteras por Cliente - Dinero Real
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Saldo basado solo en depósitos y retiros reales. No incluye
                apuestas ni ganancias.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cliente
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Depositado
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Retirado
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Depositado Real
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Balance Actual
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Monto Perdido
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {wallets.map((wallet) => (
                    <tr
                      key={wallet.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center mr-3">
                            <span className="text-blue-600 font-semibold text-sm">
                              {wallet.users?.full_name?.charAt(0) || "U"}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {wallet.users?.full_name || "Sin nombre"}
                            </p>
                            <p className="text-xs text-gray-500">
                              {wallet.users?.phone ||
                                wallet.users?.username ||
                                ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-medium text-green-600">
                          RD$
                          {wallet.totalDeposited.toLocaleString("es-DO", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-medium text-orange-600">
                          RD$
                          {wallet.totalWithdrawn.toLocaleString("es-DO", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-bold text-blue-700">
                          RD$
                          {wallet.depositadoReal.toLocaleString("es-DO", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-medium text-gray-900">
                          RD$
                          {(wallet.balance || 0).toLocaleString("es-DO", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {wallet.montoPerdido > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold bg-red-100 text-red-700">
                            -RD$
                            {wallet.montoPerdido.toLocaleString("es-DO", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        ) : wallet.montoPerdido < 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold bg-green-100 text-green-700">
                            +RD$
                            {Math.abs(wallet.montoPerdido).toLocaleString(
                              "es-DO",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">RD$0.00</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {wallets.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500">No hay billeteras registradas</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        // Vista de Historial de Transacciones
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Registro Completo de Transacciones
              </h3>
              {/* Selector de fecha para historial */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-600 whitespace-nowrap">
                  📅 Día:
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {selectedDate !== new Date().toISOString().split("T")[0] && (
                  <button
                    onClick={() =>
                      setSelectedDate(new Date().toISOString().split("T")[0])
                    }
                    className="text-xs text-blue-500 hover:text-blue-700 underline"
                  >
                    Hoy
                  </button>
                )}
                <span className="text-xs text-gray-500">
                  ({transactions.length} transacciones)
                </span>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {transactions.map((transaction) => (
              <div
                key={`${transaction.type}-${transaction.id}`}
                className="p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          transaction.type === "deposit" &&
                          transaction.status === "approved"
                            ? "bg-green-100 text-green-800"
                            : transaction.type === "deposit" &&
                                transaction.status === "rejected"
                              ? "bg-red-100 text-red-800"
                              : transaction.type === "withdrawal" &&
                                  transaction.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : transaction.type === "withdrawal" &&
                                    (transaction.status === "approved" ||
                                      transaction.status === "completed")
                                  ? "bg-blue-100 text-blue-800"
                                  : transaction.type === "withdrawal" &&
                                      transaction.status === "rejected"
                                    ? "bg-red-100 text-red-800"
                                    : transaction.type === "bet_win"
                                      ? "bg-green-100 text-green-800"
                                      : transaction.type === "bet_refund"
                                        ? "bg-purple-100 text-purple-800"
                                        : transaction.type ===
                                            "manual_adjustment"
                                          ? "bg-gray-100 text-gray-800"
                                          : transaction.type === "payment"
                                            ? "bg-purple-100 text-purple-800"
                                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {transaction.type === "deposit"
                          ? "💰 DEPÓSITO"
                          : transaction.type === "withdrawal"
                            ? "📤 RETIRO"
                            : transaction.type === "bet_win"
                              ? "🏆 PREMIO"
                              : transaction.type === "bet_refund"
                                ? "↩️ REEMBOLSO"
                                : transaction.type === "manual_adjustment"
                                  ? "🔧 AJUSTE"
                                  : "✅ PAGO"}{" "}
                        - {transaction.status.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-500">
                        #{transaction.id.substring(0, 8).toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {transaction.users?.full_name || "Usuario N/A"}
                        </p>
                        <p className="text-sm text-gray-500">
                          {transaction.users?.phone || "Sin teléfono"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          RD$
                          {transaction.amount.toLocaleString("es-DO", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                        <p className="text-sm text-gray-500">
                          {transaction.payment_method?.replace("RETIRO_", "") ||
                            "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Creada:</p>
                        <p className="text-sm font-medium">
                          {format(
                            new Date(transaction.created_at),
                            "dd/MM/yyyy HH:mm",
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Procesada:</p>
                        <p className="text-sm font-medium">
                          {transaction.updated_at
                            ? format(
                                new Date(transaction.updated_at),
                                "dd/MM/yyyy HH:mm",
                              )
                            : "Pendiente"}
                        </p>
                      </div>
                    </div>

                    {transaction.admin_notes && (
                      <div className="mt-2 p-2 bg-gray-100 rounded text-sm">
                        <span className="font-medium text-gray-700">
                          Nota del Admin:
                        </span>{" "}
                        {transaction.admin_notes}
                      </div>
                    )}

                    {/* Botones de acción para retiros pendientes/aprobados */}
                    {transaction.type === "withdrawal" &&
                      transaction.status !== "rejected" &&
                      transaction.status !== "paid" && (
                        <div className="mt-4 flex gap-2">
                          {transaction.status === "pending" && (
                            <>
                              <button
                                onClick={() =>
                                  processWithdrawal(transaction.id, "approve")
                                }
                                className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                              >
                                ✅ Aprobar
                              </button>
                              <button
                                onClick={() => {
                                  const reason = prompt("Razón del rechazo:");
                                  if (reason)
                                    processWithdrawal(
                                      transaction.id,
                                      "reject",
                                      reason,
                                    );
                                }}
                                className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
                              >
                                ❌ Rechazar
                              </button>
                            </>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {transactions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">
                No hay transacciones en el historial
              </p>
              <p className="text-gray-400 text-sm mt-2">
                Las transacciones procesadas aparecerán aquí
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
