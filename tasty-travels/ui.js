(function () {
  "use strict";

  class TastyUIController {
    constructor(drinks) {
      this.drinks = drinks;
      this.coinCountEl = document.getElementById("coin-count");
      this.orderNameEl = document.getElementById("order-name");
      this.orderSpriteEl = document.getElementById("order-sprite");
      this.orderRewardEl = document.getElementById("order-reward");
      this.nextPreviewEl = document.getElementById("next-preview");
      this.collectionRowEl = document.getElementById("collection-row");
      this.floatingTextLayerEl = document.getElementById("floating-text-layer");
      this.openStoreBtn = document.getElementById("open-store-btn");
      this.settingsBtn = document.getElementById("settings-btn");
      this.gameOverOverlayEl = document.getElementById("game-over-overlay");
      this.restartBtn = document.getElementById("restart-btn");
      this.collectionNodes = new Map();

      this.initializeCollection();
    }

    initializeCollection() {
      const fragment = document.createDocumentFragment();
      this.drinks.forEach((drink) => {
        const node = document.createElement("div");
        node.className = "collection-item locked";
        node.dataset.drinkId = String(drink.id);
        node.title = `Tier ${drink.id}: ${drink.name}`;
        node.textContent = drink.sprite;
        this.collectionNodes.set(drink.id, node);
        fragment.appendChild(node);
      });
      this.collectionRowEl.appendChild(fragment);
    }

    setCoins(value) {
      this.coinCountEl.textContent = String(value);
    }

    setNextDrink(drink) {
      this.nextPreviewEl.textContent = drink.sprite;
      this.nextPreviewEl.title = drink.name;
    }

    setOrder(order) {
      this.orderNameEl.textContent = order.target.name;
      this.orderSpriteEl.textContent = order.target.sprite;
      this.orderRewardEl.textContent = `+${order.reward} coins`;
    }

    setCollection(discoveredIds) {
      this.collectionNodes.forEach((node, drinkId) => {
        node.classList.toggle("locked", !discoveredIds.has(drinkId));
      });
    }

    showFloatingText(message, x, y) {
      const textEl = document.createElement("div");
      textEl.className = "floating-text";
      textEl.textContent = message;
      textEl.style.left = `${x}px`;
      textEl.style.top = `${y}px`;
      this.floatingTextLayerEl.appendChild(textEl);
      setTimeout(() => textEl.remove(), 900);
    }

    showGameOver(visible) {
      this.gameOverOverlayEl.classList.toggle("hidden", !visible);
    }

    bindStoreButton(handler) {
      this.openStoreBtn.addEventListener("click", handler);
    }

    bindSettingsButton(handler) {
      this.settingsBtn.addEventListener("click", handler);
    }

    bindRestart(handler) {
      this.restartBtn.addEventListener("click", handler);
    }
  }

  window.TastyUI = {
    TastyUIController,
  };
})();
