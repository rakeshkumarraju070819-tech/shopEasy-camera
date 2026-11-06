import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ShoppingCart, Star } from 'lucide-react';
import ProductImage from './ProductImage';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../data/products';

export function Stars({ rating = 0, reviews }) {
  const safeRating = Number.isFinite(Number(rating)) ? Number(rating) : 0;
  return (
    <div className="flex items-center gap-1 text-xs text-navy-500" aria-label={`Rated ${safeRating.toFixed(1)} out of 5`}>
      <Star size={14} className="fill-deal text-deal" aria-hidden="true" />
      <span className="font-semibold text-navy-900">{safeRating.toFixed(1)}</span>
      {reviews != null && <span>({reviews.toLocaleString()})</span>}
    </div>
  );
}

export default function ProductCard({ product }) {
  if (!product) return null;

  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const off = (product.oldPrice && product.price) ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;

  const handleAdd = () => {
    if (!product?.id) return;
    add(product.id);
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white transition-shadow hover:shadow-[0_14px_34px_-18px_rgba(11,31,58,.35)]">
      <Link to={`/product/${product.id}`} className="relative block" aria-label={`View ${product.name}`}>
        <ProductImage product={product} className="aspect-[4/3] w-full" />
        {product.badge && (
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold ${product.badge === 'Deal' ? 'bg-deal text-navy-950' : 'bg-navy-900 text-white'}`}>
            {product.badge === 'Deal' && off ? `${off}% off` : product.badge}
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Link to={`/product/${product.id}`} className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-navy-900 hover:text-brand-600">
          {product.name}
        </Link>
        <Stars rating={product.rating} reviews={product.reviews} />
        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="text-lg font-extrabold">{formatPrice(product.price)}</span>
          {product.oldPrice && <span className="text-sm text-navy-300 line-through">{formatPrice(product.oldPrice)}</span>}
        </div>
        <button onClick={handleAdd}
          className={`mt-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${added ? 'bg-emerald-600 text-white' : 'bg-brand-600 text-white hover:bg-brand-700'}`}>
          {added ? <Check size={16} /> : <ShoppingCart size={16} />}
          <span aria-live="polite">{added ? 'Added to cart' : 'Add to Cart'}</span>
        </button>
      </div>
    </article>
  );
}
