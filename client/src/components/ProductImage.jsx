import { useState } from 'react';
import {
  Backpack, BatteryCharging, BookOpen, Coffee, CupSoda, Dumbbell, Footprints, Glasses, Headphones,
  Lamp, Laptop, NotebookPen, Package, Shirt, Sofa, Sparkles, Speaker, Watch, Wind
} from 'lucide-react';

const ICONS = { Backpack, BatteryCharging, BookOpen, Coffee, CupSoda, Dumbbell, Footprints, Glasses, Headphones,
  Lamp, Laptop, NotebookPen, Package, Shirt, Sofa, Sparkles, Speaker, Watch, Wind };

/** Product art: a real photo when `image` is set, otherwise a generated illustration tile. */
export default function ProductImage({ product, className = '', iconSize = 72 }) {
  const [failed, setFailed] = useState(false);

  if (!product) {
    return <div className={`bg-slate-100 ${className}`} aria-hidden="true" />;
  }

  const Icon = ICONS[product.icon] || Package;
  const h = product.hue ?? 214;

  if (product.image && !failed) {
    return (
      <img
        src={product.image}
        alt={product.name || 'Product image'}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`object-contain bg-white ${className}`}
      />
    );
  }
  return (
    <div role="img" aria-label={product.name || 'Product'} className={`relative grid place-items-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(145deg, hsl(${h} 90% 97%), hsl(${h} 85% 88%))` }}>
      <span className="absolute -right-6 -top-6 size-28 rounded-full" style={{ background: `hsl(${h} 85% 82% / .55)` }} />
      <span className="absolute -bottom-8 -left-6 size-32 rounded-full" style={{ background: `hsl(${h} 90% 92% / .9)` }} />
      <span className="relative grid size-[62%] max-w-40 aspect-square place-items-center rounded-3xl bg-white/80 shadow-[0_10px_30px_-12px_hsl(0_0%_0%/.25)]">
        <Icon size={iconSize} strokeWidth={1.5} style={{ color: `hsl(${h} 60% 32%)` }} />
      </span>
    </div>
  );
}
