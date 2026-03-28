import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, PanResponder, Dimensions, StatusBar, BackHandler
} from "react-native";
import { WebView } from "react-native-webview";
import * as NavigationBar from "expo-navigation-bar";

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

  // ✅ FIX CRASH (hooks dans composant)
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

  // ✅ NAV BAR COLOR
  useEffect(() => {
    NavigationBar.setBackgroundColorAsync("#000");
  }, []);

  // FAB appear
  useEffect(() => {
    const t = setTimeout(() => {
      setFabVisible(true);
      Animated.spring(fabScale, {
        toValue: 1, tension: 80, friction: 6, useNativeDriver: true,
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

  // ✅ SAFE injected JS
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
      toValue: 0, duration: 400, useNativeDriver: true,
    }).start(() => setIsLoading(false));
  };

  const handleNavigationChange = (navState: any) => {
    canGoBack.current = navState.canGoBack;
    if (isUserLoggedIn(navState.url)) setIsLoggedIn(true);
  };

  const showMessage = (text: string) => {
    setMsgText(text);
    setMsgVisible(true);
    Animated.sequence([
      Animated.timing(msgOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(msgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setMsgVisible(false));
  };

  const shakeFab = () => {
    Animated.sequence([
      Animated.timing(fabScale, { toValue: 1.2, duration: 70, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 0.85, duration: 70, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 1.1, duration: 70, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 1, duration: 70, useNativeDriver: true }),
    ]).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD,

      onPanResponderGrant: () => {
        dragDistance.current = 0;
        fabPosition.setOffset({
          x: (fabPosition.x as any)._value,
          y: (fabPosition.y as any)._value,
        });
        fabPosition.setValue({ x: 0, y: 0 });
      },

      onPanResponderMove: (_, g) => {
        dragDistance.current = Math.sqrt(g.dx * g.dx + g.dy * g.dy);
        fabPosition.setValue({ x: g.dx, y: g.dy });
      },

      onPanResponderRelease: () => {
        fabPosition.flattenOffset();
      },
    })
  ).current;

  const handleFabPress = () => {
    if (dragDistance.current > DRAG_THRESHOLD) return;

    if (!isLoggedIn) {
      showMessage("🔒 Please Login !");
      shakeFab();
      return;
    }

    if (!hasDeposited) {
      showMessage("💰 Please Deposit !");
      shakeFab();
      return;
    }

    setActiveView((prev) => (prev === "game" ? "prediction" : "game"));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* GAME */}
      <View style={[styles.webviewWrapper, { zIndex: activeView === "game" ? 2 : 1 }]}>
        <WebView
          ref={webViewRef} // ✅ IMPORTANT
          source={{ uri: INITIAL_URL }}
          style={styles.webview}
          onLoad={handleLoad}
          onNavigationStateChange={handleNavigationChange}
          injectedJavaScript={injectedJS}
          onMessage={(event) => {
            const msg = event.nativeEvent.data;
            if (msg === "LOGGED_IN") setIsLoggedIn(true);
            if (msg === "HAS_DEPOSIT") setHasDeposited(true);
          }}
        />
      </View>

      {/* PREDICTION */}
      <View style={[styles.webviewWrapper, { zIndex: activeView === "prediction" ? 2 : 1 }]}>
        <WebView
          source={{ uri: PREDICTION_URL }}
          style={styles.webview}
        />
      </View>

      {/* LOADER */}
      {isLoading && (
        <Animated.View style={[styles.loader, { opacity: loaderOpacity }]}>
          <Spinner />
          <Text style={styles.loaderText}>Connexion...</Text>
        </Animated.View>
      )}

      {/* FAB */}
      {fabVisible && (
        <Animated.View
          style={[
            styles.fab,
            { transform: [...fabPosition.getTranslateTransform(), { scale: fabScale }] },
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity style={styles.fabTouch} onPress={handleFabPress}>
            <View style={[styles.fabInner, isLoggedIn && styles.fabInnerActive]}>
              <Text style={styles.fabEmoji}>
                {!isLoggedIn ? "🔒" : !hasDeposited ? "💰" : activeView === "game" ? "🎯" : "🎮"}
              </Text>
              <Text style={[styles.fabLabel, isLoggedIn && styles.fabLabelActive]}>
                {!isLoggedIn ? "LOGIN" : !hasDeposited ? "DEPOSIT" : activeView === "prediction" ? "GAME" : "WIN"}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* MESSAGE */}
      {msgVisible && (
        <Animated.View style={[styles.message, { opacity: msgOpacity }]}>
          <Text style={styles.messageText}>{msgText}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// SPINNER
function Spinner() {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 1000, useNativeDriver: true })
    ).start();
  }, []);
  const spin = rot.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  return <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />;
}

// STYLES (inchangé)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  webviewWrapper: { ...StyleSheet.absoluteFillObject },
  webview: { flex: 1 },
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  loaderText: { color: "#fff", marginTop: 16 },
  spinner: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 4, borderColor: "#444", borderTopColor: "#e02020",
  },
  fab: {
    position: "absolute",
    width: FAB_SIZE, height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    zIndex: 9999,
  },
  fabTouch: { width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2 },
  fabInner: {
    width: FAB_SIZE, height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2.5,
    borderColor: "#e02020",
  },
  fabInnerActive: {
    backgroundColor: "#0d1f0d",
    borderColor: "#00c853",
  },
  fabEmoji: { fontSize: 20 },
  fabLabel: { color: "#e02020", fontSize: 9, fontWeight: "900" },
  fabLabelActive: { color: "#00c853" },
  message: {
    position: "absolute",
    bottom: 110,
    alignSelf: "center",
    backgroundColor: "#1a1a1a",
    padding: 12,
    borderRadius: 10,
  },
  messageText: { color: "#fff" },
});