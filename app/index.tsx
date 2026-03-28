import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, PanResponder, Dimensions, StatusBar,
} from "react-native";
import { WebView } from "react-native-webview";
import { BackHandler } from "react-native";

const webViewRef = useRef<WebView>(null);
const canGoBack = useRef(false);

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
  const [activeView, setActiveView] = useState<"game" | "prediction">("game");
  const [isLoading, setIsLoading] = useState(true);
  const [fabVisible, setFabVisible] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [msgVisible, setMsgVisible] = useState(false);
  const [hasDeposited, setHasDeposited] = useState(false);

  const [msgText, setMsgText] = useState("");

  const loaderOpacity = useRef(new Animated.Value(1)).current;
  const msgOpacity    = useRef(new Animated.Value(0)).current;
  const fabScale      = useRef(new Animated.Value(0)).current;
  const fabPosition   = useRef(
    new Animated.ValueXY({ x: W - FAB_SIZE - 20, y: H - FAB_SIZE - 80 })
  ).current;

  // ✅ Seuil de distance pour distinguer drag vs clic
  const dragDistance = useRef(0);
  const DRAG_THRESHOLD = 8; // pixels

  // ─── FAB apparaît après 5s ────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setFabVisible(true);
      Animated.spring(fabScale, {
        toValue: 1, tension: 80, friction: 6, useNativeDriver: true,
      }).start();
    }, 5000);
    return () => clearTimeout(t);
  }, []);

  //Back track
  useEffect(() => {
  const backAction = () => {

    // 1️⃣ Si on est sur prediction → revenir au game
    if (activeView === "prediction") {
      setActiveView("game");
      return true;
    }

    // 2️⃣ Si WebView peut revenir
    if (canGoBack.current && webViewRef.current) {
      webViewRef.current.goBack();
      return true;
    }

    // 3️⃣ Sinon → quitter app
    return false;
  };

  const backHandler = BackHandler.addEventListener(
    "hardwareBackPress",
    backAction
  );

  return () => backHandler.remove();
}, [activeView]);

  //détection dépôt webview
