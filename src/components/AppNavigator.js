import React from "react";
import { View, ActivityIndicator, Easing } from "react-native";
import {
  createStackNavigator,
  CardStyleInterpolators,
  TransitionSpecs,
} from "@react-navigation/stack";
import { useAuth } from "../contexts/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import MainNavigator from "./MainNavigator";
import RechargeMethodScreen from "../screens/RechargeMethodScreen";
import BankTransferScreen from "../screens/BankTransferScreen";
import USDTTransferScreen from "../screens/USDTTransferScreen";
import PaymentInstructionsScreen from "../screens/PaymentInstructionsScreen";
import USDTPaymentInstructionsScreen from "../screens/USDTPaymentInstructionsScreen";
import WithdrawalScreen from "../screens/WithdrawalScreen";
import AgentCenterScreen from "../screens/AgentCenterScreen";
import HelpCenterScreen from "../screens/HelpCenterScreen";
import AboutScreen from "../screens/AboutScreen";
import PartnerScreen from "../screens/PartnerScreen";

const Stack = createStackNavigator();

// ─── Transición modal (slide desde abajo) ──────────────────────────────
const modalTransition = {
  gestureDirection: "vertical",
  transitionSpec: {
    open: {
      animation: "spring",
      config: {
        stiffness: 300,
        damping: 30,
        mass: 0.8,
        overshootClamping: false,
        restDisplacementThreshold: 0.01,
        restSpeedThreshold: 0.01,
      },
    },
    close: {
      animation: "timing",
      config: { duration: 250, easing: Easing.out(Easing.ease) },
    },
  },
  cardStyleInterpolator: CardStyleInterpolators.forModalPresentationIOS,
};

// ─── Transición fade suave (pantallas principales) ─────────────────────
const fadeTransition = {
  transitionSpec: {
    open: {
      animation: "timing",
      config: { duration: 300, easing: Easing.out(Easing.poly(4)) },
    },
    close: {
      animation: "timing",
      config: { duration: 200, easing: Easing.in(Easing.ease) },
    },
  },
  cardStyleInterpolator: ({ current }) => ({
    cardStyle: { opacity: current.progress, backgroundColor: "#f8fafc" },
  }),
};

const AppNavigator = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        ...fadeTransition,
        cardStyle: { backgroundColor: "#f8fafc" },
      }}
    >
      <Stack.Screen name="Main" component={MainNavigator} />
      <Stack.Screen
        name="RechargeMethod"
        component={RechargeMethodScreen}
        options={modalTransition}
      />
      <Stack.Screen
        name="BankTransfer"
        component={BankTransferScreen}
        options={modalTransition}
      />
      <Stack.Screen
        name="USDTTransfer"
        component={USDTTransferScreen}
        options={modalTransition}
      />
      <Stack.Screen
        name="PaymentInstructions"
        component={PaymentInstructionsScreen}
        options={modalTransition}
      />
      <Stack.Screen
        name="USDTPaymentInstructions"
        component={USDTPaymentInstructionsScreen}
        options={modalTransition}
      />
      <Stack.Screen
        name="Withdrawal"
        component={WithdrawalScreen}
        options={modalTransition}
      />
      <Stack.Screen
        name="AgentCenter"
        component={AgentCenterScreen}
        options={modalTransition}
      />
      <Stack.Screen
        name="HelpCenter"
        component={HelpCenterScreen}
        options={modalTransition}
      />
      <Stack.Screen
        name="About"
        component={AboutScreen}
        options={modalTransition}
      />
      <Stack.Screen
        name="Partner"
        component={PartnerScreen}
        options={modalTransition}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
