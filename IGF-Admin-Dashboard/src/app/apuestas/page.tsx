"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

interface Team {
  id: string;
  name: string;
  logo_url: string;
}

interface BettingEvent {
  id: string;
  team1_id: string;
  team2_id: string;
  team1?: Team;
  team2?: Team;
  event_date: string;
  event_time: string;
  status: "upcoming" | "live" | "finished";
  bet_type?: "normal" | "inversa";
  suggested_score?: string;
  created_at: string;
}

interface EventFormData {
  team1_name: string;
  team1_logo: string;
  team2_name: string;
  team2_logo: string;
  event_date: string;
  event_time: string;
  bet_type: "normal" | "inversa";
  suggested_score: string;
}

export default function ApuestasPage() {
  const [events, setEvents] = useState<BettingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<BettingEvent | null>(null);
  const [showBetsModal, setShowBetsModal] = useState(false);
  const [selectedEventBets, setSelectedEventBets] = useState<any>(null);
  const [betsData, setBetsData] = useState<any[]>([]);
  const [loadingBets, setLoadingBets] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BettingEvent | null>(null);
  const [processingWinners, setProcessingWinners] = useState(false);
  const [bettingStats, setBettingStats] = useState<{
    [key: string]: {
      userCount: number;
      totalAmount: number;
      profit: number;
      users?: Array<{ name: string; amount: number; phone: string }>;
    };
  }>({});
  const [loadingStats, setLoadingStats] = useState(false);
  const [cancellingEvent, setCancellingEvent] = useState(false);
  const [formData, setFormData] = useState<EventFormData>({
    team1_name: "",
    team1_logo: "",
    team2_name: "",
    team2_logo: "",
    event_date: "", // Se inicializa en el cliente
    event_time: new Date().toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }), // Hora actual
    bet_type: "normal",
    suggested_score: "",
  });
  const [saving, setSaving] = useState(false);
  const getLocalDateString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const [selectedDate, setSelectedDate] = useState("");
  const [showAllEvents, setShowAllEvents] = useState(false);

  // Inicializar fecha en el cliente para evitar desfase de zona horaria con SSR
  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(getLocalDateString());
    }
  }, []);

  useEffect(() => {
    if (selectedDate) loadEvents();
  }, [selectedDate, showAllEvents]);

  const loadEvents = async () => {
    if (!selectedDate && !showAllEvents) return; // Esperar a que se inicialice la fecha
    try {
      setLoading(true);

      let query = supabaseAdmin
        .from("betting_events")
        .select(
          `
          *,
          team1:teams!team1_id(id, name, logo_url),
          team2:teams!team2_id(id, name, logo_url)
        `,
        )
        .in("status", ["upcoming", "live"]); // Solo mostrar eventos activos

      if (!showAllEvents) {
        query = query.eq("event_date", selectedDate);
      } else {
        // Mostrar eventos de los últimos 30 días
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        query = query.gte(
          "event_date",
          thirtyDaysAgo.toISOString().split("T")[0],
        );
      }

      const { data, error } = await query
        .order("event_date", { ascending: false })
        .order("event_time", { ascending: false });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      alert("Error cargando eventos: " + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadEventBets = async (eventName: string) => {
    try {
      setLoadingBets(true);

      // Buscar el evento en la tabla events por el nombre (mejorado)

      // Intentar múltiples formas de buscar el evento
      let eventData = null;

      // 1. Búsqueda exacta por título
      const { data: exactMatch } = await supabaseAdmin
        .from("events")
        .select("id, title, team_a_name, team_b_name, status")
        .eq("title", eventName)
        .eq("status", "active")
        .single();

      if (exactMatch) {
        eventData = exactMatch;
      } else {
        // 2. Búsqueda por similaridad en título
        const { data: similarMatch } = await supabaseAdmin
          .from("events")
          .select("id, title, team_a_name, team_b_name, status")
          .ilike("title", `%${eventName}%`)
          .eq("status", "active")
          .single();

        if (similarMatch) {
          eventData = similarMatch;
        } else {
          // 3. Búsqueda por nombres de equipos
          const teamNames = eventName.split(" vs ");
          if (teamNames.length === 2) {
            const { data: teamMatch } = await supabaseAdmin
              .from("events")
              .select("id, title, team_a_name, team_b_name, status")
              .eq("team_a_name", teamNames[0].trim())
              .eq("team_b_name", teamNames[1].trim())
              .eq("status", "active")
              .single();

            if (teamMatch) {
              eventData = teamMatch;
            }
          }
        }
      }

      if (!eventData) {
        // Mostrar eventos disponibles para debug
        const { data: allEvents } = await supabaseAdmin
          .from("events")
          .select("id, title, team_a_name, team_b_name, status")
          .eq("status", "active");

        if (allEvents) {
          allEvents.forEach((event) => {});
        }

        setBetsData([]);
        return;
      }

      // Obtener las opciones de apuesta con las apuestas realizadas
      const { data: bettingOptions, error: optionsError } = await supabaseAdmin
        .from("betting_options")
        .select("id, score, profit_percentage, volume")
        .eq("event_id", eventData.id)
        .eq("is_active", true)
        .order("score");

      if (optionsError) throw optionsError;

      // Para cada opción de apuesta, obtener las apuestas realizadas
      const betsPromises = bettingOptions.map(async (option) => {
        const { data: userBets, error: betsError } = await supabaseAdmin
          .from("user_bets")
          .select(
            `
            id, amount, potential_profit, status, created_at,
            users!inner(id, full_name, phone, username)
          `,
          )
          .eq("betting_option_id", option.id)
          .in("status", ["pending", "active"]) // Solo apuestas activas
          .order("created_at", { ascending: false });

        if (betsError) {
          console.error(
            "Error obteniendo apuestas para opción:",
            option.score,
            betsError,
          );
          return {
            ...option,
            bets: [],
            totalAmount: 0,
            totalBets: 0,
          };
        }

        const totalAmount =
          userBets?.reduce((sum, bet) => sum + parseFloat(bet.amount), 0) || 0;

        return {
          ...option,
          bets: userBets || [],
          totalAmount,
          totalBets: userBets?.length || 0,
        };
      });

      const betsData = await Promise.all(betsPromises);
      const totalBets = betsData.reduce(
        (sum, option) => sum + option.totalBets,
        0,
      );
      const totalAmount = betsData.reduce(
        (sum, option) => sum + option.totalAmount,
        0,
      );

      setBetsData(betsData);
      setSelectedEventBets({
        ...eventData,
        eventName,
      });
      setSelectedEventBets({
        ...eventData,
        eventName,
      });
    } catch (error) {
      console.error("Error cargando apuestas:", error);
      alert("Error cargando apuestas: " + (error as Error).message);
    } finally {
      setLoadingBets(false);
    }
  };

  const openBetsModal = (event: BettingEvent) => {
    const eventName = `${event.team1?.name || "Equipo 1"} vs ${event.team2?.name || "Equipo 2"}`;
    loadEventBets(eventName);
    setShowBetsModal(true);
  };

  const closeBetsModal = () => {
    setShowBetsModal(false);
    setSelectedEventBets(null);
    setBetsData([]);
  };

  const openWinnerModal = async (event: BettingEvent) => {
    setSelectedEvent(event);
    setShowWinnerModal(true);
    await loadBettingStatsForEvent(event);
  };

  const closeWinnerModal = () => {
    setShowWinnerModal(false);
    setSelectedEvent(null);
    setBettingStats({});
  };

  const loadBettingStatsForEvent = async (event: BettingEvent) => {
    try {
      setLoadingStats(true);

      // 1. Buscar el evento en la tabla events (Lógica robusta)
      const eventName = `${event.team1?.name || "Equipo 1"} vs ${event.team2?.name || "Equipo 2"}`;
      let eventData = null;

      // A. Búsqueda exacta
      const { data: exactMatch } = await supabaseAdmin
        .from("events")
        .select("id, title")
        .eq("title", eventName)
        .eq("status", "active")
        .single();

      if (exactMatch) {
        eventData = exactMatch;
      } else {
        // B. Búsqueda ilike
        const { data: similarMatch } = await supabaseAdmin
          .from("events")
          .select("id, title")
          .ilike("title", `%${eventName}%`)
          .eq("status", "active")
          .single();

        if (similarMatch) {
          eventData = similarMatch;
        } else if (event.team1?.name && event.team2?.name) {
          // C. Búsqueda por equipos
          const { data: teamMatch } = await supabaseAdmin
            .from("events")
            .select("id, title")
            .eq("team_a_name", event.team1.name)
            .eq("team_b_name", event.team2.name)
            .eq("status", "active")
            .single();

          if (teamMatch) eventData = teamMatch;
        }
      }

      if (!eventData) {
        setLoadingStats(false);
        return;
      }

      // 2. Obtener todas las opciones de apuesta del evento
      const { data: bettingOptions, error: optionsError } = await supabaseAdmin
        .from("betting_options")
        .select("id, score, profit_percentage")
        .eq("event_id", eventData.id);

      if (optionsError || !bettingOptions) {
        setLoadingStats(false);
        return;
      }

      // 3. Obtener estadísticas de apuestas por cada opción incluyendo usuarios
      const stats: {
        [key: string]: {
          userCount: number;
          totalAmount: number;
          profit: number;
          users: Array<{ name: string; amount: number; phone: string }>;
        };
      } = {};

      for (const option of bettingOptions) {
        const { data: bets, error: betsError } = await supabaseAdmin
          .from("user_bets")
          .select(
            `
            user_id, amount,
            users!inner(id, full_name, phone, username)
          `,
          )
          .eq("betting_option_id", option.id)
          .in("status", ["pending", "active"]);

        if (!betsError && bets) {
          stats[option.score] = {
            userCount: bets.length,
            totalAmount: bets.reduce(
              (sum, bet) => sum + parseFloat(bet.amount),
              0,
            ),
            profit: option.profit_percentage,
            users: bets.map((bet) => ({
              name:
                (bet.users as any).full_name ||
                (bet.users as any).username ||
                "Usuario Anónimo",
              amount: parseFloat(bet.amount),
              phone: (bet.users as any).phone || "N/A",
            })),
          };
        } else {
          stats[option.score] = {
            userCount: 0,
            totalAmount: 0,
            profit: option.profit_percentage,
            users: [],
          };
        }
      }

      setBettingStats(stats);
    } catch (error) {
      console.error("Error cargando estadísticas de apuestas:", error);
    } finally {
      setLoadingStats(false);
    }
  };

  const processWinners = async (selectedScore: string) => {
    if (!selectedEvent) return;

    try {
      setProcessingWinners(true);

      const isInverse = selectedEvent.bet_type === "inversa";
      const suggestedScore = selectedEvent.suggested_score || "";

      // 1. Buscar el evento en la tabla events (Lógica robusta)
      const eventName = `${selectedEvent.team1?.name || "Equipo 1"} vs ${selectedEvent.team2?.name || "Equipo 2"}`;
      let eventData = null;

      // A. Búsqueda exacta
      const { data: exactMatch } = await supabaseAdmin
        .from("events")
        .select("id, title")
        .eq("title", eventName)
        .eq("status", "active")
        .single();

      if (exactMatch) {
        eventData = exactMatch;
      } else {
        // B. Búsqueda ilike
        const { data: similarMatch } = await supabaseAdmin
          .from("events")
          .select("id, title")
          .ilike("title", `%${eventName}%`)
          .eq("status", "active")
          .single();

        if (similarMatch) {
          eventData = similarMatch;
        } else if (selectedEvent.team1?.name && selectedEvent.team2?.name) {
          // C. Búsqueda por equipos
          const { data: teamMatch } = await supabaseAdmin
            .from("events")
            .select("id, title")
            .eq("team_a_name", selectedEvent.team1.name)
            .eq("team_b_name", selectedEvent.team2.name)
            .eq("status", "active")
            .single();

          if (teamMatch) eventData = teamMatch;
        }
      }

      if (!eventData) {
        throw new Error(
          "No se encontró el evento ACTIVO en la base de datos móvil. Verifica que el evento no haya sido finalizado previamente.",
        );
      }

      // 2. Obtener TODAS las opciones de apuesta
      const { data: allOptions, error: allOptionsError } = await supabaseAdmin
        .from("betting_options")
        .select("id, score, profit_percentage")
        .eq("event_id", eventData.id);

      if (allOptionsError || !allOptions) {
        throw new Error("No se encontraron las opciones de apuesta");
      }

      // 3. Determinar ganadores y perdedores según tipo
      let winningOptions: typeof allOptions = [];
      let losingOptions: typeof allOptions = [];

      if (isInverse) {
        // ===== LÓGICA INVERSA =====
        // selectedScore = resultado real del partido
        // Quienes apostaron al resultado real → PIERDEN todo
        // Quienes apostaron otro resultado → GANAN
        // Excepción: si resultado real = sugerido → TODOS ganan
        const everyoneWins = selectedScore === suggestedScore;
        if (everyoneWins) {
          winningOptions = allOptions;
          losingOptions = [];
        } else {
          winningOptions = allOptions.filter(
            (opt) => opt.score !== selectedScore,
          );
          losingOptions = allOptions.filter(
            (opt) => opt.score === selectedScore,
          );
        }
      } else {
        // ===== LÓGICA NORMAL =====
        // selectedScore = resultado ganador
        // Quienes apostaron al score seleccionado → GANAN
        // Todos los demás → PIERDEN
        winningOptions = allOptions.filter(
          (opt) => opt.score === selectedScore,
        );
        losingOptions = allOptions.filter((opt) => opt.score !== selectedScore);
      }

      // 4. Procesar GANADORES - pagar apuesta + ganancia
      let results: any[] = [];

      for (const option of winningOptions) {
        const { data: winBets, error: winBetsError } = await supabaseAdmin
          .from("user_bets")
          .select(
            `
              id, amount, user_id,
              users!inner(id, auth_id)
            `,
          )
          .eq("betting_option_id", option.id)
          .in("status", ["active", "pending"]);

        if (winBetsError) {
          console.error("Error obteniendo apuestas ganadoras:", winBetsError);
          continue;
        }

        if (winBets && winBets.length > 0) {
          for (const bet of winBets) {
            const betAmount = parseFloat(bet.amount);
            const profit = (betAmount * option.profit_percentage) / 100;
            const totalReturn = betAmount + profit;

            const { data: userWallet, error: getWalletError } =
              await supabaseAdmin
                .from("wallets")
                .select("balance")
                .eq("user_id", bet.user_id)
                .single();

            if (getWalletError) {
              console.error("Error obteniendo billetera:", getWalletError);
              continue;
            }

            const currentBalance = parseFloat(userWallet.balance || "0");
            const newBalance = currentBalance + totalReturn;

            const { error: walletError } = await supabaseAdmin
              .from("wallets")
              .update({ balance: newBalance })
              .eq("user_id", bet.user_id);

            if (walletError) {
              console.error("Error actualizando billetera:", walletError);
              continue;
            }

            const description = isInverse
              ? `Premio INVERSA: ${eventData.title} (Resultado real: ${selectedScore}, Apostó: ${option.score})`
              : `Premio por evento: ${eventData.title} (Resultado: ${selectedScore})`;

            await supabaseAdmin.from("transactions").insert({
              user_id: bet.user_id,
              transaction_type: "bet_win",
              amount: totalReturn,
              balance_before: currentBalance,
              balance_after: newBalance,
              status: "completed",
              description,
            });

            await supabaseAdmin
              .from("user_bets")
              .update({
                status: "won",
                actual_profit: profit,
                total_return: totalReturn,
              })
              .eq("id", bet.id);

            results.push({
              userId: (bet as any).users.id,
              betAmount,
              profit,
              totalReturn,
              score: option.score,
            });
          }
        }
      }

      // 5. Procesar PERDEDORES - marcar como perdidas
      for (const option of losingOptions) {
        await supabaseAdmin
          .from("user_bets")
          .update({ status: "lost" })
          .eq("betting_option_id", option.id)
          .in("status", ["active", "pending"]);
      }

      // 6. Marcar evento como finalizado
      await supabaseAdmin
        .from("betting_events")
        .update({
          status: "finished",
          final_score: selectedScore,
        })
        .eq("id", selectedEvent.id);

      await supabaseAdmin
        .from("events")
        .update({
          status: "finished",
          final_score: selectedScore,
        })
        .eq("id", eventData.id);

      // 7. Mostrar resumen
      const totalWinners = results.length;
      const totalPaid = results.reduce((sum, r) => sum + r.totalReturn, 0);
      const totalProfit = results.reduce((sum, r) => sum + r.profit, 0);

      if (isInverse) {
        const everyoneWins = selectedScore === suggestedScore;
        const losingStats = bettingStats[selectedScore];
        const totalLosers = everyoneWins ? 0 : losingStats?.userCount || 0;
        const totalLost = everyoneWins ? 0 : losingStats?.totalAmount || 0;

        alert(
          `🔄 Evento INVERSO finalizado!\n\n📊 Resumen:\n• Resultado real: ${selectedScore}\n• Marcador sugerido: ${suggestedScore}\n${everyoneWins ? "• ✅ Resultado = Sugerido → ¡TODOS GANAN!" : "• ❌ Resultado ≠ Sugerido"}\n\n🏆 Ganadores: ${totalWinners} usuarios\n💰 Total pagado: RD$${totalPaid.toLocaleString("es-DO")}\n💸 Ganancias distribuidas: RD$${totalProfit.toLocaleString("es-DO")}\n${!everyoneWins ? `\n😢 Perdedores (apostaron ${selectedScore}): ${totalLosers} usuarios\n💸 Total perdido: RD$${totalLost.toLocaleString("es-DO")}` : ""}\n\n✅ Las billeteras han sido actualizadas automáticamente`,
        );
      } else {
        alert(
          `🏆 Evento finalizado exitosamente!\n\n📊 Resumen:\n• Resultado ganador: ${selectedScore}\n• Ganadores: ${totalWinners} usuarios\n• Total pagado: RD$${totalPaid.toLocaleString("es-DO")}\n• Ganancias distribuidas: RD$${totalProfit.toLocaleString("es-DO")}\n\n✅ Las billeteras han sido actualizadas automáticamente`,
        );
      }

      closeWinnerModal();
      loadEvents();
    } catch (error) {
      console.error("Error procesando evento:", error);
      alert("Error procesando evento: " + (error as Error).message);
    } finally {
      setProcessingWinners(false);
    }
  };

  const cancelEvent = async (event: BettingEvent) => {
    if (!event) return;

    const confirmMessage = `¿Estás seguro de que quieres CANCELAR el evento "${event.team1?.name} vs ${event.team2?.name}"?\n\n⚠️ Esta acción:\n• Devolverá el dinero a TODOS los usuarios que apostaron\n• Marcará el evento como cancelado\n• NO se puede deshacer\n\n¿Continuar?`;

    if (!confirm(confirmMessage)) return;

    try {
      setCancellingEvent(true);

      // 1. Verificar si el evento existe en la tabla events (eventos móviles)
      let eventData: any = null;
      let activeBets: any[] = [];

      // Buscar directamente por ID primero
      const { data: eventById, error: eventByIdError } = await supabaseAdmin
        .from("events")
        .select("id, title, team_a_name, team_b_name")
        .eq("id", event.id)
        .single();

      if (eventById) {
        eventData = eventById;
      } else {
        // Si no se encuentra por ID, buscar por nombre (fallback)
        const eventName = `${event.team1?.name || "Equipo 1"} vs ${event.team2?.name || "Equipo 2"}`;
        const { data: eventByName, error: eventByNameError } =
          await supabaseAdmin
            .from("events")
            .select("id, title, team_a_name, team_b_name")
            .ilike("title", `%${eventName}%`)
            .single();

        if (eventByName) {
          eventData = eventByName;
        } else {
        }
      }

      // 2. Si encontramos el evento en tabla events, obtener apuestas activas
      if (eventData) {
        const { data: bets, error: betsError } = await supabaseAdmin
          .from("user_bets")
          .select(
            `
            id, amount, user_id,
            users!inner(id, full_name, username),
            betting_options!inner(score, event_id)
          `,
          )
          .eq("betting_options.event_id", eventData.id)
          .in("status", ["active", "pending"]);

        if (betsError) {
          throw new Error(
            "Error obteniendo apuestas del evento: " + betsError.message,
          );
        }

        activeBets = bets || [];
      }

      // 3. Procesar cancelación según si hay apuestas o no
      if (activeBets.length === 0) {
        // No hay apuestas, solo cancelar los eventos
        if (eventData) {
          await supabaseAdmin
            .from("events")
            .update({ status: "cancelled" })
            .eq("id", eventData.id);
        }

        await supabaseAdmin
          .from("betting_events")
          .update({ status: "finished" })
          .eq("id", event.id);

        alert("Evento cancelado exitosamente (no había apuestas)");
        loadEvents();
        return;
      }

      // 4. Procesar devolución de dinero para cada apuesta
      let totalRefunded = 0;
      let usersRefunded = 0;

      const refundPromises = activeBets.map(async (bet: any) => {
        const betAmount = parseFloat(bet.amount);

        // Buscar la billetera del usuario
        const { data: userWallet, error: getWalletError } = await supabaseAdmin
          .from("wallets")
          .select("balance, total_invested")
          .eq("user_id", bet.user_id)
          .single();

        if (getWalletError) {
          throw new Error(
            `Error obteniendo billetera del usuario: ${getWalletError.message}`,
          );
        }

        const currentBalance = parseFloat(userWallet.balance || "0");
        const currentInvested = parseFloat(userWallet.total_invested || "0");
        const newBalance = currentBalance + betAmount;
        const newInvested = Math.max(0, currentInvested - betAmount); // Reducir inversión

        // Actualizar billetera del usuario
        const { error: walletError } = await supabaseAdmin
          .from("wallets")
          .update({
            balance: newBalance.toString(),
            total_invested: newInvested.toString(),
          })
          .eq("user_id", bet.user_id);

        if (walletError) {
          throw new Error(
            `Error actualizando billetera: ${walletError.message}`,
          );
        }

        // Registrar la transacción de devolución
        const { error: transactionError } = await supabaseAdmin
          .from("transactions")
          .insert({
            user_id: bet.user_id,
            transaction_type: "bet_refund",
            amount: betAmount,
            balance_before: currentBalance,
            balance_after: newBalance,
            status: "completed",
            description: `Devolución por cancelación del evento: ${eventData?.title || "Evento cancelado"}`,
          });

        if (transactionError) {
          throw new Error(
            `Error registrando transacción: ${transactionError.message}`,
          );
        }

        // Cancelar la apuesta
        const { error: betCancelError } = await supabaseAdmin
          .from("user_bets")
          .update({ status: "cancelled" })
          .eq("id", bet.id);

        if (betCancelError) {
          throw new Error(
            `Error cancelando apuesta: ${betCancelError.message}`,
          );
        }

        totalRefunded += betAmount;
        usersRefunded++;

        return {
          userId: bet.user_id,
          userName: bet.users.full_name || bet.users.username,
          amount: betAmount,
        };
      });

      // Ejecutar todas las devoluciones
      const refundResults = await Promise.all(refundPromises);

      // 5. Cancelar el evento en ambas tablas
      if (eventData) {
        await supabaseAdmin
          .from("events")
          .update({ status: "cancelled" })
          .eq("id", eventData.id);
      }

      await supabaseAdmin
        .from("betting_events")
        .update({ status: "finished" })
        .eq("id", event.id);

      // Mostrar resumen de la cancelación
      const refundSummary = refundResults
        .map((r) => `• ${r.userName}: RD$${r.amount.toLocaleString()}`)
        .join("\n");

      alert(
        `✅ Evento cancelado exitosamente!\n\n💰 Devoluciones procesadas:\n${refundSummary}\n\n📊 Resumen:\n• Total devuelto: RD$${totalRefunded.toLocaleString()}\n• Usuarios afectados: ${usersRefunded}`,
      );

      loadEvents();
    } catch (error: any) {
      console.error("Error cancelando evento:", error);
      alert(`Error cancelando evento: ${error.message}`);
    } finally {
      setCancellingEvent(false);
    }
  };

  const openCreateModal = () => {
    const now = new Date();
    setFormData({
      team1_name: "",
      team1_logo: "",
      team2_name: "",
      team2_logo: "",
      event_date: selectedDate, // Usar la fecha seleccionada (por defecto es hoy)
      event_time: now.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      }), // Hora actual
      bet_type: "normal",
      suggested_score: "",
    });
    setEditingEvent(null);
    setShowCreateModal(true);
  };

  const openEditModal = (event: BettingEvent) => {
    setFormData({
      team1_name: event.team1?.name || "",
      team1_logo: event.team1?.logo_url || "",
      team2_name: event.team2?.name || "",
      team2_logo: event.team2?.logo_url || "",
      event_date: event.event_date,
      event_time: event.event_time,
      bet_type: event.bet_type || "normal",
      suggested_score: event.suggested_score || "",
    });
    setEditingEvent(event);
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingEvent(null);
    setFormData({
      team1_name: "",
      team1_logo: "",
      team2_name: "",
      team2_logo: "",
      event_date: selectedDate,
      event_time: "20:00",
      bet_type: "normal",
      suggested_score: "",
    });
  };

  const saveEvent = async () => {
    try {
      setSaving(true);

      if (!formData.team1_name || !formData.team2_name) {
        alert("Por favor ingresa los nombres de ambos equipos");
        return;
      }

      if (editingEvent) {
        // Actualizar equipos existentes
        if (editingEvent.team1) {
          await supabaseAdmin
            .from("teams")
            .update({
              name: formData.team1_name,
              logo_url: formData.team1_logo,
            })
            .eq("id", editingEvent.team1.id);
        }

        if (editingEvent.team2) {
          await supabaseAdmin
            .from("teams")
            .update({
              name: formData.team2_name,
              logo_url: formData.team2_logo,
            })
            .eq("id", editingEvent.team2.id);
        }

        // Actualizar evento en betting_events
        const { data: updatedBettingEvent, error: updateError } =
          await supabaseAdmin
            .from("betting_events")
            .update({
              event_date: formData.event_date,
              event_time: formData.event_time,
              bet_type: formData.bet_type,
              suggested_score:
                formData.bet_type === "inversa"
                  ? formData.suggested_score
                  : null,
            })
            .eq("id", editingEvent.id)
            .select(
              `
            *,
            team1:teams!team1_id(id, name, logo_url),
            team2:teams!team2_id(id, name, logo_url)
          `,
            )
            .single();

        if (updateError) throw updateError;

        // También actualizar en la tabla events para sincronizar con la app móvil
        const matchDateTime = new Date(
          `${formData.event_date}T${formData.event_time}`,
        );

        // Buscar el evento en la tabla events usando los nombres originales
        const originalMatchTime = new Date(
          `${editingEvent.event_date}T${editingEvent.event_time}`,
        ).toISOString();
        const { data: existingMobileEvent } = await supabaseAdmin
          .from("events")
          .select("id")
          .eq("team_a_name", editingEvent.team1?.name)
          .eq("team_b_name", editingEvent.team2?.name)
          .eq("match_time", originalMatchTime)
          .single();

        if (existingMobileEvent) {
          await supabaseAdmin
            .from("events")
            .update({
              title: `${formData.team1_name} vs ${formData.team2_name}`,
              team_a_name: formData.team1_name,
              team_b_name: formData.team2_name,
              team_a_logo: formData.team1_logo,
              team_b_logo: formData.team2_logo,
              match_time: matchDateTime.toISOString(),
              league: "Liga Principal",
              bet_type: formData.bet_type,
              suggested_score:
                formData.bet_type === "inversa"
                  ? formData.suggested_score
                  : null,
            })
            .eq("id", existingMobileEvent.id);
        }
      } else {
        // Crear nuevos equipos
        const { data: team1Data, error: team1Error } = await supabaseAdmin
          .from("teams")
          .insert({
            name: formData.team1_name,
            logo_url: formData.team1_logo,
          })
          .select()
          .single();

        if (team1Error) throw team1Error;

        const { data: team2Data, error: team2Error } = await supabaseAdmin
          .from("teams")
          .insert({
            name: formData.team2_name,
            logo_url: formData.team2_logo,
          })
          .select()
          .single();

        if (team2Error) throw team2Error;

        // Crear nuevo evento en betting_events
        const { data: bettingEventData, error: bettingEventError } =
          await supabaseAdmin
            .from("betting_events")
            .insert({
              team1_id: team1Data.id,
              team2_id: team2Data.id,
              event_date: formData.event_date,
              event_time: formData.event_time,
              status: "upcoming",
              bet_type: formData.bet_type,
              suggested_score:
                formData.bet_type === "inversa"
                  ? formData.suggested_score
                  : null,
            })
            .select()
            .single();

        if (bettingEventError) throw bettingEventError;

        // 🔄 SINCRONIZACIÓN: Crear evento también en la tabla events para la app móvil
        const matchDateTime = new Date(
          `${formData.event_date}T${formData.event_time}`,
        );

        // Primero eliminar cualquier evento existente con los mismos equipos y fecha para evitar duplicados
        await supabaseAdmin
          .from("events")
          .delete()
          .eq("team_a_name", formData.team1_name)
          .eq("team_b_name", formData.team2_name)
          .gte("match_time", new Date(formData.event_date).toISOString())
          .lt(
            "match_time",
            new Date(
              new Date(formData.event_date).getTime() + 24 * 60 * 60 * 1000,
            ).toISOString(),
          );

        const { data: mobileEventData, error: mobileEventError } =
          await supabaseAdmin
            .from("events")
            .insert({
              title: `${formData.team1_name} vs ${formData.team2_name}`,
              description: `Partido entre ${formData.team1_name} y ${formData.team2_name}`,
              team_a_name: formData.team1_name,
              team_b_name: formData.team2_name,
              team_a_logo: formData.team1_logo,
              team_b_logo: formData.team2_logo,
              league: "Liga Principal",
              event_image: "https://ofd21.com/themes/ozo/img/event-detail.jpg",
              match_time: matchDateTime.toISOString(),
              status: "active",
              bet_type: formData.bet_type,
              suggested_score:
                formData.bet_type === "inversa"
                  ? formData.suggested_score
                  : null,
            })
            .select()
            .single();

        if (mobileEventError) {
          alert(
            `⚠️ Evento creado en dashboard pero no sincronizado con app móvil: ${mobileEventError.message}`,
          );
        } else {
          // Crear opciones de apuesta por defecto para el evento móvil
          const scores = [
            "0-0",
            "0-1",
            "0-2",
            "1-0",
            "1-1",
            "1-2",
            "2-0",
            "2-1",
            "2-2",
            "3-0",
            "3-1",
            "3-2",
          ];
          const bettingOptionsToInsert = scores.map((score) => ({
            event_id: mobileEventData.id,
            score: score,
            profit_percentage: Math.floor(Math.random() * 5) + 1, // 1% to 5%
            volume: (Math.random() * 900 + 100).toFixed(2) + "K",
            is_active: true,
          }));

          await supabaseAdmin
            .from("betting_options")
            .insert(bettingOptionsToInsert);
        }
      }

      const message = editingEvent
        ? "Evento actualizado exitosamente\n✅ Cambios sincronizados con la app móvil"
        : 'Evento creado exitosamente\n✅ Sincronizado con la app móvil\n📱 Ahora visible en sección "Inversiones"';
      alert(message);
      closeModal();
      loadEvents();
    } catch (error) {
      alert("Error guardando evento: " + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (event: BettingEvent) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este evento?")) return;

    try {
      setSaving(true);

      // 🗑️ SINCRONIZACIÓN: Eliminar evento de la app móvil usando nombres de equipos
      if (event.team1 && event.team2) {
        await supabaseAdmin
          .from("events")
          .delete()
          .eq("team_a_name", event.team1.name)
          .eq("team_b_name", event.team2.name)
          .eq(
            "match_time",
            new Date(`${event.event_date}T${event.event_time}`).toISOString(),
          );
      }

      // Eliminar evento principal de betting_events
      await supabaseAdmin.from("betting_events").delete().eq("id", event.id);

      alert("Evento eliminado exitosamente");
      loadEvents();
    } catch (error) {
      alert("Error eliminando evento: " + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const getEventStatus = (event: BettingEvent) => {
    const now = new Date();
    const eventDateTime = new Date(`${event.event_date}T${event.event_time}`);

    if (eventDateTime > now) {
      return {
        status: "upcoming",
        label: "Próximo",
        color: "bg-blue-100 text-blue-800",
      };
    } else if (eventDateTime <= now && event.status !== "finished") {
      return {
        status: "live",
        label: "En vivo",
        color: "bg-red-100 text-red-800",
      };
    } else {
      return {
        status: "finished",
        label: "Finalizado",
        color: "bg-gray-100 text-gray-800",
      };
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
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            🎯 Gestión de Apuestas
          </h1>
          <p className="text-gray-600">
            Administra eventos deportivos y partidos
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          ➕ Crear Evento
        </button>
      </div>

      {/* Selector de fecha */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm font-medium text-gray-700">
            📅 Seleccionar fecha:
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={showAllEvents}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showAll"
              checked={showAllEvents}
              onChange={(e) => setShowAllEvents(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="showAll" className="text-sm text-gray-700">
              📊 Mostrar todos los eventos con apuestas (últimos 30 días)
            </label>
          </div>
          <div className="text-sm text-gray-500">
            {events.length} evento(s){" "}
            {showAllEvents ? "encontrado(s)" : "programado(s)"}
            <span className="ml-2 text-green-600">
              📱 Sincronizado con App Móvil
            </span>
          </div>
        </div>
      </div>

      {/* Lista de eventos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.map((event) => {
          const statusInfo = getEventStatus(event);
          return (
            <div
              key={event.id}
              className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow"
            >
              {/* Header del evento */}
              <div
                className={`p-4 border-b bg-gradient-to-r ${event.bet_type === "inversa" ? "from-orange-50 to-red-50" : "from-blue-50 to-purple-50"}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex gap-1 flex-wrap">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
                    >
                      {statusInfo.label}
                    </span>
                    {event.bet_type === "inversa" && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-300">
                        🔄 Inversa
                      </span>
                    )}
                  </div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => openEditModal(event)}
                      className="text-blue-600 hover:text-blue-800 p-1"
                      title="Editar evento"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => cancelEvent(event)}
                      className="text-red-600 hover:text-red-800 p-1"
                      title="Cancelar evento y devolver dinero a usuarios"
                      disabled={cancellingEvent}
                    >
                      {cancellingEvent ? "⏳" : "❌"}
                    </button>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-800">
                    ⏰ {event.event_time}
                  </div>
                  <div className="text-sm text-gray-600">
                    {format(new Date(event.event_date), "dd/MM/yyyy", {
                      locale: es,
                    })}
                  </div>
                  {event.bet_type === "inversa" && event.suggested_score && (
                    <div className="mt-1 text-xs font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded inline-block">
                      🎯 Sugerido: {event.suggested_score}
                    </div>
                  )}
                </div>
              </div>

              {/* Equipos */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  {/* Equipo 1 */}
                  <div className="flex-1 text-center">
                    <div className="w-16 h-16 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                      {event.team1?.logo_url ? (
                        <img
                          src={event.team1.logo_url}
                          alt={event.team1.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl">🏆</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-gray-800 truncate">
                      {event.team1?.name || "Equipo 1"}
                    </div>
                  </div>

                  {/* VS */}
                  <div className="px-4">
                    <div className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-2 rounded-lg font-bold text-sm shadow-sm">
                      VS
                    </div>
                  </div>

                  {/* Equipo 2 */}
                  <div className="flex-1 text-center">
                    <div className="w-16 h-16 mx-auto mb-2 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                      {event.team2?.logo_url ? (
                        <img
                          src={event.team2.logo_url}
                          alt={event.team2.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl">🏆</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-gray-800 truncate">
                      {event.team2?.name || "Equipo 2"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="p-4 pt-0 space-y-2">
                <button
                  onClick={() => openBetsModal(event)}
                  className="w-full bg-gradient-to-r from-green-500 to-blue-500 text-white py-2 px-4 rounded-lg hover:from-green-600 hover:to-blue-600 transition-all duration-200 font-medium shadow-sm"
                >
                  📊 Cantidad de apuestas
                </button>
                {getEventStatus(event).status !== "finished" && (
                  <button
                    onClick={() => openWinnerModal(event)}
                    className={`w-full bg-gradient-to-r ${event.bet_type === "inversa" ? "from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600" : "from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"} text-white py-2 px-4 rounded-lg transition-all duration-200 font-medium shadow-sm`}
                    disabled={cancellingEvent}
                  >
                    {event.bet_type === "inversa"
                      ? "🔄 Finalizar (Inversa)"
                      : "🏆 Finalizar Evento"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {events.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🏟️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No hay eventos programados
          </h3>
          <p className="text-gray-500 mb-4">
            No hay eventos deportivos programados para esta fecha.
          </p>
          <button
            onClick={openCreateModal}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            ➕ Crear primer evento
          </button>
        </div>
      )}

      {/* Modal crear/editar evento */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">
                {editingEvent ? "✏️ Editar Evento" : "➕ Crear Nuevo Evento"}
              </h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* Tipo de apuesta */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gradient-to-r from-blue-50 to-purple-50">
                <h4 className="font-semibold text-gray-800 mb-3">
                  🎲 Tipo de Apuesta
                </h4>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        bet_type: "normal",
                        suggested_score: "",
                      })
                    }
                    className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                      formData.bet_type === "normal"
                        ? "border-blue-500 bg-blue-100 text-blue-800"
                        : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    🎯 Normal
                    <div className="text-xs mt-1 font-normal">
                      El que acierta el marcador gana
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, bet_type: "inversa" })
                    }
                    className={`flex-1 py-3 px-4 rounded-lg border-2 font-medium transition-all ${
                      formData.bet_type === "inversa"
                        ? "border-orange-500 bg-orange-100 text-orange-800"
                        : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    🔄 Inversa
                    <div className="text-xs mt-1 font-normal">
                      Pierde quien acierte el resultado real
                    </div>
                  </button>
                </div>

                {/* Marcador sugerido para apuesta inversa */}
                {formData.bet_type === "inversa" && (
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <label className="block text-sm font-medium text-orange-800 mb-2">
                      🎯 Marcador Sugerido (el que le dices a tus clientes):
                    </label>
                    <select
                      value={formData.suggested_score}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          suggested_score: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                    >
                      <option value="">Seleccionar marcador...</option>
                      {[
                        "0-0",
                        "0-1",
                        "0-2",
                        "1-0",
                        "1-1",
                        "1-2",
                        "2-0",
                        "2-1",
                        "2-2",
                        "3-0",
                        "3-1",
                        "3-2",
                      ].map((score) => (
                        <option key={score} value={score}>
                          {score}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-orange-600">
                      <p>
                        ⚠️ <strong>Lógica Inversa:</strong>
                      </p>
                      <p>
                        • Si el resultado real ≠ marcador sugerido → Pierde SOLO
                        quien apostó al resultado real
                      </p>
                      <p>
                        • Si el resultado real = marcador sugerido → TODOS ganan
                      </p>
                      <p>• El que pierde, pierde todo el dinero invertido</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Fecha y hora */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📅 Fecha del evento
                  </label>
                  <input
                    type="date"
                    value={formData.event_date}
                    onChange={(e) =>
                      setFormData({ ...formData, event_date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    ⏰ Hora de inicio
                  </label>
                  <input
                    type="time"
                    value={formData.event_time}
                    onChange={(e) =>
                      setFormData({ ...formData, event_time: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Equipo 1 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 mb-3">
                  🏆 Primer Equipo
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre del equipo
                    </label>
                    <input
                      type="text"
                      value={formData.team1_name}
                      onChange={(e) =>
                        setFormData({ ...formData, team1_name: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ej: Real Madrid"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      URL del logo
                    </label>
                    <input
                      type="url"
                      value={formData.team1_logo}
                      onChange={(e) =>
                        setFormData({ ...formData, team1_logo: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://ejemplo.com/logo.png"
                    />
                  </div>
                  {formData.team1_logo && (
                    <div className="flex justify-center">
                      <img
                        src={formData.team1_logo}
                        alt="Preview"
                        className="w-16 h-16 object-cover rounded-full border"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Equipo 2 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 mb-3">
                  🏆 Segundo Equipo
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre del equipo
                    </label>
                    <input
                      type="text"
                      value={formData.team2_name}
                      onChange={(e) =>
                        setFormData({ ...formData, team2_name: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ej: Barcelona"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      URL del logo
                    </label>
                    <input
                      type="url"
                      value={formData.team2_logo}
                      onChange={(e) =>
                        setFormData({ ...formData, team2_logo: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://ejemplo.com/logo.png"
                    />
                  </div>
                  {formData.team2_logo && (
                    <div className="flex justify-center">
                      <img
                        src={formData.team2_logo}
                        alt="Preview"
                        className="w-16 h-16 object-cover rounded-full border"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveEvent}
                disabled={
                  saving ||
                  !formData.team1_name ||
                  !formData.team2_name ||
                  (formData.bet_type === "inversa" && !formData.suggested_score)
                }
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
              >
                {saving
                  ? "Guardando..."
                  : editingEvent
                    ? "Actualizar Evento"
                    : "Crear Evento"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de apuestas */}
      {showBetsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">
                📊 Cantidad de Apuestas - {selectedEventBets?.eventName}
              </h3>
              <button
                onClick={closeBetsModal}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {loadingBets ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
              </div>
            ) : betsData.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🎯</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Sin apuestas registradas
                </h3>
                <p className="text-gray-500">
                  Este evento aún no tiene apuestas realizadas por los usuarios.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Resumen general */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border">
                  <h4 className="font-semibold text-gray-800 mb-3">
                    📈 Resumen General
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {betsData.reduce((sum, option) => {
                          const uniqueUsers = new Set(
                            option.bets.map(
                              (bet: any) =>
                                bet.users?.id || bet.users?.username,
                            ),
                          );
                          return sum + uniqueUsers.size;
                        }, 0)}
                      </div>
                      <div className="text-sm text-gray-600">
                        Total de Usuarios
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {betsData.length}
                      </div>
                      <div className="text-sm text-gray-600">
                        Total de Predicciones
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lista simplificada de predicciones */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {betsData.map((option) => {
                    const uniqueUsers = new Set(
                      option.bets.map(
                        (bet: any) => bet.users?.id || bet.users?.username,
                      ),
                    );
                    return (
                      <div
                        key={option.id}
                        className="bg-white border-2 border-gray-200 rounded-lg p-4 text-center hover:border-blue-300 transition-colors"
                      >
                        <div className="text-2xl font-bold text-blue-600 mb-2">
                          ⚽ {option.score}
                        </div>
                        <div className="text-3xl font-bold text-green-600 mb-1">
                          {uniqueUsers.size}
                        </div>
                        <div className="text-sm text-gray-600">
                          {uniqueUsers.size === 1 ? "usuario" : "usuarios"}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          +{option.profit_percentage}% ganancia
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal para seleccionar ganadores */}
      {showWinnerModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">
                {selectedEvent.bet_type === "inversa" ? "🔄" : "🏆"} Finalizar
                Evento - {selectedEvent.team1?.name} vs{" "}
                {selectedEvent.team2?.name}
              </h3>
              <button
                onClick={closeWinnerModal}
                className="text-gray-400 hover:text-gray-600"
                disabled={processingWinners}
              >
                ✕
              </button>
            </div>

            <div className="mb-6">
              {/* Info box - diferente para normal e inversa */}
              {selectedEvent.bet_type === "inversa" ? (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-orange-800 mb-2">
                    🔄 Apuesta INVERSA - Lógica:
                  </h4>
                  <div className="text-sm text-orange-700 space-y-1">
                    <li>
                      • <strong>Marcador sugerido a clientes:</strong>{" "}
                      <span className="text-lg font-bold">
                        {selectedEvent.suggested_score}
                      </span>
                    </li>
                    <li>
                      • Selecciona el <strong>resultado REAL</strong> del
                      partido abajo
                    </li>
                    <li>
                      • Si resultado real <strong>≠</strong> sugerido (
                      {selectedEvent.suggested_score}) →{" "}
                      <span className="text-red-600 font-semibold">
                        Pierde quien apostó al resultado real
                      </span>
                      , todos los demás ganan
                    </li>
                    <li>
                      • Si resultado real <strong>=</strong> sugerido (
                      {selectedEvent.suggested_score}) →{" "}
                      <span className="text-green-600 font-semibold">
                        ¡TODOS ganan!
                      </span>{" "}
                      Nadie pierde
                    </li>
                    <li>
                      • El que pierde, <strong>pierde todo</strong> el dinero
                      invertido
                    </li>
                    <li>• Esta acción NO se puede deshacer</li>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-yellow-800 mb-2">
                    ⚠️ Importante:
                  </h4>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>
                      • Al seleccionar el resultado ganador, se procesarán
                      automáticamente los pagos
                    </li>
                    <li>
                      • Los ganadores recibirán su apuesta + ganancia en sus
                      billeteras
                    </li>
                    <li>• Los perdedores no recibirán reembolso</li>
                    <li>• Esta acción NO se puede deshacer</li>
                  </ul>
                </div>
              )}

              <h4 className="font-semibold text-gray-800 mb-4">
                {selectedEvent.bet_type === "inversa"
                  ? "⚽ Selecciona el resultado REAL del partido:"
                  : "🎯 Selecciona el resultado final del partido:"}
              </h4>

              {loadingStats && (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-gray-600">
                    Cargando estadísticas de apuestas...
                  </p>
                </div>
              )}

              {!loadingStats && Object.keys(bettingStats).length > 0 && (
                <div
                  className={`mb-4 p-4 ${selectedEvent.bet_type === "inversa" ? "bg-orange-50 border-orange-200" : "bg-blue-50 border-blue-200"} border rounded-lg`}
                >
                  <h5
                    className={`font-semibold ${selectedEvent.bet_type === "inversa" ? "text-orange-800" : "text-blue-800"} mb-2`}
                  >
                    📊 Resumen de Apuestas:
                  </h5>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span
                        className={
                          selectedEvent.bet_type === "inversa"
                            ? "text-orange-600"
                            : "text-blue-600"
                        }
                      >
                        👥 Total de usuarios que apostaron:
                      </span>
                      <span className="font-bold ml-2">
                        {Object.values(bettingStats).reduce(
                          (sum, stats) => sum + stats.userCount,
                          0,
                        )}
                      </span>
                    </div>
                    <div>
                      <span
                        className={
                          selectedEvent.bet_type === "inversa"
                            ? "text-orange-600"
                            : "text-blue-600"
                        }
                      >
                        💰 Monto total apostado:
                      </span>
                      <span className="font-bold ml-2">
                        RD$
                        {Object.values(bettingStats)
                          .reduce((sum, stats) => sum + stats.totalAmount, 0)
                          .toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[
                  "0-0",
                  "0-1",
                  "0-2",
                  "1-0",
                  "1-1",
                  "1-2",
                  "2-0",
                  "2-1",
                  "2-2",
                  "3-0",
                  "3-1",
                  "3-2",
                ].map((score) => {
                  const stats = bettingStats[score];
                  if (!stats) return null;

                  const hasUsers = stats.userCount > 0;
                  const isInverse = selectedEvent.bet_type === "inversa";
                  const isSuggestedScore =
                    isInverse && score === selectedEvent.suggested_score;

                  // Para inversa: preview de qué pasaría si este es el resultado real
                  const inverseEveryoneWins =
                    isInverse && score === selectedEvent.suggested_score;
                  const inverseLosersCount =
                    isInverse && !inverseEveryoneWins ? stats.userCount : 0;
                  const inverseLosersAmount =
                    isInverse && !inverseEveryoneWins ? stats.totalAmount : 0;
                  const inverseWinnersCount = isInverse
                    ? inverseEveryoneWins
                      ? Object.values(bettingStats).reduce(
                          (sum, s) => sum + s.userCount,
                          0,
                        )
                      : Object.entries(bettingStats)
                          .filter(([s]) => s !== score)
                          .reduce((sum, [, s]) => sum + s.userCount, 0)
                    : 0;

                  return (
                    <div key={score} className="space-y-2">
                      <button
                        onClick={() => {
                          if (isInverse) {
                            const confirmMsg = inverseEveryoneWins
                              ? `⚽ Resultado real: ${score}\n🎯 Marcador sugerido: ${selectedEvent.suggested_score}\n\n✅ Resultado = Sugerido → ¡TODOS GANAN!\n\n👥 ${inverseWinnersCount} usuario(s) recibirán sus ganancias.\n\n¿Confirmar?`
                              : `⚽ Resultado real: ${score}\n🎯 Marcador sugerido: ${selectedEvent.suggested_score}\n\n❌ Resultado ≠ Sugerido\n\n😢 PIERDEN: ${inverseLosersCount} usuario(s) que apostaron ${score} (RD$${inverseLosersAmount.toLocaleString()})\n🏆 GANAN: ${inverseWinnersCount} usuario(s) que apostaron otro resultado\n\n¿Confirmar?`;
                            if (confirm(confirmMsg)) {
                              processWinners(score);
                            }
                          } else {
                            if (
                              confirm(
                                `¿Estás seguro de que el resultado final fue ${score}?\n\n${hasUsers ? `Esto afectará a ${stats.userCount} usuario${stats.userCount !== 1 ? "s" : ""} con RD$${stats.totalAmount.toLocaleString()} apostados.\n\n` : "No hay usuarios que hayan apostado a este resultado.\n\n"}Esta acción NO se puede deshacer.`,
                              )
                            ) {
                              processWinners(score);
                            }
                          }
                        }}
                        disabled={processingWinners}
                        className={`${
                          isInverse
                            ? isSuggestedScore
                              ? "bg-green-50 border-2 border-green-400 hover:border-green-600 hover:bg-green-100 ring-2 ring-green-200"
                              : hasUsers
                                ? "bg-red-50 border-2 border-red-300 hover:border-red-500 hover:bg-red-100"
                                : "bg-white border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                            : hasUsers
                              ? "bg-green-50 border-2 border-green-300 hover:border-green-500 hover:bg-green-100"
                              : "bg-white border-2 border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                        } rounded-lg p-4 text-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed w-full`}
                      >
                        {/* Badge para marcador sugerido */}
                        {isSuggestedScore && (
                          <div className="text-xs font-bold text-green-700 bg-green-200 rounded-full px-2 py-0.5 mb-1 inline-block">
                            🎯 SUGERIDO
                          </div>
                        )}
                        {isInverse && !isSuggestedScore && hasUsers && (
                          <div className="text-xs font-bold text-red-700 bg-red-200 rounded-full px-2 py-0.5 mb-1 inline-block">
                            ⚠️ PIERDEN
                          </div>
                        )}
                        <div className="text-2xl font-bold text-blue-600 mb-1">
                          ⚽ {score}
                        </div>
                        <div className="text-sm text-green-600 font-medium mb-2">
                          +{stats.profit}%
                        </div>
                        {!loadingStats && (
                          <div className="text-xs space-y-1">
                            <div
                              className={`flex items-center justify-center space-x-1 ${hasUsers ? "text-green-700 font-semibold" : "text-gray-500"}`}
                            >
                              <span>👥</span>
                              <span className="font-medium">
                                {stats.userCount}
                              </span>
                              <span>
                                usuario{stats.userCount !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <div
                              className={`flex items-center justify-center space-x-1 ${hasUsers ? "text-green-700 font-semibold" : "text-gray-500"}`}
                            >
                              <span>💰</span>
                              <span className="font-medium">
                                RD${stats.totalAmount.toLocaleString()}
                              </span>
                            </div>
                            {/* Preview para inversa */}
                            {isInverse && isSuggestedScore && (
                              <div className="mt-1 text-xs text-green-600 font-bold">
                                ✅ Si este es el resultado → ¡TODOS ganan!
                              </div>
                            )}
                            {isInverse && !isSuggestedScore && hasUsers && (
                              <div className="mt-1 text-xs text-red-600 font-bold">
                                ❌ Si este es el resultado → Estos{" "}
                                {stats.userCount} pierden RD$
                                {stats.totalAmount.toLocaleString()}
                              </div>
                            )}
                            {!isInverse && hasUsers && (
                              <div className="mt-1 text-xs text-green-600 font-medium">
                                💸 Total a pagar: RD$
                                {(
                                  (stats.totalAmount * (100 + stats.profit)) /
                                  100
                                ).toLocaleString()}
                              </div>
                            )}
                          </div>
                        )}
                      </button>

                      {/* Lista de usuarios que apostaron a esta predicción */}
                      {hasUsers && stats.users && stats.users.length > 0 && (
                        <div
                          className={`${isInverse && !isSuggestedScore ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"} border rounded-lg p-3 text-xs`}
                        >
                          <div className="font-semibold text-gray-700 mb-2 text-center">
                            👥 Usuarios que apostaron:
                          </div>
                          <div className="space-y-1 max-h-20 overflow-y-auto">
                            {stats.users.map((user: any, index: number) => (
                              <div
                                key={index}
                                className="flex justify-between items-center text-gray-600 bg-white rounded px-2 py-1"
                              >
                                <span className="font-medium text-gray-800">
                                  {user.name}
                                </span>
                                <span
                                  className={`font-semibold ${isInverse && !isSuggestedScore ? "text-red-600" : "text-green-600"}`}
                                >
                                  RD${user.amount.toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                          {stats.users.length > 3 && (
                            <div className="text-center text-gray-500 mt-1 text-xs">
                              {stats.users.length > 4
                                ? `+${stats.users.length - 3} usuarios más`
                                : ""}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {processingWinners && (
              <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center">
                <div className="bg-white rounded-lg p-6 text-center">
                  <div
                    className={`animate-spin rounded-full h-16 w-16 border-b-2 ${selectedEvent.bet_type === "inversa" ? "border-orange-600" : "border-green-600"} mx-auto mb-4`}
                  ></div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-2">
                    {selectedEvent.bet_type === "inversa"
                      ? "🔄 Procesando Apuesta Inversa..."
                      : "🏆 Procesando Ganadores..."}
                  </h4>
                  <p className="text-gray-600">
                    Calculando ganancias y actualizando billeteras.
                    <br />
                    Por favor espera, esto puede tomar unos segundos.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={closeWinnerModal}
                disabled={processingWinners}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
