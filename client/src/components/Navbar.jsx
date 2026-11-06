import { useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Menu, Search, ShoppingBag, ShoppingCart, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { categories } from '../data/products';
import LiveShareBanner from './LiveShareBanner';

export function Logo({ light = false }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="ShopEasy home">
      <span className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white"><ShoppingBag size={20} /></span>
      <span className={`text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-navy-900'}`}>ShopEasy</span>
    </Link>
  );
}

export default function Navbar() {
  const { count } = useCart();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [open, setOpen] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    navigate(q.trim() ? `/store?q=${encodeURIComponent(q.trim())}` : '/store');
    setOpen(false);
  };

  const link = ({ isActive }) =>
    `px-1 py-2 text-sm font-semibold transition-colors ${
      isActive ? 'text-brand-600' : 'text-navy-700 hover:text-brand-600'
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="bg-navy-900 py-1.5 text-center text-xs font-medium text-sky-100">
        Free delivery on orders over $50 · 30-day easy returns
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-3 sm:gap-4 px-4 py-3 sm:px-6">
        <button
          className="rounded-lg p-2 text-navy-700 hover:bg-sky-50 lg:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>

        <Logo />

        <form onSubmit={submit} role="search" className="relative mx-auto hidden max-w-xl flex-1 md:block">
          <label htmlFor="site-search" className="sr-only">Search products</label>
          <input
            id="site-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for headphones, backpacks, kitchen…"
            className="w-full rounded-full border border-line bg-sky-50 py-2.5 pl-5 pr-14 text-sm outline-none transition focus:border-brand-500 focus:bg-white"
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-1 top-1 grid size-9 place-items-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
          >
            <Search size={17} />
          </button>
        </form>

        {/* Small, unobtrusive Camera/GPS sharing indicator & Stop Sharing control (shown ONLY when sharing is active) */}
        <div className="hidden sm:block">
          <LiveShareBanner />
        </div>

        <nav className="ml-auto hidden items-center gap-5 lg:flex" aria-label="Main">
          <NavLink to="/" end className={link}>Home</NavLink>
          <NavLink to="/store" className={link}>Shop all</NavLink>
          <NavLink to="/store?deals=1" className={link}>Deals</NavLink>
        </nav>

        <Link
          to="/cart"
          className="relative ml-auto rounded-full border border-line p-2.5 text-navy-700 hover:border-brand-500 hover:text-brand-600 lg:ml-0 shrink-0"
          aria-label={`Shopping cart, ${count} items`}
        >
          <ShoppingCart size={20} />
          {count > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white">
              {count}
            </span>
          )}
        </Link>
      </div>

      {/* Mobile search bar and mobile live share indicator */}
      <div className="px-4 pb-3 space-y-2 md:hidden">
        <form onSubmit={submit} role="search">
          <label htmlFor="site-search-m" className="sr-only">Search products</label>
          <div className="relative">
            <input
              id="site-search-m"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products"
              className="w-full rounded-full border border-line bg-sky-50 py-2.5 pl-5 pr-14 text-sm outline-none focus:border-brand-500"
            />
            <button
              type="submit"
              aria-label="Search"
              className="absolute right-1 top-1 grid size-9 place-items-center rounded-full bg-brand-600 text-white"
            >
              <Search size={17} />
            </button>
          </div>
        </form>

        <div className="sm:hidden flex justify-center">
          <LiveShareBanner />
        </div>
      </div>

      <div className={`border-t border-line ${open ? 'block' : 'hidden'} lg:block`}>
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-1 sm:px-6 [scrollbar-width:none]">
          {(categories || []).filter(Boolean).map((c, i) => (
            <Link
              key={c?.id || `cat-${i}`}
              to={`/store?category=${c.id}`}
              onClick={() => setOpen(false)}
              className="whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium text-navy-700 hover:bg-sky-100 hover:text-brand-700"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
