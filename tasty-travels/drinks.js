(function () {
  "use strict";

  /**
   * Primary tier config for all drinks.
   * You can tweak radius values and merge chains here without touching gameplay code.
   */
  const DRINKS = [
    { id: 1, name: "Iced Tea", radius: 20, sprite: "🧋", color: "#8d5b3e", mergesIntoId: 2 },
    { id: 2, name: "Lemonade", radius: 22, sprite: "🍋", color: "#f5d545", mergesIntoId: 3 },
    { id: 3, name: "Mojito", radius: 24, sprite: "🍃", color: "#48bf6f", mergesIntoId: 4 },
    { id: 4, name: "Sorbet Cup", radius: 26, sprite: "🍨", color: "#f497cf", mergesIntoId: 5 },
    { id: 5, name: "Mango Smoothie", radius: 28, sprite: "🥭", color: "#f7923f", mergesIntoId: 6 },
    { id: 6, name: "Mint Cooler", radius: 30, sprite: "🫒", color: "#36b970", mergesIntoId: 7 },
    { id: 7, name: "Berry Cocktail", radius: 32, sprite: "🍓", color: "#eb6cb2", mergesIntoId: 8 },
    { id: 8, name: "Blue Lagoon", radius: 34, sprite: "🫐", color: "#4d9ff7", mergesIntoId: 9 },
    { id: 9, name: "Strawberry Shake", radius: 36, sprite: "🥤", color: "#f97ba6", mergesIntoId: 10 },
    { id: 10, name: "Tropical Pitcher", radius: 40, sprite: "🍹", color: "#ff9548", mergesIntoId: null },
  ];

  const DRINK_BY_ID = new Map(DRINKS.map((drink) => [drink.id, drink]));

  function getDrinkById(id) {
    return DRINK_BY_ID.get(id) || DRINKS[0];
  }

  window.TastyDrinks = {
    DRINKS,
    DRINK_BY_ID,
    getDrinkById,
    MAX_TIER_ID: DRINKS[DRINKS.length - 1].id,
  };
})();
