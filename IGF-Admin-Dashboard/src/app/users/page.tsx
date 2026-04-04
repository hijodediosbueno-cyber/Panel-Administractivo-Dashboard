"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface User {
  id: string;
  auth_id: string;
  phone: string;
  username: string;
  full_name: string;
  created_at: string;
}

interface Wallet {
  id: string;
  balance: number;
  updated_at: string;
}

interface UserWithWallet extends User {
  wallets: Wallet[];
}

interface EditUserData {
  full_name: string;
  phone: string;
  username: string;
}

interface EditWalletData {
  balance: number;
  adjustment: string;
  adjustmentType: "add" | "subtract" | "set";
  reason: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserWithWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserWithWallet | null>(null);
  const [editingWallet, setEditingWallet] = useState<{
    user: UserWithWallet;
    wallet: Wallet;
  } | null>(null);
  const [userFormData, setUserFormData] = useState<EditUserData>({
    full_name: "",
    phone: "",
    username: "",
  });
  const [walletFormData, setWalletFormData] = useState<EditWalletData>({
    balance: 0,
    adjustment: "",
    adjustmentType: "add",
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);

      // 1. Cargar usuarios primero
      const { data: usersData, error: usersError } = await supabaseAdmin
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (usersError) throw usersError;

      // 2. Cargar todas las billeteras
      const { data: walletsData, error: walletsError } = await supabaseAdmin
        .from("wallets")
        .select("*");

      if (walletsError) throw walletsError;

      // 3. Combinar manualmente los datos
      const usersWithWallets =
        usersData?.map((user) => {
          const userWallets =
            walletsData?.filter((wallet) => wallet.user_id === user.id) || [];
          return {
            ...user,
            wallets: userWallets,
          };
        }) || [];

      setUsers(usersWithWallets as UserWithWallet[]);
    } catch (error) {
      alert("Error cargando usuarios: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openUserEditModal = (user: UserWithWallet) => {
    setEditingUser(user);
    setUserFormData({
      full_name: user.full_name || "",
      phone: user.phone || "",
      username: user.username || "",
    });
  };

  const openWalletEditModal = (user: UserWithWallet) => {
    const wallet = user.wallets?.[0];
    if (!wallet) {
      alert("Este usuario no tiene billetera creada");
      return;
    }

    setEditingWallet({ user, wallet });
    setWalletFormData({
      balance: wallet.balance,
      adjustment: "",
      adjustmentType: "add",
      reason: "",
    });
  };

  const closeModals = () => {
    setEditingUser(null);
    setEditingWallet(null);
    setUserFormData({ full_name: "", phone: "", username: "" });
    setWalletFormData({
      balance: 0,
      adjustment: "",
      adjustmentType: "add",
      reason: "",
    });
  };

  const saveUserChanges = async () => {
    if (!editingUser) return;

    try {
      setSaving(true);

      const { error } = await supabaseAdmin
        .from("users")
        .update({
          full_name: userFormData.full_name.trim(),
          phone: userFormData.phone.trim(),
          username: userFormData.username.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingUser.id);

      if (error) throw error;

      alert("Usuario actualizado exitosamente");
      closeModals();
      loadUsers();
    } catch (error) {
      alert("Error actualizando usuario: " + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveWalletChanges = async () => {
    if (!editingWallet) return;

    try {
      setSaving(true);

      let newBalance = editingWallet.wallet.balance;
      const adjustmentAmount = parseFloat(walletFormData.adjustment) || 0;

      switch (walletFormData.adjustmentType) {
        case "add":
          newBalance += adjustmentAmount;
          break;
        case "subtract":
          newBalance -= adjustmentAmount;
          break;
        case "set":
          newBalance = adjustmentAmount;
          break;
      }

      if (newBalance < 0) {
        alert("El balance no puede ser negativo");
        return;
      }

      const { error } = await supabaseAdmin
        .from("wallets")
        .update({
          balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingWallet.wallet.id);

      if (error) throw error;

      // Registrar en pending_deposits para compatibilidad
      await supabaseAdmin.from("pending_deposits").insert({
        user_id: editingWallet.user.id,
        amount: parseFloat(walletFormData.adjustment) || 0,
        status: "approved",
        payment_method: `ADMIN_${walletFormData.adjustmentType.toUpperCase()}`,
        reference_number: `ADJ-${Date.now()}`,
        admin_notes: `Ajuste administrativo: ${walletFormData.reason || "Sin especificar"}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
      });

      // Registrar en transactions para historial unificado
      await supabaseAdmin.from("transactions").insert({
        user_id: editingWallet.user.id,
        transaction_type: "manual_adjustment",
        amount:
          walletFormData.adjustmentType === "subtract"
            ? -(parseFloat(walletFormData.adjustment) || 0)
            : parseFloat(walletFormData.adjustment) || 0,
        balance_before: editingWallet.wallet.balance,
        balance_after: newBalance,
        status: "completed",
        description: `Ajuste manual (${walletFormData.adjustmentType}): ${walletFormData.reason || "Sin motivo"}`,
      });

      alert("Balance actualizado exitosamente");
      closeModals();
      loadUsers();
    } catch (error) {
      alert("Error actualizando billetera: " + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const createWallet = async (userId: string) => {
    try {
      setSaving(true);

      const { error } = await supabaseAdmin.from("wallets").insert({
        user_id: userId,
        balance: 0.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) throw error;

      alert("Billetera creada exitosamente");
      loadUsers();
    } catch (error) {
      alert("Error creando billetera: " + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Gestión de Usuarios
          </h1>
          <p className="text-gray-600">Administra usuarios y sus billeteras</p>
        </div>
        <div className="text-sm text-gray-500">
          Total: {users.length} usuarios
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800">Total Usuarios</h3>
          <p className="text-2xl font-bold text-blue-600">{users.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-green-800">Con Billetera</h3>
          <p className="text-2xl font-bold text-green-600">
            {users.filter((u) => u.wallets && u.wallets.length > 0).length}
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-red-800">Sin Billetera</h3>
          <p className="text-2xl font-bold text-red-600">
            {users.filter((u) => !u.wallets || u.wallets.length === 0).length}
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-purple-800">Balance Total</h3>
          <p className="text-2xl font-bold text-purple-600">
            $
            {users
              .filter((u) => u.wallets && u.wallets.length > 0)
              .reduce((total, u) => total + (u.wallets[0].balance || 0), 0)
              .toFixed(2)}
          </p>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Teléfono
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Balance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Registro
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-semibold">
                          {user.full_name?.charAt(0) || "U"}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.full_name || "Sin nombre"}
                        </div>
                        <div className="text-sm text-gray-500">
                          @{user.username || "sin_username"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.phone || "Sin teléfono"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.wallets && user.wallets.length > 0 ? (
                      <div>
                        <span className="text-lg font-semibold text-green-600">
                          ${user.wallets[0].balance.toFixed(2)}
                        </span>
                        <div className="text-xs text-gray-500">
                          Actualizado:{" "}
                          {format(
                            new Date(user.wallets[0].updated_at),
                            "dd/MM HH:mm",
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-red-500">
                        Sin billetera
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(user.created_at), "dd/MM/yyyy")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => openUserEditModal(user)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium border border-blue-700"
                      >
                        Editar Usuario
                      </button>

                      {user.wallets && user.wallets.length > 0 ? (
                        <button
                          onClick={() => openWalletEditModal(user)}
                          className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium border border-green-700"
                        >
                          Editar Balance
                        </button>
                      ) : (
                        <button
                          onClick={() => createWallet(user.id)}
                          disabled={saving}
                          className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm font-medium border border-purple-700"
                        >
                          Crear Billetera
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4"></div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay usuarios
            </h3>
            <p className="text-gray-500">
              No se encontraron usuarios registrados en el sistema.
            </p>
          </div>
        )}
      </div>
      {/* Modal Editar Usuario */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Editar Usuario</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  value={userFormData.full_name}
                  onChange={(e) =>
                    setUserFormData({
                      ...userFormData,
                      full_name: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nombre completo del usuario"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={userFormData.phone}
                  onChange={(e) =>
                    setUserFormData({ ...userFormData, phone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Número de teléfono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de Usuario
                </label>
                <input
                  type="text"
                  value={userFormData.username}
                  onChange={(e) =>
                    setUserFormData({
                      ...userFormData,
                      username: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nombre de usuario único"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <button
                onClick={closeModals}
                disabled={saving}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium shadow-lg"
              >
                Cancelar
              </button>
              <button
                onClick={saveUserChanges}
                disabled={saving || !userFormData.full_name.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium shadow-lg"
              >
                {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Balance */}
      {editingWallet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4 text-center">
              💰 Editar Balance
            </h3>

            <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border">
              <p className="text-center text-lg font-medium text-gray-800">
                {editingWallet.user.full_name}
              </p>
              <p className="text-center text-2xl font-bold text-green-600">
                Balance actual: ${editingWallet.wallet.balance.toFixed(2)}
              </p>
            </div>

            <div className="space-y-4">
              {/* Botones rápidos */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <button
                  onClick={() =>
                    setWalletFormData({
                      ...walletFormData,
                      adjustmentType: "add",
                      adjustment: "100",
                    })
                  }
                  className="bg-green-500 text-white py-2 px-3 rounded-lg text-sm hover:bg-green-600 transition-colors font-medium"
                >
                  +$100
                </button>
                <button
                  onClick={() =>
                    setWalletFormData({
                      ...walletFormData,
                      adjustmentType: "add",
                      adjustment: "500",
                    })
                  }
                  className="bg-green-600 text-white py-2 px-3 rounded-lg text-sm hover:bg-green-700 transition-colors font-medium"
                >
                  +$500
                </button>
                <button
                  onClick={() =>
                    setWalletFormData({
                      ...walletFormData,
                      adjustmentType: "set",
                      adjustment: "0",
                    })
                  }
                  className="bg-red-500 text-white py-2 px-3 rounded-lg text-sm hover:bg-red-600 transition-colors font-medium"
                >
                  Resetear
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Acción
                </label>
                <select
                  value={walletFormData.adjustmentType}
                  onChange={(e) =>
                    setWalletFormData({
                      ...walletFormData,
                      adjustmentType: e.target.value as
                        | "add"
                        | "subtract"
                        | "set",
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="add">➕ Agregar dinero</option>
                  <option value="subtract">➖ Quitar dinero</option>
                  <option value="set">🎯 Establecer balance exacto</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {walletFormData.adjustmentType === "set"
                    ? "Nuevo Balance Total"
                    : "Cantidad"}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={walletFormData.adjustment}
                    onChange={(e) =>
                      setWalletFormData({
                        ...walletFormData,
                        adjustment: e.target.value,
                      })
                    }
                    onFocus={(e) => {
                      if (walletFormData.adjustment === "0") {
                        setWalletFormData({
                          ...walletFormData,
                          adjustment: "",
                        });
                      }
                    }}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-lg"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Motivo (opcional)
                </label>
                <input
                  type="text"
                  value={walletFormData.reason}
                  onChange={(e) =>
                    setWalletFormData({
                      ...walletFormData,
                      reason: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="Ej: Bonificación, Corrección, etc."
                />
              </div>

              {(parseFloat(walletFormData.adjustment) || 0) > 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-center text-sm text-green-800 font-medium">
                    💡 Nuevo balance: $
                    {walletFormData.adjustmentType === "add"
                      ? (
                          editingWallet.wallet.balance +
                          (parseFloat(walletFormData.adjustment) || 0)
                        ).toFixed(2)
                      : walletFormData.adjustmentType === "subtract"
                        ? (
                            editingWallet.wallet.balance -
                            (parseFloat(walletFormData.adjustment) || 0)
                          ).toFixed(2)
                        : (parseFloat(walletFormData.adjustment) || 0).toFixed(
                            2,
                          )}
                  </p>
                </div>
              )}
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={closeModals}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium shadow-lg"
              >
                Cancelar
              </button>
              <button
                onClick={saveWalletChanges}
                disabled={
                  saving || (parseFloat(walletFormData.adjustment) || 0) <= 0
                }
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium shadow-lg"
              >
                {saving ? "⏳ Guardando..." : "✅ Aplicar Cambio"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
