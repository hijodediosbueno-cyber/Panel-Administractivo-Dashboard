import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import WalletService from "../services/WalletService";
import { BANK_LOGOS } from "../constants/bankAssets";
import {
  scaleFont,
  getHorizontalPadding,
  getSpacing,
  getBorderRadius,
  getSafeBottomPadding,
} from "../utils/responsive";

const BankTransferScreen = ({ navigation }) => {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedBank, setSelectedBank] = useState(null);
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [rechargeAmounts, setRechargeAmounts] = useState([]);

  const BANKS = [
    {
      id: 1,
      name: "Banco Banreservas",
      code: "BRS",
      logo: BANK_LOGOS.BANRESERVAS,
      color: "#ef4444",
      available: true,
      accountNumber: "4229702175",
      accountHolder: "Marino",
    },
    {
      id: 2,
      name: "Banco Popular Dominicano",
      code: "BPD",
      logo: BANK_LOGOS.POPULAR,
      color: "#3b82f6",
      available: false,
    },
    {
      id: 3,
      name: "Banco BHD",
      code: "BHD",
      logo: BANK_LOGOS.BHD,
      color: "#f59e0b",
      available: false,
    },
  ];

  const MIN_AMOUNT = 1000;

  useEffect(() => {
    loadRechargeData();
  }, []);

  const loadRechargeData = async () => {
    try {
      const { data: amounts } = await WalletService.getRechargeAmounts();
      if (amounts) {
        setRechargeAmounts(amounts);
      }

      const { data: methods } =
        await WalletService.getPaymentMethods("bank_transfer");
      if (methods) {
        setPaymentMethods(methods);
      }
    } catch (error) {
      console.error("Error loading recharge data:", error);
    }
  };

  const handleSubmitRecharge = async () => {
    const amount = selectedAmount || parseFloat(customAmount);

    if (!amount || amount < MIN_AMOUNT) {
      Alert.alert(
        "Error",
        `El monto mínimo de recarga es RD$ ${MIN_AMOUNT.toLocaleString()}`,
      );
      return;
    }

    if (!selectedBank) {
      Alert.alert("Error", "Por favor selecciona un banco");
      return;
    }

    setLoading(true);

    try {
      // Buscar el método de pago que coincida con el banco seleccionado
      const paymentMethod = paymentMethods.find(
        (m) => m.account_info?.bank_name === selectedBank.name,
      );

      // Usar WalletService para la inserción consistente
      const result = await WalletService.requestDeposit(
        user.id,
        amount,
        paymentMethod?.id || null,
        `BANK_${selectedBank.code}_${Date.now()}`,
        "bank_transfer", // Especificar tipo de método de pago
      );

      if (result.error) {
        console.error("❌ Error desde WalletService:", result.error);
        throw new Error(result.error);
      }

      const data = result.data;

      // Navegar a la pantalla de instrucciones de pago
      navigation.navigate("PaymentInstructions", {
        amount: amount,
        bank: selectedBank,
        paymentMethod: paymentMethod || {
          account_info: {
            bank_name: selectedBank.name,
            account_number: selectedBank.accountNumber || "Contactar soporte",
            account_holder: selectedBank.accountHolder || "CDE Inversiones",
          },
        },
        depositId: data.id,
      });
    } catch (error) {
      console.error("Error submitting recharge:", error);
      Alert.alert(
        "Error",
        `No se pudo procesar la solicitud: ${error.message || "Error desconocido"}. Intenta de nuevo.`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <LinearGradient
        colors={["#1a365d", "#2d5a87", "#3182ce"]}
        style={[styles.header, { paddingTop: insets.top + 15 }]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🏦 Transferencia Bancaria</Text>
        <Text style={styles.headerSubtitle}>Selecciona tu banco y monto</Text>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 100}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {!selectedBank ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Selecciona tu Banco</Text>
              {BANKS.map((bank) => (
                <TouchableOpacity
                  key={bank.id}
                  style={[
                    styles.bankCard,
                    !bank.available && styles.bankCardDisabled,
                  ]}
                  onPress={() => {
                    if (!bank.available) {
                      Alert.alert(
                        "Próximamente",
                        `${bank.name} estará disponible pronto.`,
                      );
                      return;
                    }
                    setSelectedBank(bank);
                  }}
                >
                  <LinearGradient
                    colors={[bank.color, bank.color + "dd"]}
                    style={styles.bankGradient}
                  >
                    <Image
                      source={bank.logo}
                      style={[
                        styles.bankLogo,
                        !bank.available && { opacity: 0.5 },
                      ]}
                      resizeMode="contain"
                    />
                    <View style={styles.bankInfo}>
                      <Text style={styles.bankName}>{bank.name}</Text>
                      <Text style={styles.bankSubtext}>
                        {bank.available
                          ? "Transferencia inmediata"
                          : "Próximamente"}
                      </Text>
                    </View>
                    {bank.available ? (
                      <Ionicons
                        name="chevron-forward"
                        size={24}
                        color="#ffffff"
                      />
                    ) : (
                      <Ionicons
                        name="time-outline"
                        size={24}
                        color="rgba(255,255,255,0.6)"
                      />
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <>
              <View style={styles.selectedBankContainer}>
                <TouchableOpacity
                  style={styles.changeBankButton}
                  onPress={() => {
                    setSelectedBank(null);
                    setSelectedAmount(null);
                    setCustomAmount("");
                  }}
                >
                  <Ionicons name="chevron-back" size={20} color="#3182ce" />
                  <Text style={styles.changeBankText}>Cambiar banco</Text>
                </TouchableOpacity>
                <View style={styles.selectedBankCard}>
                  <Image
                    source={selectedBank.logo}
                    style={styles.selectedBankLogo}
                    resizeMode="contain"
                  />
                  <Text style={styles.selectedBankName}>
                    {selectedBank.name}
                  </Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Monto a Recargar</Text>

                <Text style={styles.minAmountText}>
                  Monto mínimo: RD$ {MIN_AMOUNT.toLocaleString()}
                </Text>

                <View style={styles.amountsGrid}>
                  {rechargeAmounts.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.amountButton,
                        selectedAmount === item.amount &&
                          styles.amountButtonSelected,
                      ]}
                      onPress={() => {
                        setSelectedAmount(item.amount);
                        setCustomAmount("");
                      }}
                    >
                      <Text
                        style={[
                          styles.amountText,
                          selectedAmount === item.amount &&
                            styles.amountTextSelected,
                        ]}
                      >
                        RD$ {item.amount.toLocaleString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.orText}>
                  o ingresa un monto personalizado
                </Text>

                <View style={styles.customAmountContainer}>
                  <Text style={styles.currencySymbol}>RD$</Text>
                  <TextInput
                    style={styles.customAmountInput}
                    placeholder="Ingresa monto"
                    keyboardType="numeric"
                    value={customAmount}
                    onChangeText={(text) => {
                      setCustomAmount(text);
                      setSelectedAmount(null);
                    }}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  loading && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmitRecharge}
                disabled={loading}
              >
                <LinearGradient
                  colors={
                    loading ? ["#a0aec0", "#718096"] : ["#3b82f6", "#2563eb"]
                  }
                  style={styles.submitGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#ffffff"
                      />
                      <Text style={styles.submitText}>Solicitar Recarga</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#3182ce" />
            <Text style={styles.infoText}>
              Recibirás las instrucciones de pago después de confirmar tu
              solicitud.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    paddingBottom: 30,
    paddingHorizontal: getHorizontalPadding(),
  },
  backButton: {
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: scaleFont(28),
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: scaleFont(14),
    color: "#e2e8f0",
  },
  content: {
    flex: 1,
    padding: getHorizontalPadding(),
  },
  section: {
    marginBottom: getSpacing(2),
  },
  sectionTitle: {
    fontSize: scaleFont(18),
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: getSpacing(1.5),
  },
  bankCard: {
    marginBottom: getSpacing(1.5),
    borderRadius: getBorderRadius(16),
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  bankCardDisabled: {
    opacity: 0.65,
  },
  bankGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: getSpacing(2),
  },
  bankLogo: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    marginRight: getSpacing(1.5),
  },
  bankInfo: {
    flex: 1,
  },
  bankName: {
    fontSize: scaleFont(16),
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 2,
  },
  bankSubtext: {
    fontSize: scaleFont(12),
    color: "rgba(255,255,255,0.9)",
  },
  selectedBankContainer: {
    marginBottom: getSpacing(2),
  },
  changeBankButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: getSpacing(),
  },
  changeBankText: {
    fontSize: scaleFont(14),
    color: "#3182ce",
    fontWeight: "500",
    marginLeft: 4,
  },
  selectedBankCard: {
    backgroundColor: "#ffffff",
    padding: getSpacing(2),
    borderRadius: getBorderRadius(12),
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#3182ce",
  },
  selectedBankLogo: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: getSpacing(),
  },
  selectedBankName: {
    fontSize: scaleFont(18),
    fontWeight: "600",
    color: "#1e293b",
    marginLeft: getSpacing(),
  },
  minAmountText: {
    fontSize: scaleFont(13),
    color: "#64748b",
    marginBottom: getSpacing(),
  },
  amountsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: getSpacing(0.75),
    marginBottom: getSpacing(),
  },
  amountButton: {
    width: "48%",
    padding: getSpacing(1.25),
    backgroundColor: "#ffffff",
    borderRadius: getBorderRadius(10),
    borderWidth: 2,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  amountButtonSelected: {
    borderColor: "#3b82f6",
    backgroundColor: "#eff6ff",
  },
  amountText: {
    fontSize: scaleFont(16),
    fontWeight: "600",
    color: "#64748b",
  },
  amountTextSelected: {
    color: "#3b82f6",
  },
  orText: {
    textAlign: "center",
    fontSize: scaleFont(13),
    color: "#94a3b8",
    marginVertical: getSpacing(),
  },
  customAmountContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: getBorderRadius(12),
    borderWidth: 2,
    borderColor: "#e2e8f0",
    paddingHorizontal: getSpacing(1.5),
  },
  currencySymbol: {
    fontSize: scaleFont(18),
    fontWeight: "600",
    color: "#64748b",
    marginRight: getSpacing(0.5),
  },
  customAmountInput: {
    flex: 1,
    fontSize: scaleFont(18),
    fontWeight: "600",
    color: "#1e293b",
    paddingVertical: getSpacing(1.25),
  },
  submitButton: {
    borderRadius: getBorderRadius(12),
    marginVertical: getSpacing(2),
    overflow: "hidden",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: getSpacing(1.5),
    gap: getSpacing(0.5),
  },
  submitText: {
    fontSize: scaleFont(18),
    fontWeight: "bold",
    color: "#ffffff",
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#eff6ff",
    padding: getSpacing(1.25),
    borderRadius: getBorderRadius(10),
    borderLeftWidth: 4,
    borderLeftColor: "#3182ce",
    marginBottom: getSpacing(3),
  },
  infoText: {
    flex: 1,
    fontSize: scaleFont(13),
    color: "#1e40af",
    marginLeft: getSpacing(0.75),
    lineHeight: 20,
  },
});

export default BankTransferScreen;
