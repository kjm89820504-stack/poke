(function () {
  "use strict";

  const STATS_KEY = "pika-runner-stats";
  const BROWSER_ID_KEY = "pika-runner-browser-id";
  const FIREBASE_VERSION = "10.12.5";
  const firebaseConfig = window.PIKACHU_FIREBASE_CONFIG;
  const clientParams = new URLSearchParams(window.location.search);
  const pendingEvents = [];
  let realtimeDatabase = null;
  let firebaseReady = false;
  let firebaseLoading = false;

  if (clientParams.get("resetStats") === "1") {
    localStorage.removeItem(STATS_KEY);
    localStorage.removeItem(BROWSER_ID_KEY);
  }

  function hasUsableFirebaseConfig(config) {
    return Boolean(
      config &&
        typeof config.apiKey === "string" &&
        config.apiKey &&
        !config.apiKey.includes("YOUR_") &&
        typeof config.projectId === "string" &&
        config.projectId &&
        !config.projectId.includes("YOUR_") &&
        typeof config.databaseURL === "string" &&
        config.databaseURL &&
        !config.databaseURL.includes("YOUR_"),
    );
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function initFirebase() {
    if (!hasUsableFirebaseConfig(firebaseConfig) || firebaseLoading || firebaseReady) {
      return;
    }

    firebaseLoading = true;
    try {
      await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js`);
      await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-database-compat.js`);

      window.firebase.initializeApp(firebaseConfig);
      realtimeDatabase = window.firebase.database();
      firebaseReady = true;

      while (pendingEvents.length) {
        sendEvent(pendingEvents.shift());
      }
    } catch (error) {
      console.warn("Firebase connection skipped.", error);
    }
  }

  function getBrowserId() {
    let browserId = localStorage.getItem(BROWSER_ID_KEY);
    if (!browserId) {
      browserId = `runner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem(BROWSER_ID_KEY, browserId);
    }
    return browserId;
  }

  function getStats() {
    try {
      return JSON.parse(localStorage.getItem(STATS_KEY)) || {};
    } catch (error) {
      return {};
    }
  }

  function setStats(nextStats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(nextStats));
  }

  function saveResult(stage, payload) {
    const stats = getStats();
    const bestStage = Math.max(Number(stats.bestStage || 0), stage);
    setStats({
      ...stats,
      bestStage,
      completed: Boolean(stats.completed || payload.completed),
      updatedAt: new Date().toISOString(),
    });
  }

  function normalizePayload(type, payload) {
    return {
      type,
      stage: Number(payload.stage || 1),
      elapsedSeconds: Number(payload.elapsedSeconds || 0),
      stageSeconds: Number(payload.stageSeconds || 30),
      obstacleCount: Number(payload.obstacleCount || 0),
      completed: Boolean(payload.completed),
      browserId: getBrowserId(),
      userAgent: navigator.userAgent.slice(0, 120),
    };
  }

  function logEvent(type, payload) {
    const event = normalizePayload(type, payload || {});
    if (realtimeDatabase) {
      sendEvent(event);
      return;
    }
    if (firebaseLoading || hasUsableFirebaseConfig(firebaseConfig)) {
      pendingEvents.push(event);
    }
  }

  function sendEvent(event) {
    if (!realtimeDatabase) {
      return;
    }

    realtimeDatabase
      .ref("runs")
      .push({
        ...event,
        createdAt: window.firebase.database.ServerValue.TIMESTAMP,
      })
      .catch((error) => {
        console.warn("Realtime Database event write failed.", error);
      });
  }

  window.GameTelemetry = {
    getStats,
    logEvent,
    saveResult,
  };

  initFirebase();
})();
