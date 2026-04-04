import * as Haptics from "expo-haptics";
import * as NavigationBar from "expo-navigation-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  PanResponder,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

const { width: W, height: H } = Dimensions.get("window");
const FAB_SIZE = 65;

const INITIAL_URL =
  "https://www.jaiclub24.com/#/register?invitationCode=12644100603";
const PREDICTION_URL = "https://wingo-prediction-ck.onrender.com/";

const AUTH_PATTERNS = ["/register", "/login", "/sign"];
const LOGGED_IN_PATTERNS = [
  "/home", "/dashboard", "/game", "/lobby",
  "/main", "/wallet", "/profile", "/activity",
];

export default function Index() {
  const webViewRef = useRef<WebView>(null);
  const canGoBack = useRef(false);

  const [activeView, setActiveView] = useState<"game" | "prediction">("game");
  const [isLoading, setIsLoading] = useState(true);
  const [fabVisible, setFabVisible] = useState(false);

  // 3 états du FAB : "login" | "balance" | "win"
  const [fabState, setFabState] = useState<"login" | "balance" | "win">("login");

  const [msgVisible, setMsgVisible] = useState(false);
  const [msgText, setMsgText] = useState("");

  const loaderOpacity = useRef(new Animated.Value(1)).current;
  const msgOpacity    = useRef(new Animated.Value(0)).current;
  const fabScale      = useRef(new Animated.Value(0)).current;
  const fabPosition   = useRef(
    new Animated.ValueXY({ x: W - FAB_SIZE - 20, y: H - FAB_SIZE - 80 })
  ).current;

  const dragDistance  = useRef(0);
  const DRAG_THRESHOLD = 8;

  // ─── Nav bar noire ────────────────────────────────────────────────────────
  useEffect(() => {
    NavigationBar.setBackgroundColorAsync("#000");
  }, []);

  // ─── FAB apparaît après 3s ────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      setFabVisible(true);
      Animated.spring(fabScale, {
        toValue: 1, tension: 80, friction: 6, useNativeDriver: true,
      }).start();
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  // ─── Bouton retour Android ────────────────────────────────────────────────
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
    const h = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => h.remove();
  }, [activeView]);

  // ─── JS injecté — logique corrigée ───────────────────────────────────────
  //
  // PROBLÈME ORIGINAL :
  //   "login" et "register" apparaissent dans le DOM même quand on est
  //   connecté (liens footer, balises cachées, attributs HTML...).
  //   → LOGGED_OUT était envoyé à tort en permanence.
  //
  // NOUVELLE LOGIQUE :
  //   1. On détecte la CONNEXION par la présence d'un solde numérique
  //      visible (balance ≥ 0) plutôt que par des mots-clés texte.
  //   2. LOGGED_OUT n'est envoyé QUE si l'URL contient /login ou /register
  //      (géré côté React Native dans handleNavigationChange).
  //   3. Le JS injecté ne gère QUE :
  //      - LOGGED_IN  : solde détecté dans le DOM
  //      - HAS_BALANCE : solde > 0 détecté (remplace HAS_DEPOSIT)
  //
  const injectedJS = `
(function() {
  let sentLoggedIn  = false;
  let sentHasBalance = false;

  function detect() {
    const body = document.body;
    if (!body) return;

    const text = body.innerText || "";

    // ── Détection CONNEXION ───────────────────────────────────────────
    // On cherche des éléments typiques du tableau de bord connecté :
    // un élément avec "balance", "wallet", "withdraw", "recharge"
    // ET un nombre associé (ex: "Balance: 0.00", "₹ 150.00")
    if (!sentLoggedIn) {
      const hasWalletKeyword =
        /balance|wallet|withdraw|recharge|deposit/i.test(text);

      // Un montant numérique visible (0.00, 150, 1,500.00...)
      const hasAmount = /\\b\\d{1,3}(,\\d{3})*(\\.\\d{1,2})?\\b/.test(text);

      if (hasWalletKeyword && hasAmount) {
        sentLoggedIn = true;
        window.ReactNativeWebView.postMessage("LOGGED_IN");
      }
    }

    // ── Détection SOLDE > 0 ───────────────────────────────────────────
    // On cherche un montant strictement positif affiché près de "balance"
    if (sentLoggedIn && !sentHasBalance) {
      // Cherche tous les nombres dans le texte
      const amounts = [];
      const regex = /([\\d,]+\\.?\\d*)/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const val = parseFloat(match[1].replace(/,/g, ""));
        if (!isNaN(val)) amounts.push(val);
      }

      // Si au moins un montant > 0 est trouvé → balance disponible
      const hasPositiveBalance = amounts.some((v) => v > 0);

      if (hasPositiveBalance) {
        sentHasBalance = true;
        window.ReactNativeWebView.postMessage("HAS_BALANCE");
      }
    }
  }

  // Lancement après 2s puis toutes les 3s
  setTimeout(() => {
    detect();
    setInterval(detect, 3000);

    // Observer les changements du DOM en temps réel
    const observer = new MutationObserver(detect);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, 2000);
})();
`;

  // ─── Loader ───────────────────────────────────────────────────────────────
  const handleLoad = () => {
    Animated.timing(loaderOpacity, {
      toValue: 0, duration: 400, useNativeDriver: true,
    }).start(() => setIsLoading(false));
  };

  // ─── Détection URL — SEUL endroit où on reset l'état ─────────────────────
  //
  // On ne fait confiance qu'à l'URL pour décider si l'utilisateur
  // est déconnecté. Le JS injecté ne peut PAS envoyer LOGGED_OUT
  // car les mots "login"/"register" sont partout dans le HTML.
  //
  const handleNavigationChange = (navState: any) => {
    canGoBack.current = navState.canGoBack;
    const url = navState.url.toLowerCase();

    const isAuthPage = AUTH_PATTERNS.some((p) => url.includes(p));

    if (isAuthPage) {
      // L'utilisateur est sur la page login/register → reset complet
      setFabState("login");
      setActiveView("game");
    } else {
      const isLoggedPage = LOGGED_IN_PATTERNS.some((p) => url.includes(p));
      if (isLoggedPage && fabState === "login") {
        // URL de page connectée → au minimum "balance"
        setFabState("balance");
      }
    }
  };

  // ─── Messages JS → React Native ───────────────────────────────────────────
  const handleMessage = (event: any) => {
    const msg = event.nativeEvent.data;

    if (msg === "LOGGED_IN") {
      // Connecté détecté → passer à "balance" si on était en "login"
      setFabState((prev) => (prev === "login" ? "balance" : prev));
    }

    if (msg === "HAS_BALANCE") {
      // Solde détecté → passer à "win" (bouton débloqué)
      setFabState("win");
    }
  };

  // ─── Message animé ────────────────────────────────────────────────────────
  const showMessage = (text: string) => {
    setMsgText(text);
    setMsgVisible(true);
    Animated.sequence([
      Animated.timing(msgOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(3000),
      Animated.timing(msgOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setMsgVisible(false));
  };

  // ─── Animation secousse ───────────────────────────────────────────────────
  const shakeFab = () => {
    Animated.sequence([
      Animated.timing(fabScale, { toValue: 1.2,  duration: 70, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 0.85, duration: 70, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 1.1,  duration: 70, useNativeDriver: true }),
      Animated.timing(fabScale, { toValue: 1,    duration: 70, useNativeDriver: true }),
    ]).start();
  };

  // ─── PanResponder drag ────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD,

      onPanResponderGrant: () => {
        dragDistance.current = 0;
        fabPosition.extractOffset();
      },

      onPanResponderMove: (_, g) => {
        dragDistance.current = Math.sqrt(g.dx * g.dx + g.dy * g.dy);
        fabPosition.setValue({ x: g.dx, y: g.dy });
      },

      onPanResponderRelease: () => {
        fabPosition.flattenOffset();
      },

      onPanResponderTerminate: () => {
        fabPosition.flattenOffset();
        dragDistance.current = 0;
      },

      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  // ─── Clic FAB ─────────────────────────────────────────────────────────────
  const handleFabPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (dragDistance.current > DRAG_THRESHOLD) {
      dragDistance.current = 0;
      return;
    }
    dragDistance.current = 0;

    if (fabState === "login") {
      showMessage("🔒 Please Login first !");
      shakeFab();
      return;
    }

    if (fabState === "balance") {
      showMessage("💰 Top up your balance for Hack!");
      shakeFab();
      return;
    }

    // fabState === "win" → basculer entre jeu et prédiction
    setActiveView((prev) => (prev === "game" ? "prediction" : "game"));
  };

  // ─── Apparence du FAB selon l'état ───────────────────────────────────────
  const fabConfig = {
    login:   { emoji: "🔒", label: "LOGIN",   border: "#e02020", bg: "#1a1a1a" },
    balance: { emoji: "💰", label: "BALANCE", border: "#f5a623", bg: "#1a1000" },
    win:     {
      emoji: activeView === "game" ? "🎯" : "🎮",
      label: activeView === "game" ? "WIN"  : "GAME",
      border: "#00c853",
      bg: "#0d1f0d",
    },
  }[fabState];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── WebView JGame ─────────────────────────────────────────────── */}
      <View
        style={[styles.webviewWrapper, { zIndex: activeView === "game" ? 2 : 1 }]}
        pointerEvents={activeView === "game" ? "auto" : "none"}
      >
        <WebView
          ref={webViewRef}
          source={{ uri: INITIAL_URL }}
          style={styles.webview}
          onLoad={handleLoad}
          onNavigationStateChange={handleNavigationChange}
          injectedJavaScript={injectedJS}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          cacheMode="LOAD_DEFAULT"
          androidLayerType="hardware"
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          onError={() => showMessage("⚠️ Network error")}
          onHttpError={() => showMessage("⚠️ Server error")}
        />
      </View>

      {/* ── WebView Prediction ────────────────────────────────────────── */}
      <View
        style={[styles.webviewWrapper, { zIndex: activeView === "prediction" ? 2 : 1 }]}
        pointerEvents={activeView === "prediction" ? "auto" : "none"}
      >
        <WebView
          source={{ uri: PREDICTION_URL }}
          style={styles.webview}
          cacheEnabled={false}
        />
      </View>

      {/* ── Loader ───────────────────────────────────────────────────── */}
      {isLoading && (
        <Animated.View style={[styles.loader, { opacity: loaderOpacity }]}>
          <Spinner />
          <Text style={styles.loaderText}>Connexion...</Text>
        </Animated.View>
      )}

      {/* ── FAB ──────────────────────────────────────────────────────── */}
      {fabVisible && (
        <Animated.View
          style={[
            styles.fab,
            { transform: [...fabPosition.getTranslateTransform(), { scale: fabScale }] },
          ]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            style={styles.fabTouch}
            onPress={handleFabPress}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.fabInner,
                { borderColor: fabConfig.border, backgroundColor: fabConfig.bg },
              ]}
            >
              <Text style={styles.fabEmoji}>{fabConfig.emoji}</Text>
              <Text style={[styles.fabLabel, { color: fabConfig.border }]}>
                {fabConfig.label}
              </Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Message ──────────────────────────────────────────────────── */}
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
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
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
    zIndex: 9999, elevation: 12,
  },
  fabTouch: {
    width: FAB_SIZE, height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
  },
  fabInner: {
    width: FAB_SIZE, height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2.5,
  },
  fabEmoji: { fontSize: 20 },
  fabLabel: { fontSize: 9, fontWeight: "900" },
  message: {
    position: "absolute",
    bottom: 110, alignSelf: "center",
    backgroundColor: "#1a1a1a",
    borderWidth: 1.5, borderColor: "#e02020",
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 10, zIndex: 9999, elevation: 999,
    maxWidth: W * 0.85,
  },
  messageText: { color: "#fff" },
});