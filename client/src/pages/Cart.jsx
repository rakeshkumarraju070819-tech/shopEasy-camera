import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import ProductImage from '../components/ProductImage';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../data/products';

const FREE_SHIPPING_AT = 50;

export default function Cart() {
  const { lines, subtotal, setQty, remove, clear } = useCart();
  const [placed, setPlaced] = useState(false);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_AT ? 0 : 4.99;

  if (placed) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center" role="status">
        <CheckCircle2 size={56} className="mx-auto text-emerald-600" />
        <h1 className="mt-4 text-3xl font-extrabold">Thanks for trying the demo</h1>
        <p className="mt-2 text-navy-500">This is a demo store, so no payment was taken and no order was placed.</p>
        <Link to="/" className="mt-6 inline-block rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">Back to the store</Link>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <ShoppingCart size={52} className="mx-auto text-navy-300" />
        <h1 className="mt-4 text-3xl font-extrabold">Your cart is empty</h1>
        <p className="mt-2 text-navy-500">Add something you like and it will show up here.</p>
        <Link to="/store" className="mt-6 inline-block rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700">Start shopping</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-extrabold">Shopping cart</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        <ul className="divide-y divide-line rounded-2xl border border-line lg:col-span-2">
          {lines.map(({ product: p, qty }) => (
            <li key={p.id} className="flex gap-4 p-4 sm:p-5">
              <Link to={`/product/${p.id}`} className="shrink-0"><ProductImage product={p} iconSize={36} className="size-24 rounded-xl" /></Link>
              <div className="flex flex-1 flex-col">
                <div className="flex justify-between gap-3">
                  <Link to={`/product/${p.id}`} className="font-semibold hover:text-brand-600">{p.name}</Link>
                  <span className="font-extrabold">{formatPrice(p.price * qty)}</span>
                </div>
                <span className="text-sm text-navy-500">{formatPrice(p.price)} each</span>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <div className="flex items-center rounded-lg border border-line" role="group" aria-label={`Quantity for ${p.name}`}>
                    <button onClick={() => setQty(p.id, qty - 1)} aria-label="Decrease quantity" className="p-2 hover:text-brand-600"><Minus size={14} /></button>
                    <span className="w-7 text-center text-sm font-semibold">{qty}</span>
                    <button onClick={() => setQty(p.id, qty + 1)} aria-label="Increase quantity" className="p-2 hover:text-brand-600"><Plus size={14} /></button>
                  </div>
                  <button onClick={() => remove(p.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-500 hover:text-red-600"><Trash2 size={15} /> Remove</button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="h-fit rounded-2xl border border-line bg-sky-50 p-6">
          <h2 className="text-lg font-extrabold">Order summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-semibold">{formatPrice(subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Delivery</dt><dd className="font-semibold">{shipping ? formatPrice(shipping) : 'Free'}</dd></div>
            <div className="flex justify-between border-t border-line pt-3 text-base"><dt className="font-bold">Total</dt><dd className="font-extrabold">{formatPrice(subtotal + shipping)}</dd></div>
          </dl>
          {shipping > 0 && <p className="mt-3 text-xs text-navy-500">Add {formatPrice(FREE_SHIPPING_AT - subtotal)} more for free delivery.</p>}
          <button onClick={() => { clear(); setPlaced(true); }} className="mt-5 w-full rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">Place demo order</button>
          <Link to="/store" className="mt-3 block text-center text-sm font-semibold text-brand-600 hover:text-brand-700">Continue shopping</Link>
        </aside>
      </div>
    </div>
  );
}
