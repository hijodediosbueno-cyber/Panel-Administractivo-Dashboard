import React, { createContext, useContext, useEffect, useState } from "react";
import AuthService from "../services/AuthService";

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe ser usado dentro de AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Timeout de seguridad para asegurar que loading se ponga en false
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        setLoading(false);
      }
    }, 5000); // 5 segundos máximo

    const initAuth = async () => {
      try {
        // Obtener sesión inicial con timeout
        const session = await AuthService.getCurrentSession();

        if (mounted) {
          setSession(session);
          setUser(session?.user || null);

          if (session?.user) {
            // Siempre consultar la BD para obtener el perfil real del usuario
            try {
              const { data: dbProfile } = await AuthService.getUserProfile(
                session.user.id,
              );
              setUserProfile(
                dbProfile || {
                  username: session.user.user_metadata?.username || "Usuario",
                  display_name:
                    session.user.user_metadata?.display_name || "Usuario",
                  full_name:
                    session.user.user_metadata?.display_name || "Usuario",
                },
              );
            } catch {
              setUserProfile({
                username: session.user.user_metadata?.username || "Usuario",
                display_name:
                  session.user.user_metadata?.display_name || "Usuario",
              });
            }
          } else {
            setUserProfile(null);
          }

          clearTimeout(safetyTimeout);
          setLoading(false);
        }
      } catch (error) {
        console.error("❌ Error obteniendo sesión inicial:", error);
        console.error("Tipo de error:", error.name);
        console.error("Mensaje:", error.message);

        if (mounted) {
          clearTimeout(safetyTimeout);
          setLoading(false);
        }
      }
    };

    // Ejecutar inicialización
    initAuth();

    // Escuchar cambios de autenticación
    const {
      data: { subscription },
    } = AuthService.onAuthStateChange(async (event, session) => {
      if (mounted) {
        setSession(session);
        setUser(session?.user || null);

        // Obtener perfil completo desde la base de datos
        if (session?.user) {
          try {
            const { data: dbUserProfile } = await AuthService.getUserProfile(
              session.user.id,
            );
            setUserProfile(
              dbUserProfile || {
                username: session.user.user_metadata?.username || "Usuario",
                display_name:
                  session.user.user_metadata?.display_name || "Usuario",
                full_name:
                  session.user.user_metadata?.display_name || "Usuario",
              },
            );
          } catch (error) {
            console.error("Error obteniendo perfil de BD:", error);
            setUserProfile({
              username: session.user.user_metadata?.username || "Usuario",
              display_name:
                session.user.user_metadata?.display_name || "Usuario",
              full_name: session.user.user_metadata?.display_name || "Usuario",
            });
          }
        } else {
          setUserProfile(null);
        }
        // No poner loading false aquí para evitar conflictos
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (username, password) => {
    // NO usar setLoading(true) aquí — AppNavigator desmonta LoginScreen
    // al ver loading=true, y si hay error el usuario nunca lo ve.
    // LoginScreen maneja su propio estado de carga.
    try {
      const result = await AuthService.signIn(username, password);
      if (!result.error && result.data?.user) {
        setUser(result.data.user);
        setSession(result.data.session);
        try {
          const { data: profile } = await AuthService.getUserProfile(
            result.data.user.id,
          );
          setUserProfile(
            profile || {
              username: result.data.user.user_metadata?.username || "Usuario",
              display_name:
                result.data.user.user_metadata?.display_name || "Usuario",
              full_name:
                result.data.user.user_metadata?.display_name || "Usuario",
            },
          );
        } catch {}
      }
      return result;
    } catch (err) {
      return { data: null, error: err.message || "Error durante el login" };
    }
  };

  const signUp = async (username, password, userData) => {
    // NO usar setLoading(true) aquí — misma razón que signIn.
    try {
      const result = await AuthService.signUp(username, password, userData);
      if (!result.error && result.data?.user) {
        setUser(result.data.user);
        setSession(result.data.session);
        try {
          const { data: profile } = await AuthService.getUserProfile(
            result.data.user.id,
          );
          setUserProfile(
            profile || {
              username: result.data.user.user_metadata?.username || "Usuario",
              display_name:
                result.data.user.user_metadata?.display_name || "Usuario",
              full_name:
                result.data.user.user_metadata?.display_name || "Usuario",
            },
          );
        } catch {}
      }
      return result;
    } catch (err) {
      return { data: null, error: err.message || "Error durante el registro" };
    }
  };

  const signOut = async () => {
    try {
      const result = await AuthService.signOut();
      setUser(null);
      setUserProfile(null);
      setSession(null);
      return result;
    } catch (err) {
      // Forzar limpieza local aunque falle el servidor
      setUser(null);
      setUserProfile(null);
      setSession(null);
      return { error: err.message };
    }
  };

  const updateProfile = async (updates) => {
    try {
      const result = await AuthService.updateProfile(updates);
      if (result.data && !result.error) {
        // Actualizar perfil local usando auth_id
        const { data: updatedProfile } = await AuthService.getUserProfile(
          user.id,
        );
        setUserProfile(updatedProfile);
      }
      return result;
    } catch (error) {
      console.error("Error actualizando perfil:", error);
      return { data: null, error: error.message };
    }
  };

  const resetPassword = async (username) => {
    return await AuthService.resetPassword(username);
  };

  const value = {
    user,
    userProfile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    updateProfile,
    resetPassword,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
