import { useState } from 'react';
import {
  AirVent,
  Cable,
  Camera,
  Headphones,
  Laptop,
  Package,
  Refrigerator,
  Smartphone,
  Speaker,
  Tv,
  UtensilsCrossed,
  Watch,
  WashingMachine,
} from 'lucide-react';

/** All icon names referenced in products.js */
const ICONS = {
  AirVent,
  Cable,
  Camera,
  Headphones,
  Laptop,
  Package,
  Refrigerator,
  Smartphone,
  Speaker,
  Tv,
  UtensilsCrossed,
  Watch,
  WashingMachine,
};

/** Fallback image shown when the product photo fails to load */
const FALLBACK =
  'https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=600&q=60&auto=format&fit=crop';

/**
 * Product image with three render modes:
 * 1. Real photo from `product.image` URL
 * 2. Fallback photo (FALLBACK constant) if photo fails to load
 * 3. Generated illustration tile using the icon + hue (last resort)
 */
export default function ProductImage({ product, className = '', iconSize = 72 }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  const Icon = ICONS[product.icon] || Package;
  const h = product.hue ?? 214;

  // 1. Real product photo
  if (product.image && !photoFailed) {
    return (
      <img
        src={product.image}
        alt={product.name}
        loading="lazy"
        onError={() => setPhotoFailed(true)}
        className={`object-cover ${className}`}
      />
    );
  }

  // 2. Generic fallback photo
  if (!fallbackFailed) {
    return (
      <img
        src={FALLBACK}
        alt={product.name}
        loading="lazy"
        onError={() => setFallbackFailed(true)}
        className={`object-cover ${className}`}
      />
    );
  }

  // 3. Generated illustration (offline / both images failed)
  return (
    <div
      role="img"
      aria-label={product.name}
      className={`relative grid place-items-center overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(145deg, hsl(${h} 90% 97%), hsl(${h} 85% 88%))`,
      }}
    >
      <span
        className="absolute -right-6 -top-6 size-28 rounded-full"
        style={{ background: `hsl(${h} 85% 82% / .55)` }}
      />
      <span
        className="absolute -bottom-8 -left-6 size-32 rounded-full"
        style={{ background: `hsl(${h} 90% 92% / .9)` }}
      />
      <span className="relative grid size-[62%] max-w-40 aspect-square place-items-center rounded-3xl bg-white/80 shadow-[0_10px_30px_-12px_hsl(0_0%_0%/.25)]">
        <Icon size={iconSize} strokeWidth={1.5} style={{ color: `hsl(${h} 60% 32%)` }} />
      </span>
    </div>
  );
}