const injectedJS = `
(function() {

  function detect() {
    const text = document.body.innerText.toLowerCase();

    // ✅ détecter login
    if (
      text.includes("wallet") ||
      text.includes("deposit") ||
      text.includes("withdraw")
    ) {
      window.ReactNativeWebView.postMessage("LOGGED_IN");
    }

    // ✅ détecter dépôt (balance > 0)
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

  // ─── Cacher loader ────────────────────────────────────────────────────────
  const handleLoad = () => {
    Animated.timing(loaderOpacity, {
      toValue: 0, duration: 400, useNativeDriver: true,
    }).start(() => setIsLoading(false));
  };

  // ─── Détecter connexion via URL ───────────────────────────────────────────
  const handleNavigationChange = (navState: { url: string }) => {
    if (isUserLoggedIn(navState.url)) setIsLoggedIn(true);
  };

  // ─── Message animé ────────────────────────────────────────────────────────
  const showMessage = (text: string) => {
    setMsgText(text);
    setMsgVisible(true);
    Animated.sequence([
      Animated.timing(msgOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(msgOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setMsgVisible(false));
  };

  // ─── Secousse FAB ─────────────────────────────────────────────────────────
  const shakeFab = () => {
    Animated.sequence([
      Animated.timing(fabScale, { toValue: 1.2,  duration: 70, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 0.85, duration: 70, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 1.1,  duration: 70, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 1,    duration: 70, useNativeDriver: true }),
    ]).start();
  };

  // ─── PanResponder — drag propre ───────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD,

      onPanResponderGrant: () => {
        // ✅ Reset distance au début de chaque geste
        dragDistance.current = 0;
        fabPosition.setOffset({
          x: (fabPosition.x as any)._value,
          y: (fabPosition.y as any)._value,
        });
        fabPosition.setValue({ x: 0, y: 0 });
      },

      onPanResponderMove: (_, g) => {
        // ✅ Mesurer la distance parcourue
        dragDistance.current = Math.sqrt(g.dx * g.dx + g.dy * g.dy);
        fabPosition.setValue({
          x:g.dx,
          y:g.dy,
        });      },

      onPanResponderRelease: () => {
        fabPosition.flattenOffset();
        dragDistance.current = 0; //important
        // ✅ dragDistance est lu dans handleFabPress juste après
      },
    })
  ).current;

  // ─── Clic FAB ─────────────────────────────────────────────────────────────
  const handleFabPress = () => {
    // ✅ Si l'utilisateur a glissé plus de DRAG_THRESHOLD px → c'était un drag
    if (dragDistance.current > DRAG_THRESHOLD) {
      dragDistance.current = 0; // reset pour le prochain geste
      return;
    }
    dragDistance.current = 0; // reset systématique

    if (!isLoggedIn) {
      showMessage("🔒 Please Login !");
      shakeFab();
      return;
    }

    if (!hasDeposited) {
        showMessage("🔒 Please Deposit to hack");
        shakeFab();
        return;
    }

    setActiveView((prev) => (prev === "game" ? "prediction" : "game"));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── WebView JGame ─────────────────────────────────────────────── */}
      <View
        style={[
          styles.webviewWrapper,
          { zIndex: activeView === "game" ? 2 : 1 },
        ]}
        pointerEvents={activeView === "game" ? "auto" : "none"}
      >
        <WebView
          source={{ uri: INITIAL_URL }}
          style={styles.webview}
          onLoad={handleLoad}
          onNavigationStateChange={(navState) => {
            canGoBack.current = navState.canGoBack;
            handleNavigationChange(navState);
          }}

          injectedJavaScript={injectedJS}

          onMessage={(event) => {
            const msg = event.nativeEvent.data;

            if (msg === "LOGGED_IN") setIsLoggedIn(true); 
            if (msg === "HAS_DEPOSIT") setHasDeposited(true);
          }}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
        />
      </View>

      {/* ── WebView Prediction ────────────────────────────────────────── */}
      <View
        style={[
          styles.webviewWrapper,
          { zIndex: activeView === "prediction" ? 2 : 1 },
        ]}
        pointerEvents={activeView === "prediction" ? "auto" : "none"}
      >
        <WebView
          source={{ uri: PREDICTION_URL }}
          style={styles.webview}
          cacheEnabled={false}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
        />
      </View>

      {/* ── Loader ───────────────────────────────────────────────────── */}
      {isLoading && (
        <Animated.View style={[styles.loader, { opacity: loaderOpacity }]}>
          <Spinner />
          <Text style={styles.loaderText}>Connexion...</Text>
        </Animated.View>
      )}

      {/* ── FAB — TOUJOURS présent une fois affiché ───────────────────── */}
      {fabVisible && (
        <Animated.View
          style={[
            styles.fab,
            {
              transform: [
                ...fabPosition.getTranslateTransform(),
                { scale: fabScale },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            style={styles.fabTouch}
            onPress={handleFabPress}
            activeOpacity={0.85}
          >
            <View style={[styles.fabInner, isLoggedIn && styles.fabInnerActive]}>
              <Text style={styles.fabEmoji}>
                {!isLoggedIn
                  ? "🔒"
                  : !hasDeposited
                  ? "💰"
                  : activeView === "game"
                  ? "🎯"
                  : "🎮"}
              </Text>
              <Text style={[styles.fabLabel, isLoggedIn && styles.fabLabelActive]}>
                {!isLoggedIn ? "LOGIN" : !hasDeposited ? "DEPOSIT" : activeView === "prediction" && isLoggedIn ? "GAME" : "WIN"}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Badge statut ─────────────────────────────────────────────── */}
      {fabVisible && (
        <Animated.View
          style={[
            styles.badge,
            {
              transform: [
                {
                  translateX: Animated.add(
                    fabPosition.x,
                    new Animated.Value(FAB_SIZE - 16)
                  ),
                },
                {
                  translateY: Animated.add(
                    fabPosition.y,
                    new Animated.Value(-4)
                  ),
                },
                { scale: fabScale },
              ],
              backgroundColor: isLoggedIn ? "#00c853" : "#e02020",
            },
          ]}
          pointerEvents="none"
        />
      )}

      {/* ── Message erreur ───────────────────────────────────────────── */}
      {msgVisible && (
        <Animated.View
          style={[styles.message, { opacity: msgOpacity }]}
          pointerEvents="none"
        >
          <Text style={styles.messageText}>{msgText}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
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
  return (
    <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />
  );
}



// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },

  webviewWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
  webview: { flex: 1 },

  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  loaderText: { color: "#fff", marginTop: 16, fontSize: 16 },
  spinner: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 4, borderColor: "#444", borderTopColor: "#e02020",
  },

  fab: {
    position: "absolute",
    width: FAB_SIZE, height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    zIndex: 9999,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  fabTouch: {
    width: FAB_SIZE, height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    overflow: "hidden",
  },
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
  fabLabel: {
    color: "#e02020", fontSize: 9,
    fontWeight: "900", letterSpacing: 1,
  },
  fabLabelActive: { color: "#00c853" },

  badge: {
    position: "absolute",
    width: 14, height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#000",
    zIndex: 10000,
    elevation: 13,
  },

  topBanner: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingVertical: 6,
    alignItems: "center",
    zIndex: 9998,
  },
  topBannerText: {
    color: "#fff", fontSize: 12,
    fontWeight: "700", letterSpacing: 1,
  },

  message: {
    position: "absolute",
    bottom: 110, alignSelf: "center",
    backgroundColor: "#1a1a1a",
    borderWidth: 1.5, borderColor: "#e02020",
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 12, zIndex: 9999, elevation: 8,
    maxWidth: W * 0.85,
  },
  messageText: {
    color: "#fff", fontSize: 13,
    fontWeight: "600", textAlign: "center",
  },
});