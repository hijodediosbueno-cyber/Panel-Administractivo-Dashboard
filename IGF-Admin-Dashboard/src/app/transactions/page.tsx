"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface PendingDeposit {
  id: string;
  user_id: string;
  amount: number;
  payment_method: string;
  transaction_reference: string;
  receipt_url?: string;
  status: string;
  created_at: string;
  updated_at?: string;
  admin_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

interface PendingDepositWithUser extends PendingDeposit {
  users: {
    full_name: string;
    phone: string;
    username: string;
  };
}

export default function TransactionsPage() {
  const [deposits, setDeposits] = useState<PendingDepositWithUser[]>([]);
  const [historyDeposits, setHistoryDeposits] = useState<
    PendingDepositWithUser[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<
    "all" | "approved" | "rejected"
  >("all");
  const [selectedDate, setSelectedDate] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  );

  useEffect(() => {
    loadDeposits();
    if (showHistory) {
      loadHistory(selectedDate);
    }
  }, [showHistory, selectedDate]);

  // Cerrar modal con ESC
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedImage) {
        setSelectedImage(null);
      }
    };

    if (selectedImage) {
      document.addEventListener("keydown", handleKeyPress);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyPress);
      document.body.style.overflow = "unset";
    };
  }, [selectedImage]);

  const loadDeposits = async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from("pending_deposits")
        .select(
          `
          *,
          users (
            full_name,
            phone,
            username
          )
        `,
        )
        .eq("status", "pending")
        .not("payment_method", "like", "RETIRO_%")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setDeposits(data || []);
    } catch (error) {
      console.error("Error loading deposits:", error);
      setDeposits([]);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (dateStr: string) => {
    const nextDay = new Date(dateStr + "T00:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split("T")[0];

    try {
      const { data, error } = await supabaseAdmin
        .from("pending_deposits")
        .select(
          `
          *,
          users (
            full_name,
            phone,
            username
          )
        `,
        )
        .in("status", ["approved", "rejected"])
        .not("payment_method", "like", "RETIRO_%")
        .gte("created_at", dateStr)
        .lt("created_at", nextDayStr)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      setHistoryDeposits(data || []);
    } catch (error) {
      console.error("Error loading history:", error);
      setHistoryDeposits([]);
    }
  };

  const deleteReceiptImage = async (imageUrl: string) => {
    try {
      // URL format example: https://.../storage/v1/object/public/payment-receipts/comprobantes/file.jpg
      // We need: comprobantes/file.jpg

      // Try to split by bucket name 'payment-receipts'
      const parts = imageUrl.split("/payment-receipts/");
      if (parts.length < 2) {
        return;
      }

      const filePath = parts[1];

      const { error } = await supabaseAdmin.storage
        .from("payment-receipts")
        .remove([filePath]);

      if (error) {
        console.error("❌ Error eliminando imagen del storage:", error);
      }
    } catch (error) {
      console.error("Error en deleteReceiptImage:", error);
    }
  };

  const approveDeposit = async (depositId: string) => {
    try {
      setProcessing(depositId);

      // 1. Obtener información del depósito
      const { data: deposit, error: depositError } = await supabaseAdmin
        .from("pending_deposits")
        .select("*")
        .eq("id", depositId)
        .single();

      if (depositError)
        throw new Error(`Error al obtener depósito: ${depositError.message}`);

      // 2. Actualizar saldo de la billetera
      const { data: currentWallet, error: walletGetError } = await supabaseAdmin
        .from("wallets")
        .select("balance")
        .eq("user_id", deposit.user_id)
        .single();

      if (walletGetError)
        throw new Error(
          `Error al obtener billetera: ${walletGetError.message}`,
        );

      const newBalance = (currentWallet?.balance || 0) + deposit.amount;

      const { error: walletUpdateError } = await supabaseAdmin
        .from("wallets")
        .update({
          balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", deposit.user_id);

      if (walletUpdateError)
        throw new Error(
          `Error al actualizar billetera: ${walletUpdateError.message}`,
        );

      // 2.5 Registrar transacción en historial unificado
      await supabaseAdmin.from("transactions").insert({
        user_id: deposit.user_id,
        transaction_type: "deposit",
        amount: deposit.amount,
        balance_before: currentWallet?.balance || 0,
        balance_after: newBalance,
        status: "completed",
        description: `Depósito aprobado - ${deposit.payment_method}`,
        reference: deposit.transaction_reference,
      });

      // 2.6 Comisión de referido (basada en nivel del agente)
      try {
        // Verificar si el usuario tiene un referente
        const { data: depositorUser, error: depositorError } =
          await supabaseAdmin
            .from("users")
            .select("referred_by")
            .eq("id", deposit.user_id)
            .single();

        if (!depositorError && depositorUser?.referred_by) {
          // Contar referidos directos del referente para determinar su nivel
          const { count: referralCount, error: countError } =
            await supabaseAdmin
              .from("users")
              .select("id", { count: "exact", head: true })
              .eq("referred_by", depositorUser.referred_by);

          const directReferrals = !countError ? referralCount || 0 : 0;

          // Determinar tasa de comisión según nivel del agente
          // Nivel 3: 30+ referidos → 5%
          // Nivel 2: 20+ referidos → 3%
          // Nivel 1: 10+ referidos → 2%
          // Sin nivel: < 10 referidos → 0%
          let commissionRate = 0;
          let agentLevel = 0;
          if (directReferrals >= 30) {
            commissionRate = 0.05;
            agentLevel = 3;
          } else if (directReferrals >= 20) {
            commissionRate = 0.03;
            agentLevel = 2;
          } else if (directReferrals >= 10) {
            commissionRate = 0.02;
            agentLevel = 1;
          }

          const commissionAmount = parseFloat(
            (deposit.amount * commissionRate).toFixed(2),
          );

          if (commissionAmount > 0) {
            // Obtener billetera del referente
            const { data: referrerWallet, error: refWalletError } =
              await supabaseAdmin
                .from("wallets")
                .select("id, balance")
                .eq("user_id", depositorUser.referred_by)
                .single();

            if (!refWalletError && referrerWallet) {
              const newReferrerBalance =
                (referrerWallet.balance || 0) + commissionAmount;

              // Acreditar comisión al referente
              await supabaseAdmin
                .from("wallets")
                .update({
                  balance: newReferrerBalance,
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", depositorUser.referred_by);

              // Obtener nombre del depositante para la descripción
              const { data: depositorInfo } = await supabaseAdmin
                .from("users")
                .select("username, full_name")
                .eq("id", deposit.user_id)
                .single();

              const depositorName =
                depositorInfo?.username ||
                depositorInfo?.full_name ||
                "Referido";

              // Registrar transacción de comisión
              await supabaseAdmin.from("transactions").insert({
                user_id: depositorUser.referred_by,
                transaction_type: "referral_commission",
                amount: commissionAmount,
                balance_before: referrerWallet.balance || 0,
                balance_after: newReferrerBalance,
                status: "completed",
                description: `Comisión ${commissionRate * 100}% (Nv.${agentLevel}) - Recarga de ${depositorName} (RD$${deposit.amount.toLocaleString()})`,
              });
            }
          }
        }
      } catch (commissionError) {
        console.error(
          "⚠️ Error procesando comisión de referido (no crítico):",
          commissionError,
        );
        // No lanzamos error para que la aprobación no falle por esto
      }

      // 3. Actualizar estado del depósito
      const { error: updateError } = await supabaseAdmin
        .from("pending_deposits")
        .update({
          status: "approved",
          updated_at: new Date().toISOString(),
          admin_notes: "Aprobado desde dashboard administrativo",
        })
        .eq("id", depositId);

      if (updateError)
        throw new Error(`Error al actualizar estado: ${updateError.message}`);

      // 4. Eliminar imagen del storage
      const imageUrl = deposit.receipt_url;
      if (imageUrl) {
        await deleteReceiptImage(imageUrl);
      }

      alert("Depósito aprobado exitosamente");
      await loadDeposits();
      if (showHistory) {
        await loadHistory(selectedDate);
      }
    } catch (error) {
      console.error("Error in approveDeposit:", error);
      alert(
        `Error al aprobar: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
    } finally {
      setProcessing(null);
    }
  };

  const rejectDeposit = async (depositId: string, reason?: string) => {
    try {
      setProcessing(depositId);

      // Obtener URL de la imagen antes de rechazar
      const { data: deposit } = await supabaseAdmin
        .from("pending_deposits")
        .select("receipt_url")
        .eq("id", depositId)
        .single();

      const { error } = await supabaseAdmin
        .from("pending_deposits")
        .update({
          status: "rejected",
          updated_at: new Date().toISOString(),
          admin_notes: reason,
        })
        .eq("id", depositId);

      if (error) throw error;

      // Eliminar imagen del storage
      const imageUrl = deposit?.receipt_url;
      if (imageUrl) {
        await deleteReceiptImage(imageUrl);
      }

      alert("Depósito rechazado");
      await loadDeposits();
      if (showHistory) {
        await loadHistory(selectedDate);
      }
    } catch (error) {
      console.error("Error rejecting deposit:", error);
      alert(
        `Error al rechazar: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {showHistory
                ? "📊 Historial de Transacciones"
                : "📋 Transacciones Pendientes"}
            </h1>
            <p className="text-gray-600">
              {showHistory
                ? "Ver transacciones procesadas"
                : "Revisar y aprobar depósitos pendientes"}
            </p>
          </div>

          {/* BOTONES DE NAVEGACIÓN - VERSIÓN 2.0 */}
          <div className="flex space-x-3 bg-yellow-50 p-2 rounded-lg">
            <button
              onClick={() => {
                setShowHistory(false);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                !showHistory
                  ? "bg-blue-600 text-white shadow-lg"
                  : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
              }`}
            >
              📋 Pendientes ({deposits.length})
            </button>
            <button
              onClick={() => {
                setShowHistory(true);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                showHistory
                  ? "bg-blue-600 text-white shadow-lg"
                  : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
              }`}
            >
              📊 Historial
            </button>
          </div>
        </div>

        {/* FILTROS PARA HISTORIAL - VERSIÓN 2.0 */}
        {showHistory && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Selector de fecha */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-blue-700 whitespace-nowrap">
                  📅 Día:
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
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
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-blue-700">
                  🔍 Estado:
                </span>
                <div className="flex space-x-2">
                  {[
                    { key: "all", label: "Todas", icon: "📋" },
                    { key: "approved", label: "Aprobadas", icon: "✅" },
                    { key: "rejected", label: "Rechazadas", icon: "❌" },
                  ].map((filter) => (
                    <button
                      key={filter.key}
                      onClick={() => setHistoryFilter(filter.key as any)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        historyFilter === filter.key
                          ? "bg-blue-100 text-blue-700 border border-blue-300"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {filter.icon} {filter.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-gray-500">
                  (
                  {
                    historyDeposits.filter(
                      (d) =>
                        historyFilter === "all" || d.status === historyFilter,
                    ).length
                  }{" "}
                  resultados)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6">
        {(() => {
          // Determinar qué depósitos mostrar
          const depositsToShow = showHistory
            ? historyDeposits.filter(
                (d) => historyFilter === "all" || d.status === historyFilter,
              )
            : deposits;

          return depositsToShow.map((deposit) => (
            <div key={deposit.id} className="bg-white rounded-lg shadow p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="font-semibold">Usuario</h3>
                  <p>{deposit.users?.full_name || "No disponible"}</p>
                  <p>{deposit.users?.phone || "No disponible"}</p>
                </div>
                <div>
                  <h3 className="font-semibold">Depósito</h3>
                  <p className="text-green-600 font-bold">
                    RD$
                    {deposit.amount.toLocaleString("es-DO", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p>{deposit.payment_method}</p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Creado:</span>{" "}
                    {format(new Date(deposit.created_at), "dd/MM/yyyy HH:mm")}
                  </p>
                  {showHistory && deposit.updated_at && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Procesado:</span>{" "}
                      {format(new Date(deposit.updated_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  )}
                  {showHistory && (
                    <div className="mt-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          deposit.status === "approved"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {deposit.status === "approved"
                          ? "✅ Aprobado"
                          : "❌ Rechazado"}
                      </span>
                    </div>
                  )}
                  {showHistory && deposit.admin_notes && (
                    <p className="text-xs text-gray-500 mt-2">
                      <span className="font-medium">Notas:</span>{" "}
                      {deposit.admin_notes}
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold">Comprobante</h3>
                  {(() => {
                    // Buscar cualquier campo que contenga una URL de imagen
                    const imageUrl =
                      deposit.receipt_url ||
                      (deposit as any).image_url ||
                      (deposit as any).attachment_url ||
                      (deposit as any).comprobante_url;

                    if (imageUrl) {
                      return (
                        <div className="space-y-3">
                          <div
                            className="relative cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setSelectedImage(imageUrl)}
                          >
                            <img
                              src={imageUrl}
                              alt="Comprobante de pago"
                              className="w-full h-32 object-cover rounded-lg border shadow-sm hover:shadow-md transition-shadow"
                              onError={(e) => {
                                console.error(
                                  "❌ Error loading image:",
                                  imageUrl,
                                );
                                e.currentTarget.style.display = "none";
                              }}
                              crossOrigin="anonymous"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-20 transition-all rounded-lg">
                              <span className="text-white opacity-0 hover:opacity-100 font-medium text-sm">
                                Click para ampliar
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => window.open(imageUrl, "_blank")}
                            className="text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            📥 Descargar comprobante
                          </button>
                          <div className="mt-2 space-y-1">
                            <p className="text-xs text-gray-500">
                              URL: {imageUrl}
                            </p>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div className="w-full h-32 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center flex-col">
                          <p className="text-gray-500 text-sm">
                            Sin comprobante adjunto
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Campos verificados: receipt_url, image_url
                          </p>
                        </div>
                      );
                    }
                  })()}

                  {/* Botones de acción - Solo para pendientes */}
                  {!showHistory && (
                    <div className="flex flex-col space-y-2 mt-6">
                      <button
                        onClick={() => approveDeposit(deposit.id)}
                        disabled={processing === deposit.id}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      >
                        {processing === deposit.id
                          ? "Procesando..."
                          : "✅ Aprobar Depósito"}
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt(
                            "Razón del rechazo (opcional):",
                          );
                          if (reason !== null) {
                            rejectDeposit(deposit.id, reason);
                          }
                        }}
                        disabled={processing === deposit.id}
                        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      >
                        {processing === deposit.id
                          ? "Procesando..."
                          : "❌ Rechazar"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ));
        })()}

        {(() => {
          const depositsToShow = showHistory
            ? historyDeposits.filter(
                (d) => historyFilter === "all" || d.status === historyFilter,
              )
            : deposits;

          return (
            depositsToShow.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">
                  {showHistory
                    ? "No hay transacciones en el historial"
                    : "No hay depósitos pendientes"}
                </p>
                <p className="text-gray-400 text-sm mt-2">
                  {showHistory
                    ? "Las transacciones procesadas aparecerán aquí"
                    : "Las nuevas transacciones aparecerán aquí automáticamente"}
                </p>
              </div>
            )
          );
        })()}
      </div>

      {/* Modal de imagen ampliada */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300 text-2xl font-bold z-10"
            >
              ✕
            </button>
            <img
              src={selectedImage}
              alt="Comprobante ampliado"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute -bottom-12 left-0 right-0 flex justify-center">
              <button
                onClick={() => window.open(selectedImage, "_blank")}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                📥 Descargar imagen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
