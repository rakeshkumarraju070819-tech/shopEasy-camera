import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Minus, Plus, RotateCcw, ShoppingCart, Truck } from 'lucide-react';
import ProductImage from '../components/ProductImage';
import ProductCard, { Stars } from '../components/ProductCard';
import { useCart } from '../context/CartContext';
import { categories, formatPrice, getProduct, products } from '../data/products';

export default function ProductDetails() {
  const { id } = useParams();
  const product = getProduct(id);
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  if (!product) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold">We couldn’t find that product</h1>
        <p className="mt-2 text-navy-500">It may have been removed or the link is incorrect.</p>
        <Link to="/store" className="mt-6 inline-block rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white">Browse all products</Link>
      </div>
    );
  }

  const cat = categories.find((c) => c.id === product.category);
  const related = products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);
  const handleAdd = () => { add(product.id, qty); setAdded(true); setTimeout(() => setAdded(false), 1500); };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav className="text-sm text-navy-500" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-brand-600">Home</Link> / <Link to={`/store?category=${product.category}`} className="hover:text-brand-600">{cat?.name}</Link> / <span className="text-navy-900">{product.name}</span>
      </nav>
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <ProductImage product={product} iconSize={120} className="aspect-square w-full rounded-3xl" />
        <div>
          <h1 className="text-3xl font-extrabold leading-tight">{product.name}</h1>
          <div className="mt-3"><Stars rating={product.rating} reviews={product.reviews} /></div>
          <div className="mt-5 flex items-baseline gap-3">
            <span className="text-4xl font-extrabold">{formatPrice(product.price)}</span>
            {product.oldPrice && <span className="text-lg text-navy-300 line-through">{formatPrice(product.oldPrice)}</span>}
          </div>
          <p className="mt-5 max-w-prose leading-relaxed text-navy-700">{product.description}</p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <div className="flex items-center rounded-xl border border-line" role="group" aria-label="Quantity">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="p-3 hover:text-brand-600"><Minus size={16} /></button>
              <span className="w-8 text-center font-semibold" aria-live="polite">{qty}</span>
              <button onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="Increase quantity" className="p-3 hover:text-brand-600"><Plus size={16} /></button>
            </div>
            <button onClick={handleAdd} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-3.5 font-semibold text-white sm:flex-none ${added ? 'bg-emerald-600' : 'bg-brand-600 hover:bg-brand-700'}`}>
              {added ? <Check size={18} /> : <ShoppingCart size={18} />} {added ? 'Added to cart' : 'Add to Cart'}
            </button>
          </div>

          <ul className="mt-8 space-y-3 text-sm text-navy-700">
            <li className="flex items-center gap-3"><Truck size={18} className="text-brand-600" /> Free delivery on orders over ₹500</li>
            <li className="flex items-center gap-3"><RotateCcw size={18} className="text-brand-600" /> 10-day easy returns</li>
          </ul>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16" aria-labelledby="related">
          <h2 id="related" className="text-2xl font-extrabold">You might also like</h2>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
