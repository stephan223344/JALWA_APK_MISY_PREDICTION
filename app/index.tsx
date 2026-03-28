import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, PanResponder, Dimensions, StatusBar, BackHandler
} from "react-native";
import { WebView } from "react-native-webview";

const { width: W, height: H } = Dimensions.get("window");
const FAB_SIZE = 65;

const INITIAL_URL = "https://www.jgame7.com/#/register?invitationCode=17341651055";
const PREDICTION_URL = "https://wingo-prediction-ck.onrender.com/";

const AUTH_PATTERNS = ["/register", "/login", "/sign"];
const LOGGED_IN_PATTERNS = [
  "/home", "/dashboard", "/game", "/lobby",
  "/main", "/wallet", "/profile", "/activity",
];

function isUserLoggedIn(url: string): boolean {
  const lower = url.toLowerCase();
  if (AUTH_PATTERNS.some((p) => lower.includes(p))) return false;
  if (LOGGED_IN_PATTERNS.some((p) => lower.includes(p))) return true;
  if (!lower.includes("jgame7.com/#/register") && lower.includes("jgame7.com")) return true;
  return false;
}

export default function Index() {

  // ✅ FIX HOOK (IMPORTANT)
  const webViewRef = useRef<WebView>(null);
  const canGoBack = useRef(false);

  const [activeView, setActiveView] = useState<"game" | "prediction">("game");
  const [isLoading, setIsLoading] = useState(true);
  const [fabVisible, setFabVisible] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [msgVisible, setMsgVisible] = useState(false);
  const [hasDeposited, setHasDeposited] = useState(false);
  const [msgText, setMsgText] = useState("");

  const loaderOpacity = useRef(new Animated.Value(1)).current;
  const msgOpacity = useRef(new Animated.Value(0)).current;
  const fabScale = useRef(new Animated.Value(0)).current;
  const fabPosition = useRef(
    new Animated.ValueXY({ x: W - FAB_SIZE - 20, y: H - FAB_SIZE - 80 })
  ).current;

  const dragDistance = useRef(0);
  const DRAG_THRESHOLD = 8;

  // FAB animation
  useEffect(() => {
    const t = setTimeout(() => {
      setFabVisible(true);
      Animated.spring(fabScale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // ✅ BACK BUTTON FIX
  useEffect(() => {
    const backAction = () => {

      if (activeView === "prediction") {
        setActiveView("game");
        return true;
      }

      if (canGoBack.current && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }

      return false;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [activeView]);

  // ✅ JS sécurisé
  const injectedJS = `
    (function() {
      function detect() {
        const text = document.body?.innerText?.toLowerCase() || "";

        if (
          text.includes("wallet") ||
          text.includes("deposit") ||
          text.includes("withdraw")
        ) {
          window.ReactNativeWebView.postMessage("LOGGED_IN");
        }

        const hasMoney =
          text.includes("balance") &&
          !text.includes("0.00") &&
          !text.includes("0,00");

        if (hasMoney) {
          window.ReactNativeWebView.postMessage("HAS_DEPOSIT");
        }
      }

      setInterval(detect, 2000);
    })();
  `;

  const handleLoad = () => {
    Animated.timing(loaderOpacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => setIsLoading(false));
  };

  const showMessage = (text: string) => {
    setMsgText(text);
    setMsgVisible(true);

    Animated.sequence([
      Animated.timing(msgOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(msgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setMsgVisible(false));
  };

  const handleFabPress = () => {

    if (!isLoggedIn) {
      showMessage("Login first");
      return;
    }

    if (!hasDeposited) {
      showMessage("Deposit required");
      return;
    }

    setActiveView((prev) => (prev === "game" ? "prediction" : "game"));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* GAME */}
      <View style={{ flex: 1, display: activeView === "game" ? "flex" : "none" }}>
        <WebView
          ref={webViewRef}
          source={{ uri: INITIAL_URL }}
          onLoad={handleLoad}
          injectedJavaScript={injectedJS}
          onNavigationStateChange={(navState) => {
            canGoBack.current = navState.canGoBack;
            if (isUserLoggedIn(navState.url)) setIsLoggedIn(true);
          }}
          onMessage={(event) => {
            const msg = event.nativeEvent.data;
            if (msg === "LOGGED_IN") setIsLoggedIn(true);
            if (msg === "HAS_DEPOSIT") setHasDeposited(true);
          }}
        />
      </View>

      {/* PREDICTION */}
      <View style={{ flex: 1, display: activeView === "prediction" ? "flex" : "none" }}>
        <WebView source={{ uri: PREDICTION_URL }} />
      </View>

      {/* LOADER */}
      {isLoading && (
        <Animated.View style={[styles.loader, { opacity: loaderOpacity }]}>
          <Text style={{ color: "#fff" }}>Loading...</Text>
        </Animated.View>
      )}

      {/* FAB */}
      {fabVisible && (
        <Animated.View style={[styles.fab, { transform: [{ scale: fabScale }] }]}>
          <TouchableOpacity onPress={handleFabPress}>
            <Text style={{ color: "#fff" }}>
              {!isLoggedIn ? "LOGIN" : !hasDeposited ? "DEPOSIT" : "GO"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* MESSAGE */}
      {msgVisible && (
        <Animated.View style={[styles.message, { opacity: msgOpacity }]}>
          <Text style={{ color: "#fff" }}>{msgText}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  loader: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
  },

  fab: {
    position: "absolute",
    bottom: 80,
    right: 20,
    backgroundColor: "#e02020",
    padding: 15,
    borderRadius: 30,
  },

  message: {
    position: "absolute",
    bottom: 150,
    alignSelf: "center",
    backgroundColor: "#333",
    padding: 10,
    borderRadius: 10,
  },
});