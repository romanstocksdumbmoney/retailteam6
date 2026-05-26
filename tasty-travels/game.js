(function () {
  "use strict";

  const { Engine, World, Bodies, Body, Events, Composite, Vector } = Matter;
  const { DRINKS, getDrinkById, MAX_TIER_ID } = window.TastyDrinks;
  const { TastyUIController } = window.TastyUI;
  const { TastyAudioController } = window.TastyAudio;

  const SAVE_KEY = "tastyTravelsSaveV1";

  // Tunable physics and pacing constants for quick balancing.
  const GAME_CONFIG = {
    fixedTimeStepMs: 1000 / 60,
    linearDamping: 0.04,
    wallRestitution: 0.3,
    launchVelocityScale: 0.0135,
    maxLaunchSpeed: 12.5,
    launchMinPull: 12,
    launchSpawnCooldownMs: 340,
    mergeCoinBase: 6,
    dangerTimeoutMs: 1300,
    sparkleSpawnRateMs: 240,
  };

  class TastyTravelsGame {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");

      this.ui = new TastyUIController(DRINKS);
      this.audio = new TastyAudioController();

      this.engine = Engine.create({
        gravity: { x: 0, y: 0 },
        positionIterations: 8,
        velocityIterations: 6,
      });
      this.world = this.engine.world;

      this.worldWalls = [];
      this.drinkBodies = new Map();

      this.pointerId = null;
      this.isDragging = false;
      this.dragPointer = null;
      this.spawnPoint = { x: 0, y: 0 };
      this.bounds = null;

      this.currentBody = null;
      this.nextDrinkId = 1;
      this.spawnCooldown = 0;
      this.pendingMerges = [];
      this.pendingMergePairs = new Set();

      this.coins = 0;
      this.ordersCompleted = 0;
      this.maxDiscoveredTier = 1;
      this.discoveredIds = new Set([1]);
      this.activeOrder = null;
      this.isMuted = false;
      this.gameOver = false;
      this.dangerTimer = 0;

      this.sparkles = [];
      this.mergeParticles = [];
      this.lastSparkleSpawn = 0;
      this.fireworkTimer = 800;

      this.loopAccumulator = 0;
      this.lastFrameMs = 0;
      this.frameRequest = null;

      this.loadProgress();
      this.resizeCanvas(true);
      this.setupWorld();
      this.bindEvents();
      this.startNewBoard();
    }

    setupWorld() {
      Events.on(this.engine, "collisionStart", (event) => {
        for (const pair of event.pairs) {
          this.queueMergeIfValid(pair.bodyA, pair.bodyB);
        }
      });
    }

    bindEvents() {
      this.canvas.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
      window.addEventListener("pointermove", (event) => this.handlePointerMove(event));
      window.addEventListener("pointerup", (event) => this.handlePointerUp(event));
      window.addEventListener("pointercancel", (event) => this.handlePointerUp(event));
      window.addEventListener("resize", () => this.resizeCanvas(false));

      this.ui.bindStoreButton(() => {
        this.ui.showFloatingText("Store coming soon!", this.bounds.width - 70, 70);
      });
      this.ui.bindSettingsButton(() => {
        this.isMuted = !this.isMuted;
        this.audio.setMuted(this.isMuted);
        this.ui.showFloatingText(this.isMuted ? "Sound: OFF" : "Sound: ON", this.bounds.width - 52, this.bounds.height - 122);
      });
      this.ui.bindRestart(() => {
        this.startNewBoard();
      });
    }

    loadProgress() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw);
        this.coins = Number.isFinite(parsed.coins) ? parsed.coins : 0;
        this.ordersCompleted = Number.isFinite(parsed.orderCount) ? parsed.orderCount : 0;
        this.maxDiscoveredTier = Number.isFinite(parsed.highestTierReached)
          ? Math.max(1, Math.min(MAX_TIER_ID, parsed.highestTierReached))
          : 1;
        if (Array.isArray(parsed.discoveredIds) && parsed.discoveredIds.length > 0) {
          this.discoveredIds = new Set(parsed.discoveredIds.filter((id) => Number.isFinite(id)));
        }
        this.discoveredIds.add(1);
      } catch (error) {
        console.warn("Could not parse save file, using defaults.", error);
      }
    }

    persistProgress() {
      const payload = {
        coins: this.coins,
        highestTierReached: this.maxDiscoveredTier,
        orderCount: this.ordersCompleted,
        discoveredIds: Array.from(this.discoveredIds).sort((a, b) => a - b),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    }

    resizeCanvas(isInitial) {
      const prevWidth = this.bounds ? this.bounds.width : 0;
      const prevHeight = this.bounds ? this.bounds.height : 0;

      const rect = this.canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      this.canvas.width = Math.round(rect.width * dpr);
      this.canvas.height = Math.round(rect.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this.bounds = {
        width: rect.width,
        height: rect.height,
        tableLeft: rect.width * 0.08,
        tableRight: rect.width * 0.92,
        tableTop: rect.height * 0.14,
        tableBottom: rect.height * 0.9,
        launchLineY: rect.height * 0.78,
        dangerLineY: rect.height * 0.2,
      };
      this.spawnPoint = {
        x: rect.width * 0.5,
        y: this.bounds.launchLineY + 48,
      };

      this.rebuildWalls();

      if (!isInitial && prevWidth > 0 && prevHeight > 0) {
        const sx = this.bounds.width / prevWidth;
        const sy = this.bounds.height / prevHeight;
        for (const body of this.drinkBodies.values()) {
          Body.setPosition(body, { x: body.position.x * sx, y: body.position.y * sy });
          Body.setVelocity(body, { x: body.velocity.x * sx, y: body.velocity.y * sy });
        }
        if (this.currentBody) {
          Body.setPosition(this.currentBody, this.spawnPoint);
        }
        for (const sparkle of this.sparkles) {
          sparkle.x *= sx;
          sparkle.y *= sy;
        }
      }
    }

    rebuildWalls() {
      if (this.worldWalls.length > 0) {
        World.remove(this.world, this.worldWalls);
      }

      const wallThickness = 18;
      const b = this.bounds;
      const tableMidY = (b.tableTop + b.tableBottom) * 0.5;
      const tableHeight = b.tableBottom - b.tableTop + 70;

      const leftWall = Bodies.rectangle(
        b.tableLeft - wallThickness * 0.5,
        tableMidY,
        wallThickness,
        tableHeight,
        { isStatic: true, restitution: GAME_CONFIG.wallRestitution, friction: 0 }
      );
      const rightWall = Bodies.rectangle(
        b.tableRight + wallThickness * 0.5,
        tableMidY,
        wallThickness,
        tableHeight,
        { isStatic: true, restitution: GAME_CONFIG.wallRestitution, friction: 0 }
      );
      const topWall = Bodies.rectangle(
        (b.tableLeft + b.tableRight) * 0.5,
        b.tableTop - 12,
        b.tableRight - b.tableLeft + 20,
        20,
        { isStatic: true, restitution: GAME_CONFIG.wallRestitution, friction: 0 }
      );
      const bottomWall = Bodies.rectangle(
        (b.tableLeft + b.tableRight) * 0.5,
        b.tableBottom + 24,
        b.tableRight - b.tableLeft + 40,
        24,
        { isStatic: true, restitution: GAME_CONFIG.wallRestitution, friction: 0 }
      );

      this.worldWalls = [leftWall, rightWall, topWall, bottomWall];
      World.add(this.world, this.worldWalls);
    }

    startNewBoard() {
      // Wipe active physics objects but keep progression and currencies.
      for (const body of this.drinkBodies.values()) {
        World.remove(this.world, body);
      }
      this.drinkBodies.clear();
      this.pendingMerges.length = 0;
      this.pendingMergePairs.clear();
      this.mergeParticles.length = 0;
      this.sparkles.length = 0;

      this.currentBody = null;
      this.isDragging = false;
      this.dragPointer = null;
      this.pointerId = null;
      this.spawnCooldown = 0;
      this.dangerTimer = 0;
      this.gameOver = false;
      this.ui.showGameOver(false);

      this.nextDrinkId = this.rollNextDrinkId();
      this.spawnCurrentDrink();
      this.createOrder();
      this.syncHud();

      if (!this.frameRequest) {
        this.lastFrameMs = performance.now();
        this.frameRequest = requestAnimationFrame((now) => this.loop(now));
      }
    }

    syncHud() {
      this.ui.setCoins(this.coins);
      this.ui.setCollection(this.discoveredIds);
      this.ui.setOrder(this.activeOrder);
      this.ui.setNextDrink(getDrinkById(this.nextDrinkId));
    }

    rollNextDrinkId() {
      const cap = Math.min(5, Math.max(2, this.maxDiscoveredTier + 1));
      const weighted = [];
      for (let tier = 1; tier <= cap; tier += 1) {
        const weight = cap - tier + 2;
        for (let i = 0; i < weight; i += 1) {
          weighted.push(tier);
        }
      }
      return weighted[Math.floor(Math.random() * weighted.length)] || 1;
    }

    spawnCurrentDrink() {
      if (this.currentBody || this.gameOver) {
        return;
      }
      const tierId = this.nextDrinkId;
      this.currentBody = this.spawnDrinkBody({
        tierId,
        x: this.spawnPoint.x,
        y: this.spawnPoint.y,
        launched: false,
      });

      this.nextDrinkId = this.rollNextDrinkId();
      this.ui.setNextDrink(getDrinkById(this.nextDrinkId));
    }

    spawnDrinkBody({ tierId, x, y, launched, popScale = 1 }) {
      const drink = getDrinkById(tierId);
      const body = Bodies.circle(x, y, drink.radius, {
        restitution: 0.3,
        friction: 0.003,
        frictionAir: GAME_CONFIG.linearDamping,
        frictionStatic: 0.06,
        density: 0.0028,
        slop: 0.08,
        label: "drink",
      });

      body.plugin.tasty = {
        tierId,
        launched,
        merging: false,
        popScale,
        bobSeed: Math.random() * Math.PI * 2,
      };

      if (!launched) {
        Body.setStatic(body, true);
        body.isSensor = true;
      }

      World.add(this.world, body);
      this.drinkBodies.set(body.id, body);
      this.discoverTier(tierId);
      return body;
    }

    discoverTier(tierId) {
      if (!this.discoveredIds.has(tierId)) {
        this.discoveredIds.add(tierId);
      }
      if (tierId > this.maxDiscoveredTier) {
        this.maxDiscoveredTier = tierId;
      }
      this.ui.setCollection(this.discoveredIds);
      this.persistProgress();
    }

    createOrder() {
      const maxTarget = Math.min(MAX_TIER_ID, Math.max(4, this.maxDiscoveredTier + 1));
      const minTarget = Math.max(3, maxTarget - 3);
      const targetId = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;
      const reward = 48 + targetId * 18 + this.ordersCompleted * 4;
      this.activeOrder = {
        targetId,
        reward,
        target: getDrinkById(targetId),
      };
      this.ui.setOrder(this.activeOrder);
    }

    addCoins(amount, worldX, worldY) {
      this.coins += amount;
      this.ui.setCoins(this.coins);
      this.persistProgress();

      if (Number.isFinite(worldX) && Number.isFinite(worldY)) {
        this.ui.showFloatingText(`+${amount}`, worldX, worldY);
      }
    }

    completeOrder(worldX, worldY) {
      this.ordersCompleted += 1;
      this.addCoins(this.activeOrder.reward, worldX, worldY - 16);
      this.audio.playOrderComplete();
      this.ui.showFloatingText("Order complete!", worldX, worldY - 34);
      this.createOrder();
      this.persistProgress();
    }

    getPointerPosition(event) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    }

    handlePointerDown(event) {
      if (this.gameOver || !this.currentBody) {
        return;
      }
      const meta = this.currentBody.plugin.tasty;
      if (!meta || meta.launched) {
        return;
      }
      const p = this.getPointerPosition(event);
      const distance = Math.hypot(p.x - this.currentBody.position.x, p.y - this.currentBody.position.y);
      const radius = getDrinkById(meta.tierId).radius;
      if (distance > radius + 16) {
        return;
      }
      this.pointerId = event.pointerId;
      this.isDragging = true;
      this.dragPointer = p;
      this.canvas.setPointerCapture(event.pointerId);
    }

    handlePointerMove(event) {
      if (!this.isDragging || event.pointerId !== this.pointerId || !this.currentBody) {
        return;
      }
      const p = this.getPointerPosition(event);
      const radius = getDrinkById(this.currentBody.plugin.tasty.tierId).radius;

      // Keep drag movement in the launch area below the line for slingshot feel.
      const clamped = {
        x: Math.min(this.bounds.tableRight - radius, Math.max(this.bounds.tableLeft + radius, p.x)),
        y: Math.min(this.bounds.height - radius - 8, Math.max(this.bounds.launchLineY + 6, p.y)),
      };
      this.dragPointer = clamped;
      Body.setPosition(this.currentBody, clamped);
      Body.setVelocity(this.currentBody, { x: 0, y: 0 });
      Body.setAngularVelocity(this.currentBody, 0);
    }

    handlePointerUp(event) {
      if (!this.isDragging || event.pointerId !== this.pointerId || !this.currentBody) {
        return;
      }
      this.isDragging = false;
      this.pointerId = null;

      const currentPos = this.currentBody.position;
      const pull = Vector.sub(this.spawnPoint, currentPos);
      const pullMagnitude = Vector.magnitude(pull);

      if (pullMagnitude < GAME_CONFIG.launchMinPull) {
        Body.setPosition(this.currentBody, this.spawnPoint);
        return;
      }

      const launchDirection = Vector.normalise(pull);
      const launchSpeed = Math.min(pullMagnitude * GAME_CONFIG.launchVelocityScale, GAME_CONFIG.maxLaunchSpeed);
      const launchVelocity = Vector.mult(launchDirection, launchSpeed);

      this.currentBody.isSensor = false;
      Body.setStatic(this.currentBody, false);
      this.currentBody.plugin.tasty.launched = true;
      Body.setVelocity(this.currentBody, launchVelocity);
      Body.setAngularVelocity(this.currentBody, (Math.random() - 0.5) * 0.04);
      this.audio.playSlideWhoosh(launchSpeed / GAME_CONFIG.maxLaunchSpeed);

      this.currentBody = null;
      this.spawnCooldown = GAME_CONFIG.launchSpawnCooldownMs;
    }

    queueMergeIfValid(bodyA, bodyB) {
      if (!bodyA || !bodyB || bodyA.label !== "drink" || bodyB.label !== "drink") {
        return;
      }

      const a = bodyA.plugin.tasty;
      const b = bodyB.plugin.tasty;
      if (!a || !b || !a.launched || !b.launched || a.merging || b.merging || a.tierId !== b.tierId) {
        return;
      }

      const sourceDrink = getDrinkById(a.tierId);
      if (!sourceDrink.mergesIntoId) {
        return;
      }

      const pairKey = bodyA.id < bodyB.id ? `${bodyA.id}-${bodyB.id}` : `${bodyB.id}-${bodyA.id}`;
      if (this.pendingMergePairs.has(pairKey)) {
        return;
      }

      this.pendingMergePairs.add(pairKey);
      this.pendingMerges.push({ pairKey, aId: bodyA.id, bId: bodyB.id });
    }

    processPendingMerges() {
      while (this.pendingMerges.length > 0) {
        const candidate = this.pendingMerges.shift();
        this.pendingMergePairs.delete(candidate.pairKey);

        const bodyA = this.drinkBodies.get(candidate.aId);
        const bodyB = this.drinkBodies.get(candidate.bId);
        if (!bodyA || !bodyB) {
          continue;
        }

        const metaA = bodyA.plugin.tasty;
        const metaB = bodyB.plugin.tasty;
        if (!metaA || !metaB || metaA.merging || metaB.merging || metaA.tierId !== metaB.tierId) {
          continue;
        }

        const baseDrink = getDrinkById(metaA.tierId);
        if (!baseDrink.mergesIntoId) {
          continue;
        }

        metaA.merging = true;
        metaB.merging = true;

        const midpoint = {
          x: (bodyA.position.x + bodyB.position.x) * 0.5,
          y: (bodyA.position.y + bodyB.position.y) * 0.5,
        };
        const blendedVelocity = {
          x: (bodyA.velocity.x + bodyB.velocity.x) * 0.26,
          y: (bodyA.velocity.y + bodyB.velocity.y) * 0.26,
        };

        World.remove(this.world, [bodyA, bodyB]);
        this.drinkBodies.delete(bodyA.id);
        this.drinkBodies.delete(bodyB.id);

        const nextTier = baseDrink.mergesIntoId;
        const mergedBody = this.spawnDrinkBody({
          tierId: nextTier,
          x: midpoint.x,
          y: midpoint.y,
          launched: true,
          popScale: 1.28,
        });
        Body.setVelocity(mergedBody, blendedVelocity);

        const mergeCoins = GAME_CONFIG.mergeCoinBase + metaA.tierId * 4;
        this.addCoins(mergeCoins, midpoint.x, midpoint.y - 8);
        this.audio.playMerge(nextTier);
        this.emitMergeParticles(midpoint.x, midpoint.y, getDrinkById(nextTier).color);

        if (this.activeOrder && nextTier === this.activeOrder.targetId) {
          this.completeOrder(midpoint.x, midpoint.y);
        }
      }
    }

    emitMergeParticles(x, y, color) {
      for (let i = 0; i < 14; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.6 + Math.random() * 2.2;
        this.mergeParticles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 520 + Math.random() * 240,
          age: 0,
          color,
          size: 3 + Math.random() * 3,
        });
      }
    }

    loop(nowMs) {
      const deltaMs = Math.min(36, nowMs - this.lastFrameMs || GAME_CONFIG.fixedTimeStepMs);
      this.lastFrameMs = nowMs;
      this.loopAccumulator += deltaMs;

      while (this.loopAccumulator >= GAME_CONFIG.fixedTimeStepMs) {
        this.update(GAME_CONFIG.fixedTimeStepMs, nowMs);
        this.loopAccumulator -= GAME_CONFIG.fixedTimeStepMs;
      }

      this.render(nowMs);
      this.frameRequest = requestAnimationFrame((time) => this.loop(time));
    }

    update(stepMs, nowMs) {
      if (!this.gameOver) {
        if (!this.currentBody && this.spawnCooldown > 0) {
          this.spawnCooldown -= stepMs;
          if (this.spawnCooldown <= 0) {
            this.spawnCurrentDrink();
          }
        }

        this.processPendingMerges();
        Engine.update(this.engine, stepMs);
      }

      this.updateDrinkAnimations();
      this.updateDangerState(stepMs);
      this.updateSparkles(stepMs, nowMs);
      this.updateMergeParticles(stepMs);
    }

    updateDrinkAnimations() {
      for (const body of this.drinkBodies.values()) {
        const meta = body.plugin.tasty;
        if (!meta) {
          continue;
        }
        if (meta.popScale > 1.001) {
          meta.popScale += (1 - meta.popScale) * 0.22;
        }
        if (meta.launched && body.speed < 0.024) {
          Body.setVelocity(body, { x: 0, y: 0 });
          Body.setAngularVelocity(body, 0);
        }
      }
    }

    updateDangerState(stepMs) {
      if (this.gameOver) {
        return;
      }
      let restingAboveDanger = 0;
      for (const body of this.drinkBodies.values()) {
        const meta = body.plugin.tasty;
        if (!meta || !meta.launched) {
          continue;
        }
        const radius = getDrinkById(meta.tierId).radius;
        if (body.position.y - radius < this.bounds.dangerLineY && body.speed < 0.42) {
          restingAboveDanger += 1;
        }
      }

      if (restingAboveDanger > 0) {
        this.dangerTimer += stepMs;
      } else {
        this.dangerTimer = Math.max(0, this.dangerTimer - stepMs * 1.6);
      }

      if (this.dangerTimer >= GAME_CONFIG.dangerTimeoutMs) {
        this.gameOver = true;
        this.ui.showGameOver(true);
      }
    }

    updateSparkles(stepMs, nowMs) {
      if (nowMs - this.lastSparkleSpawn > GAME_CONFIG.sparkleSpawnRateMs) {
        this.lastSparkleSpawn = nowMs;
        this.sparkles.push({
          x: Math.random() * this.bounds.width,
          y: this.bounds.height * (0.06 + Math.random() * 0.3),
          vy: -0.04 - Math.random() * 0.06,
          life: 1800 + Math.random() * 1600,
          age: 0,
          size: 1.8 + Math.random() * 2.3,
          alpha: 0.2 + Math.random() * 0.45,
        });
      }

      this.fireworkTimer -= stepMs;
      if (this.fireworkTimer <= 0) {
        this.fireworkTimer = 1200 + Math.random() * 1600;
        const centerX = this.bounds.width * (0.18 + Math.random() * 0.64);
        const centerY = this.bounds.height * (0.08 + Math.random() * 0.2);
        const color = ["#fff7a6", "#f6b4ff", "#8fe8ff", "#ffd78a"][Math.floor(Math.random() * 4)];
        for (let i = 0; i < 12; i += 1) {
          const angle = (Math.PI * 2 * i) / 12;
          const speed = 0.5 + Math.random() * 1.2;
          this.sparkles.push({
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1000 + Math.random() * 500,
            age: 0,
            size: 2 + Math.random() * 2.5,
            alpha: 0.48,
            color,
          });
        }
      }

      this.sparkles = this.sparkles.filter((sparkle) => {
        sparkle.age += stepMs;
        sparkle.x += sparkle.vx || 0;
        sparkle.y += sparkle.vy || 0;
        return sparkle.age < sparkle.life;
      });
    }

    updateMergeParticles(stepMs) {
      this.mergeParticles = this.mergeParticles.filter((particle) => {
        particle.age += stepMs;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.96;
        particle.vy *= 0.96;
        return particle.age < particle.life;
      });
    }

    render(nowMs) {
      const ctx = this.ctx;
      const b = this.bounds;

      ctx.clearRect(0, 0, b.width, b.height);
      this.drawBeachBackground(ctx, b, nowMs);
      this.drawTable(ctx, b, nowMs);
      this.drawGuideLines(ctx, b);
      this.drawDrinks(ctx, nowMs);
      this.drawAimPreview(ctx);
      this.drawSparkles(ctx);
      this.drawMergeParticles(ctx);
    }

    drawBeachBackground(ctx, b, nowMs) {
      const skyGradient = ctx.createLinearGradient(0, 0, 0, b.height * 0.5);
      skyGradient.addColorStop(0, "#9de8ff");
      skyGradient.addColorStop(1, "#52bef6");
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, b.width, b.height * 0.5);

      ctx.fillStyle = "#1b9ddb";
      ctx.fillRect(0, b.height * 0.41, b.width, b.height * 0.1);
      ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
      ctx.fillRect(0, b.height * 0.435 + Math.sin(nowMs * 0.002) * 2, b.width, 4);

      const sandGradient = ctx.createLinearGradient(0, b.height * 0.5, 0, b.height);
      sandGradient.addColorStop(0, "#f5e29d");
      sandGradient.addColorStop(1, "#efc87e");
      ctx.fillStyle = sandGradient;
      ctx.fillRect(0, b.height * 0.5, b.width, b.height * 0.5);
    }

    drawTable(ctx, b, nowMs) {
      const insetTop = b.width * 0.12;
      const insetBottom = b.width * 0.03;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(insetTop, b.tableTop);
      ctx.lineTo(b.width - insetTop, b.tableTop);
      ctx.lineTo(b.width - insetBottom, b.tableBottom);
      ctx.lineTo(insetBottom, b.tableBottom);
      ctx.closePath();

      const woodGradient = ctx.createLinearGradient(0, b.tableTop, 0, b.tableBottom);
      woodGradient.addColorStop(0, "#e5b36e");
      woodGradient.addColorStop(1, "#b27a43");
      ctx.fillStyle = woodGradient;
      ctx.shadowColor = "rgba(60, 24, 2, 0.35)";
      ctx.shadowBlur = 16;
      ctx.fill();

      ctx.clip();
      ctx.shadowBlur = 0;

      // Draw plank lines with slight motion for lively texture.
      for (let i = 0; i < 14; i += 1) {
        const y = b.tableTop + (i / 14) * (b.tableBottom - b.tableTop);
        ctx.strokeStyle = i % 2 === 0 ? "rgba(128, 76, 37, 0.4)" : "rgba(245, 207, 152, 0.22)";
        ctx.lineWidth = 2 + (i % 3 === 0 ? 1 : 0);
        ctx.beginPath();
        ctx.moveTo(0, y + Math.sin(nowMs * 0.001 + i) * 0.8);
        ctx.lineTo(b.width, y + Math.sin(nowMs * 0.001 + i) * 0.8);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawGuideLines(ctx, b) {
      ctx.save();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.88)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(b.tableLeft + 14, b.launchLineY);
      ctx.lineTo(b.tableRight - 14, b.launchLineY);
      ctx.stroke();

      const dangerAlpha = 0.26 + Math.min(0.65, this.dangerTimer / GAME_CONFIG.dangerTimeoutMs);
      ctx.strokeStyle = `rgba(246, 76, 79, ${dangerAlpha.toFixed(3)})`;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(b.tableLeft + 10, b.dangerLineY);
      ctx.lineTo(b.tableRight - 10, b.dangerLineY);
      ctx.stroke();
      ctx.restore();
    }

    drawDrinks(ctx, nowMs) {
      for (const body of this.drinkBodies.values()) {
        const meta = body.plugin.tasty;
        if (!meta) {
          continue;
        }
        const drink = getDrinkById(meta.tierId);

        const restingBob = meta.launched && body.speed < 0.12 ? Math.sin(nowMs * 0.002 + meta.bobSeed) * 1.8 : 0;
        const x = body.position.x;
        const y = body.position.y + restingBob;
        const angle = body.angle;
        const scale = meta.popScale;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.scale(scale, scale);

        // Soft shadow to lift each glass from the table surface.
        ctx.fillStyle = "rgba(38, 20, 11, 0.22)";
        ctx.beginPath();
        ctx.ellipse(0, drink.radius * 0.45, drink.radius * 0.9, drink.radius * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();

        const fill = ctx.createRadialGradient(-drink.radius * 0.35, -drink.radius * 0.4, 2, 0, 0, drink.radius);
        fill.addColorStop(0, "#ffffff");
        fill.addColorStop(0.18, drink.color);
        fill.addColorStop(1, this.shadeColor(drink.color, -24));

        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(0, 0, drink.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
        ctx.stroke();

        ctx.font = `${Math.max(16, drink.radius)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(drink.sprite, 0, 0);

        ctx.restore();
      }
    }

    drawAimPreview(ctx) {
      if (!this.isDragging || !this.currentBody) {
        return;
      }
      const currentPos = this.currentBody.position;
      const pull = Vector.sub(this.spawnPoint, currentPos);
      const pullMagnitude = Vector.magnitude(pull);
      if (pullMagnitude < 4) {
        return;
      }

      const direction = Vector.normalise(pull);
      const projectedDistance = Math.min(220, pullMagnitude * 1.55);
      const start = currentPos;
      const end = Vector.add(start, Vector.mult(direction, projectedDistance));
      const powerRatio = Math.min(1, pullMagnitude / 170);

      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.lineWidth = 2 + powerRatio * 2;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 249, 210, 0.95)";
      for (let i = 1; i <= 5; i += 1) {
        const t = i / 5;
        const p = Vector.add(start, Vector.mult(direction, projectedDistance * t));
        ctx.globalAlpha = 1 - t * 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 + (1 - t) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    drawSparkles(ctx) {
      for (const sparkle of this.sparkles) {
        const lifeRatio = 1 - sparkle.age / sparkle.life;
        ctx.globalAlpha = Math.max(0, lifeRatio) * (sparkle.alpha || 0.35);
        ctx.fillStyle = sparkle.color || "#ffffff";
        ctx.beginPath();
        ctx.arc(sparkle.x, sparkle.y, sparkle.size * lifeRatio, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    drawMergeParticles(ctx) {
      for (const particle of this.mergeParticles) {
        const ratio = 1 - particle.age / particle.life;
        ctx.globalAlpha = Math.max(0, ratio);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * ratio, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    shadeColor(hexColor, percent) {
      const cleanHex = hexColor.replace("#", "");
      const num = parseInt(cleanHex, 16);
      const amt = Math.round(2.55 * percent);
      const r = Math.min(255, Math.max(0, (num >> 16) + amt));
      const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt));
      const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amt));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  function bootGame() {
    const canvas = document.getElementById("game-canvas");
    if (!canvas) {
      return;
    }
    const game = new TastyTravelsGame(canvas);
    window.tastyTravelsGame = game;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootGame);
  } else {
    bootGame();
  }
})();
