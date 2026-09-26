import {
  Tag, Sandwich, Soup, Flame, CookingPot, Pizza, CupSoda, Coffee, Cake, IceCreamCone, ShoppingBasket, Apple, Beef, Fish, Salad,
  Candy, Milk, Wheat, Egg, Package, Croissant, Drumstick, Popcorn, Cookie, Carrot, Shirt, Pill, Sparkles, Store, Utensils,
  GlassWater, Citrus, Donut, Hamburger, EggFried, Cherry,
} from 'lucide-react';

export const CATEGORY_ICONS = {
  tag: Tag, hamburger: Hamburger, sandwich: Sandwich, pizza: Pizza, drumstick: Drumstick, beef: Beef, fish: Fish, flame: Flame,
  'cooking-pot': CookingPot, soup: Soup, 'egg-fried': EggFried, salad: Salad, utensils: Utensils, 'cup-soda': CupSoda,
  'glass-water': GlassWater, coffee: Coffee, milk: Milk, citrus: Citrus, cake: Cake, croissant: Croissant, donut: Donut,
  cookie: Cookie, 'ice-cream': IceCreamCone, candy: Candy, popcorn: Popcorn, apple: Apple, cherry: Cherry, carrot: Carrot,
  wheat: Wheat, egg: Egg, 'shopping-basket': ShoppingBasket, package: Package, store: Store, shirt: Shirt, pill: Pill, sparkles: Sparkles,
};

export function CategoryIcon({ name, ...props }) {
  const Icon = CATEGORY_ICONS[name] || Tag;
  return <Icon {...props} />;
}

export const CATEGORY_COLORS = ['#4f46e5', '#7c3aed', '#db2777', '#dc2626', '#f97316', '#eab308', '#16a34a', '#0d9488', '#0ea5e9', '#2563eb', '#64748b', '#78350f'];
