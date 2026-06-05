(function () {
  "use strict";

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayKicker = document.getElementById("overlay-kicker");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayCopy = document.getElementById("overlay-copy");
  const overlayAction = document.getElementById("overlay-action");
  const jumpButton = document.getElementById("jump-button");
  const stageLabel = document.getElementById("stage-label");
  const timeLabel = document.getElementById("time-label");
  const bestLabel = document.getElementById("best-label");
  const progressFill = document.getElementById("progress-fill");

  const WORLD_WIDTH = 960;
  const WORLD_HEIGHT = 540;
  const GROUND_Y = 422;
  const MAX_STAGE = 5;
  const params = new URLSearchParams(window.location.search);
  const DEBUG_MODE = params.get("debug") === "1";
  const SAFE_RUN = DEBUG_MODE && params.get("safe") === "1";
  const requestedStageSeconds = params.has("stageSeconds") ? Number(params.get("stageSeconds")) : NaN;
  const STAGE_SECONDS = Number.isFinite(requestedStageSeconds)
    ? Math.min(300, Math.max(DEBUG_MODE ? 2 : 10, requestedStageSeconds))
    : 300;

  const telemetry = {
    log(type, payload) {
      if (window.GameTelemetry && typeof window.GameTelemetry.logEvent === "function") {
        window.GameTelemetry.logEvent(type, payload);
      }
    },
    saveResult(stage, payload) {
      if (window.GameTelemetry && typeof window.GameTelemetry.saveResult === "function") {
        window.GameTelemetry.saveResult(stage, payload);
      }
    },
    stats() {
      if (window.GameTelemetry && typeof window.GameTelemetry.getStats === "function") {
        return window.GameTelemetry.getStats();
      }
      return {};
    },
  };

  const player = {
    x: 144,
    y: GROUND_Y - 112,
    w: 112,
    h: 112,
    vy: 0,
    onGround: true,
    maxJumps: 2,
    jumpsUsed: 0,
    runPhase: 0,
    fallRotation: 0,
  };

  const game = {
    state: "ready",
    stage: 1,
    elapsed: 0,
    obstacleTimer: 0.8,
    obstacles: [],
    particles: [],
    crashTimer: 0,
    completeTime: 0,
    lastTime: 0,
    groundOffset: 0,
    clouds: [
      { x: 118, y: 74, s: 1.05 },
      { x: 424, y: 92, s: 0.78 },
      { x: 748, y: 64, s: 0.92 },
    ],
  };

  const pikachuImage = new Image();
  let pikachuSprite = null;
  let pikachuImageReady = false;

  pikachuImage.onload = function () {
    pikachuSprite = removeBlackBackground(pikachuImage);
    pikachuImageReady = true;
  };
  pikachuImage.onerror = function () {
    pikachuImageReady = false;
  };
  pikachuImage.src = "assets/pikachu.png";

  function removeBlackBackground(image) {
    const offscreen = document.createElement("canvas");
    const maxSize = 512;
    const imageWidth = image.naturalWidth || image.width || 256;
    const imageHeight = image.naturalHeight || image.height || 256;
    const scale = Math.min(1, maxSize / Math.max(imageWidth, imageHeight));
    const width = Math.max(1, Math.round(imageWidth * scale));
    const height = Math.max(1, Math.round(imageHeight * scale));
    offscreen.width = width;
    offscreen.height = height;
    const offscreenCtx = offscreen.getContext("2d", { willReadFrequently: true });
    offscreenCtx.clearRect(0, 0, width, height);
    offscreenCtx.drawImage(image, 0, 0, width, height);

    const imageData = offscreenCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const visited = new Uint8Array(width * height);
    const queue = [];

    function isNearBlack(pixelIndex) {
      const i = pixelIndex * 4;
      return data[i + 3] > 0 && data[i] < 26 && data[i + 1] < 26 && data[i + 2] < 26;
    }

    function enqueue(x, y) {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        return;
      }
      const pixelIndex = y * width + x;
      if (!visited[pixelIndex] && isNearBlack(pixelIndex)) {
        visited[pixelIndex] = 1;
        queue.push(pixelIndex);
      }
    }

    for (let x = 0; x < width; x += 1) {
      enqueue(x, 0);
      enqueue(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      enqueue(0, y);
      enqueue(width - 1, y);
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const pixelIndex = queue[cursor];
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      data[pixelIndex * 4 + 3] = 0;
      enqueue(x + 1, y);
      enqueue(x - 1, y);
      enqueue(x, y + 1);
      enqueue(x, y - 1);
    }

    offscreenCtx.putImageData(imageData, 0, 0);
    return offscreen;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(canvas.width / WORLD_WIDTH, 0, 0, canvas.height / WORLD_HEIGHT, 0, 0);
  }

  function getStageSettings(stage) {
    return {
      speed: 320 + (stage - 1) * 58,
      spawnMin: Math.max(0.56, 1.36 - (stage - 1) * 0.17),
      spawnMax: Math.max(0.94, 2.18 - (stage - 1) * 0.21),
      clusterChance: Math.min(0.36, 0.06 + stage * 0.06),
    };
  }

  function resetStage(stage) {
    const settings = getStageSettings(stage);
    game.stage = stage;
    game.elapsed = 0;
    game.obstacleTimer = 1.05;
    game.obstacles = [];
    game.particles = [];
    game.crashTimer = 0;
    game.completeTime = 0;
    game.groundOffset = 0;
    player.y = GROUND_Y - player.h;
    player.vy = 0;
    player.onGround = true;
    player.jumpsUsed = 0;
    player.runPhase = 0;
    player.fallRotation = 0;
    scheduleObstacle(settings, true);
    updateHud();
  }

  function beginRun() {
    if (game.state === "running") {
      jump();
      return;
    }
    game.state = "running";
    hideOverlay();
    telemetry.log("stage_start", {
      stage: game.stage,
      stageSeconds: STAGE_SECONDS,
    });
  }

  function restartFromStageOne() {
    resetStage(1);
    beginRun();
  }

  function nextStage() {
    if (game.stage >= MAX_STAGE) {
      restartFromStageOne();
      return;
    }
    resetStage(game.stage + 1);
    beginRun();
  }

  function jump() {
    if (game.state !== "running") {
      return;
    }

    if (player.onGround) {
      player.vy = -825;
      player.onGround = false;
      player.jumpsUsed = 1;
      createDust(player.x + 36, GROUND_Y - 8, 9);
      return;
    }

    if (player.jumpsUsed >= player.maxJumps) {
      return;
    }

    player.vy = -760;
    player.jumpsUsed += 1;
    createLightningParticles(player.x + player.w * 0.52, player.y + player.h * 0.72, 12);
  }

  function update(dt) {
    if (game.state === "running") {
      updateRun(dt);
    } else if (game.state === "crashed") {
      updateCrash(dt);
    } else if (game.state === "complete") {
      updateComplete(dt);
    }
    updateParticles(dt);
    updateHud();
  }

  function updateRun(dt) {
    const settings = getStageSettings(game.stage);
    const progress = Math.min(1, game.elapsed / STAGE_SECONDS);
    const speed = settings.speed * (1 + progress * 0.18);

    game.elapsed += dt;
    game.groundOffset = (game.groundOffset + speed * dt) % 96;
    player.runPhase += dt * (10.5 + game.stage * 0.55);

    player.vy += 2050 * dt;
    player.y += player.vy * dt;
    const floorY = GROUND_Y - player.h;
    if (player.y >= floorY) {
      const wasAirborne = !player.onGround;
      player.y = floorY;
      player.vy = 0;
      player.onGround = true;
      player.jumpsUsed = 0;
      if (wasAirborne) {
        createDust(player.x + 36, GROUND_Y - 8, 5);
      }
    }

    game.obstacleTimer -= dt;
    if (!SAFE_RUN && game.obstacleTimer <= 0 && progress < 0.965) {
      spawnObstacle(settings);
      scheduleObstacle(settings, false);
    }

    for (const obstacle of game.obstacles) {
      obstacle.x -= speed * dt;
      obstacle.spin += dt * 2.4;
    }
    game.obstacles = game.obstacles.filter((obstacle) => obstacle.x + obstacle.w > -40);

    if (!SAFE_RUN && hasCollision()) {
      failStage();
      return;
    }

    if (game.elapsed >= STAGE_SECONDS) {
      clearStage();
    }
  }

  function updateCrash(dt) {
    game.crashTimer += dt;
    player.fallRotation = Math.min(1.34, player.fallRotation + dt * 3.2);
    player.y = Math.min(GROUND_Y - player.h * 0.5, player.y + dt * 190);

    if (game.crashTimer > 0.58) {
      showOverlay("FAILED", "실패", "1스테이지부터 다시 시작", "다시");
    }
  }

  function updateComplete(dt) {
    game.completeTime += dt;
    if (game.completeTime < 4.8) {
      const centerX = player.x + player.w * 0.58;
      const centerY = player.y + player.h * 0.44;
      createLightningParticles(centerX, centerY, 4);
    }
  }

  function updateParticles(dt) {
    for (const particle of game.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.life -= dt;
    }
    game.particles = game.particles.filter((particle) => particle.life > 0);
  }

  function scheduleObstacle(settings, initial) {
    const min = settings.spawnMin;
    const max = settings.spawnMax;
    game.obstacleTimer = initial ? 1.35 : min + Math.random() * (max - min);
  }

  function spawnObstacle(settings) {
    const obstacle = createObstacle(WORLD_WIDTH + 32);
    game.obstacles.push(obstacle);

    if (Math.random() < settings.clusterChance) {
      const second = createObstacle(WORLD_WIDTH + 32 + obstacle.w + 84 + Math.random() * 38);
      second.h *= 0.9;
      second.y = GROUND_Y - second.h;
      game.obstacles.push(second);
    }
  }

  function createObstacle(x) {
    const typeRoll = Math.random();
    let type = "stump";
    if (typeRoll > 0.68) {
      type = "rock";
    } else if (typeRoll > 0.38) {
      type = "cone";
    }

    const sizeBoost = 1 + (game.stage - 1) * 0.04;
    const base = {
      stump: { w: 50, h: 56 },
      cone: { w: 44, h: 66 },
      rock: { w: 68, h: 42 },
    }[type];

    return {
      type,
      x,
      y: GROUND_Y - base.h * sizeBoost,
      w: base.w * sizeBoost,
      h: base.h * sizeBoost,
      spin: Math.random() * Math.PI,
    };
  }

  function hasCollision() {
    const playerBox = {
      x: player.x + 26,
      y: player.y + 20,
      w: player.w - 46,
      h: player.h - 24,
    };

    return game.obstacles.some((obstacle) => {
      const obstacleBox = {
        x: obstacle.x + obstacle.w * 0.12,
        y: obstacle.y + obstacle.h * 0.08,
        w: obstacle.w * 0.76,
        h: obstacle.h * 0.84,
      };
      return boxesOverlap(playerBox, obstacleBox);
    });
  }

  function boxesOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function failStage() {
    if (game.state !== "running") {
      return;
    }
    game.state = "crashed";
    game.crashTimer = 0;
    createDust(player.x + 64, GROUND_Y - 4, 22);
    telemetry.log("stage_fail", {
      stage: game.stage,
      elapsedSeconds: Math.round(game.elapsed),
      stageSeconds: STAGE_SECONDS,
      obstacleCount: game.obstacles.length,
    });
  }

  function clearStage() {
    game.elapsed = STAGE_SECONDS;
    telemetry.log("stage_clear", {
      stage: game.stage,
      elapsedSeconds: STAGE_SECONDS,
      stageSeconds: STAGE_SECONDS,
      obstacleCount: game.obstacles.length,
    });
    telemetry.saveResult(game.stage, {
      completed: game.stage === MAX_STAGE,
      elapsedSeconds: STAGE_SECONDS,
    });

    if (game.stage >= MAX_STAGE) {
      game.state = "complete";
      game.completeTime = 0;
      showOverlay("ALL CLEAR", "전체 클리어", "백만볼트!", "다시");
      telemetry.log("all_clear", {
        stage: game.stage,
        elapsedSeconds: STAGE_SECONDS,
        stageSeconds: STAGE_SECONDS,
        completed: true,
      });
      return;
    }

    game.state = "stageClear";
    showOverlay("SUCCESS", "성공", "다음 스테이지 시작", "다음");
  }

  function draw() {
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    drawBackground();
    drawFinishGate();
    drawObstacles();
    drawParticles();
    drawPlayer();

    if (game.state === "complete") {
      drawMillionVolt();
    }
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, "#72ccff");
    sky.addColorStop(0.62, "#d9f2ff");
    sky.addColorStop(1, "#fff3bf");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    ctx.fillStyle = "#ffd44a";
    ctx.beginPath();
    ctx.arc(830, 88, 42, 0, Math.PI * 2);
    ctx.fill();

    for (const cloud of game.clouds) {
      drawCloud(cloud.x - (game.groundOffset * 0.12) % 260, cloud.y, cloud.s);
      drawCloud(cloud.x + 520 - (game.groundOffset * 0.12) % 260, cloud.y + 18, cloud.s * 0.84);
    }

    ctx.fillStyle = "#6fb56d";
    drawHill(-60, 342, 360, 110);
    drawHill(280, 360, 430, 90);
    drawHill(620, 346, 360, 108);

    ctx.fillStyle = "#229958";
    ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, WORLD_HEIGHT - GROUND_Y);
    ctx.fillStyle = "#35b86f";
    ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, 26);

    ctx.strokeStyle = "rgba(23, 33, 47, 0.24)";
    ctx.lineWidth = 3;
    for (let x = -game.groundOffset; x < WORLD_WIDTH + 120; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 46);
      ctx.lineTo(x + 44, GROUND_Y + 46);
      ctx.stroke();
    }
  }

  function drawCloud(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.beginPath();
    ctx.arc(0, 18, 22, 0, Math.PI * 2);
    ctx.arc(26, 12, 28, 0, Math.PI * 2);
    ctx.arc(58, 20, 20, 0, Math.PI * 2);
    ctx.fillRect(-4, 18, 70, 24);
    ctx.fill();
    ctx.restore();
  }

  function drawHill(x, y, width, height) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.quadraticCurveTo(x + width * 0.5, y - height, x + width, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  function drawFinishGate() {
    const progress = Math.min(1, game.elapsed / STAGE_SECONDS);
    if (progress < 0.9 && game.state !== "complete") {
      return;
    }

    const reveal = game.state === "complete" ? 1 : (progress - 0.9) / 0.1;
    const x = WORLD_WIDTH + 90 - reveal * 246;
    const top = GROUND_Y - 190;

    ctx.save();
    ctx.lineWidth = 12;
    ctx.strokeStyle = "#17212f";
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x, top);
    ctx.lineTo(x + 118, top);
    ctx.lineTo(x + 118, GROUND_Y);
    ctx.stroke();

    for (let i = 0; i < 6; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#e9383f";
      ctx.fillRect(x + 8 + i * 18, top + 12, 18, 18);
    }
    ctx.restore();
  }

  function drawObstacles() {
    for (const obstacle of game.obstacles) {
      if (obstacle.type === "stump") {
        drawStump(obstacle);
      } else if (obstacle.type === "cone") {
        drawCone(obstacle);
      } else {
        drawRock(obstacle);
      }
    }
  }

  function drawStump(obstacle) {
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.fillStyle = "#8b4b25";
    ctx.strokeStyle = "#4b2719";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(4, 10, obstacle.w - 8, obstacle.h - 12, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d89a50";
    ctx.beginPath();
    ctx.ellipse(obstacle.w * 0.5, 12, obstacle.w * 0.42, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(75, 39, 25, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(obstacle.w * 0.5, 12, obstacle.w * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawCone(obstacle) {
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.fillStyle = "#e9383f";
    ctx.strokeStyle = "#17212f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(obstacle.w * 0.5, 4);
    ctx.lineTo(obstacle.w - 4, obstacle.h - 8);
    ctx.lineTo(4, obstacle.h - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(obstacle.w * 0.22, obstacle.h * 0.54, obstacle.w * 0.56, 9);
    ctx.fillStyle = "#17212f";
    ctx.fillRect(0, obstacle.h - 8, obstacle.w, 8);
    ctx.restore();
  }

  function drawRock(obstacle) {
    ctx.save();
    ctx.translate(obstacle.x, obstacle.y);
    ctx.fillStyle = "#717b88";
    ctx.strokeStyle = "#303946";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(8, obstacle.h);
    ctx.lineTo(0, obstacle.h * 0.52);
    ctx.lineTo(obstacle.w * 0.22, obstacle.h * 0.18);
    ctx.lineTo(obstacle.w * 0.58, 0);
    ctx.lineTo(obstacle.w, obstacle.h * 0.38);
    ctx.lineTo(obstacle.w * 0.86, obstacle.h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.26)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(obstacle.w * 0.32, obstacle.h * 0.22);
    ctx.lineTo(obstacle.w * 0.52, obstacle.h * 0.12);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    const bob = player.onGround && game.state === "running" ? Math.sin(player.runPhase) * 3 : 0;
    const tilt = player.onGround && game.state === "running" ? Math.sin(player.runPhase) * 0.04 : 0;

    ctx.save();
    ctx.translate(player.x + player.w * 0.5, player.y + player.h * 0.56 + bob);
    ctx.rotate(player.fallRotation + tilt);

    if (pikachuImageReady && pikachuSprite) {
      const drawHeight = player.h * 1.18;
      const drawWidth = drawHeight * (pikachuSprite.width / pikachuSprite.height);
      ctx.drawImage(pikachuSprite, -drawWidth * 0.48, -drawHeight * 0.64, drawWidth, drawHeight);
    } else {
      drawFallbackMascot(player.w, player.h);
    }

    ctx.restore();
  }

  function drawFallbackMascot(w, h) {
    ctx.save();
    ctx.fillStyle = "#ffd21f";
    ctx.strokeStyle = "#17212f";
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(-34, -36);
    ctx.lineTo(-76, -98);
    ctx.lineTo(-22, -64);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(34, -36);
    ctx.lineTo(78, -96);
    ctx.lineTo(26, -62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.38, h * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#17212f";
    ctx.beginPath();
    ctx.arc(-20, -20, 8, 0, Math.PI * 2);
    ctx.arc(20, -20, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ff6268";
    ctx.beginPath();
    ctx.arc(-34, -2, 10, 0, Math.PI * 2);
    ctx.arc(34, -2, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#17212f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.quadraticCurveTo(0, -3, 6, -8);
    ctx.moveTo(-12, 8);
    ctx.quadraticCurveTo(0, 17, 12, 8);
    ctx.stroke();

    ctx.fillStyle = "#ffd21f";
    ctx.strokeStyle = "#17212f";
    ctx.beginPath();
    ctx.moveTo(44, -18);
    ctx.lineTo(90, -46);
    ctx.lineTo(76, -18);
    ctx.lineTo(114, -2);
    ctx.lineTo(58, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of game.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawMillionVolt() {
    const centerX = player.x + player.w * 0.54;
    const centerY = player.y + player.h * 0.42;
    const flash = Math.max(0, 0.26 - game.completeTime * 0.04);

    ctx.save();
    ctx.globalAlpha = flash + Math.random() * 0.06;
    ctx.fillStyle = "#fff5a3";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ctx.restore();

    ctx.save();
    ctx.lineCap = "round";
    for (let i = 0; i < 9; i += 1) {
      const angle = (Math.PI * 2 * i) / 9 + game.completeTime * 0.8;
      const endX = centerX + Math.cos(angle) * (260 + Math.random() * 180);
      const endY = centerY + Math.sin(angle) * (140 + Math.random() * 130);
      drawLightningBolt(centerX, centerY, endX, endY, i % 2 === 0 ? "#fff45a" : "#42d8ff");
    }
    ctx.restore();
  }

  function drawLightningBolt(startX, startY, endX, endY, color) {
    const segments = 7;
    ctx.strokeStyle = "#17212f";
    ctx.lineWidth = 9;
    ctx.beginPath();
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const x = startX + (endX - startX) * t + (Math.random() - 0.5) * 34;
      const y = startY + (endY - startY) * t + (Math.random() - 0.5) * 34;
      if (i === 0) {
        ctx.moveTo(startX, startY);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  function createDust(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      game.particles.push({
        x,
        y,
        vx: -80 - Math.random() * 160,
        vy: -40 - Math.random() * 90,
        gravity: 360,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        size: 4 + Math.random() * 5,
        color: "rgba(121, 85, 54, 0.7)",
      });
    }
  }

  function createLightningParticles(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 140 + Math.random() * 260;
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: 0,
        life: 0.34 + Math.random() * 0.24,
        maxLife: 0.58,
        size: 3 + Math.random() * 5,
        color: Math.random() > 0.42 ? "#fff45a" : "#42d8ff",
      });
    }
  }

  function showOverlay(kicker, title, copy, action) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    overlayAction.textContent = action;
    overlay.hidden = false;
    overlayAction.focus({ preventScroll: true });
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function updateHud() {
    const remaining = Math.max(0, STAGE_SECONDS - game.elapsed);
    const progress = Math.min(1, game.elapsed / STAGE_SECONDS);
    const stats = telemetry.stats();

    stageLabel.textContent = `STAGE ${game.stage} / ${MAX_STAGE}`;
    timeLabel.textContent = formatTime(remaining);
    bestLabel.textContent = stats.completed ? "ALL CLEAR" : `BEST ${stats.bestStage || 0}`;
    progressFill.style.width = `${Math.round(progress * 1000) / 10}%`;
  }

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function handlePrimaryAction() {
    if (game.state === "ready") {
      beginRun();
    } else if (game.state === "running") {
      jump();
    } else if (game.state === "stageClear") {
      nextStage();
    } else if (game.state === "crashed") {
      restartFromStageOne();
    } else if (game.state === "complete") {
      restartFromStageOne();
    }
  }

  function loop(timestamp) {
    if (!game.lastTime) {
      game.lastTime = timestamp;
    }
    const dt = Math.min(0.05, (timestamp - game.lastTime) / 1000);
    game.lastTime = timestamp;
    update(dt);
    draw();
    window.requestAnimationFrame(loop);
  }

  overlayAction.addEventListener("click", handlePrimaryAction);
  jumpButton.addEventListener("pointerdown", function (event) {
    event.preventDefault();
    if (game.state === "running") {
      jump();
    } else {
      handlePrimaryAction();
    }
  });

  window.addEventListener("keydown", function (event) {
    if (event.repeat) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      handlePrimaryAction();
    }

    if ((event.code === "ArrowUp" || event.code === "KeyW") && game.state === "running") {
      event.preventDefault();
      jump();
    }
  });

  window.addEventListener("resize", resizeCanvas);

  if (typeof CanvasRenderingContext2D.prototype.roundRect !== "function") {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
      const r = Math.min(radius, width / 2, height / 2);
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + width, y, x + width, y + height, r);
      this.arcTo(x + width, y + height, x, y + height, r);
      this.arcTo(x, y + height, x, y, r);
      this.arcTo(x, y, x + width, y, r);
      this.closePath();
      return this;
    };
  }

  if (DEBUG_MODE) {
    window.PikaRunnerDebug = {
      getState() {
        return {
          state: game.state,
          stage: game.stage,
          elapsed: game.elapsed,
          obstacleCount: game.obstacles.length,
          playerY: player.y,
          jumpsUsed: player.jumpsUsed,
          maxJumps: player.maxJumps,
        };
      },
      forceStageClear() {
        clearStage();
      },
      forceFail() {
        failStage();
      },
      jump,
    };
  }

  resizeCanvas();
  resetStage(1);
  showOverlay("READY", "STAGE 1", "골인 지점까지 달려보자", "시작");
  window.requestAnimationFrame(loop);
})();
