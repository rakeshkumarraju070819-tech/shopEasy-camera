import { Link } from 'react-router-dom';
import { ArrowRight, Headphones, RotateCcw, ShieldCheck, Truck, Wallet } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import ProductImage from '../components/ProductImage';
import { categories, getProduct, products } from '../data/products';
import { ICONS_FOR_CATEGORIES } from './categoryIcons';

const perks = [
  { icon: Truck,       title: 'Free delivery',   text: 'On every order over ₹500' },
  { icon: RotateCcw,   title: '10-day returns',  text: 'Changed your mind? Send it back' },
  { icon: ShieldCheck, title: 'Secure checkout', text: 'Your payment details stay private' },
  { icon: Wallet,      title: 'Best prices',     text: 'Everyday low prices on top brands' },
];

export default function Home() {
  const featured = products.filter((p) => p.featured);

  // Today's deals: products with an oldPrice
  const deals = products.filter((p) => p.oldPrice).slice(0, 8);
  
  // Top Value Deals
  const topValueDeals = products.filter((p) => p.badge === 'Deal').slice(0, 6);
  
  // Best Sellers
  const bestSellers = products.filter((p) => p.badge === 'Best Seller').slice(0, 4);
  
  // Smartphones
  const smartphones = products.filter((p) => p.category === 'smartphones').slice(0, 6);
  
  // Home Appliances
  const homeAppliances = products.filter((p) => 
    ['refrigerators', 'washing-machines', 'air-conditioners'].includes(p.category)
  ).slice(0, 6);
  
  // Audio Collection
  const audioProducts = products.filter((p) => 
    ['headphones', 'speakers'].includes(p.category)
  ).slice(0, 6);

  // Hero tiles: Samsung TV, iPhone 16, MacBook Air
  const heroTiles = [1, 5, 9].map(getProduct);

  return (
    <>
      {/* ── Hero banner ── */}
      <section className="mx-auto grid max-w-7xl gap-4 px-4 pt-6 sm:px-6 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-3xl bg-navy-900 p-8 text-white sm:p-10 lg:col-span-2 lg:p-12">
          <div className="relative z-10 max-w-md">
            <p className="inline-block rounded-full bg-deal px-3 py-1 text-xs font-bold text-navy-950">
              Big Electronics Sale
            </p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              Up to 30% off the best electronics
            </h1>
            <p className="mt-4 text-sky-200">
              TVs, laptops, smartphones and home appliances with free delivery over ₹500.
            </p>
            <Link
              to="/store?deals=1"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-navy-900 hover:bg-sky-100"
            >
              Shop the deals <ArrowRight size={18} />
            </Link>
          </div>

          {/* Floating product tiles */}
          <div
            className="pointer-events-none absolute -right-6 bottom-0 top-0 hidden w-[46%] items-center sm:flex"
            aria-hidden="true"
          >
            {heroTiles.map((p, i) => (
              <ProductImage
                key={p.id}
                product={p}
                iconSize={56}
                className={`size-44 shrink-0 rounded-3xl border-4 border-navy-900 shadow-xl ${
                  i === 1 ? '-ml-10 mt-24' : i === 2 ? '-ml-10 -mt-24' : ''
                }`}
              />
            ))}
          </div>
        </div>

        {/* Side promo cards */}
        <div className="grid gap-4">
          <Link
            to="/store?category=headphones"
            className="group flex items-center justify-between gap-4 rounded-3xl bg-sky-100 p-7 hover:bg-sky-200"
          >
            <div>
              <h2 className="text-xl font-extrabold">New in audio</h2>
              <p className="mt-1 text-sm text-navy-700">Headphones &amp; speakers from ₹11,990</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand-700">
                Explore <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </span>
            </div>
            <Headphones size={64} strokeWidth={1.4} className="shrink-0 text-brand-600" />
          </Link>

          <Link
            to="/store?category=televisions"
            className="group rounded-3xl border border-line p-7 hover:border-brand-500"
          >
            <h2 className="text-xl font-extrabold">Upgrade your TV</h2>
            <p className="mt-1 text-sm text-navy-700">4K OLED &amp; QLED TVs from ₹42,999.</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand-700">
              Shop TVs <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </section>

      {/* ── Shop by category ── */}
      <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-6" aria-labelledby="cats">
        <h2 id="cats" className="text-2xl font-extrabold">Shop by category</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => {
            const Icon = ICONS_FOR_CATEGORIES[c.id];
            return (
              <Link
                key={c.id}
                to={`/store?category=${c.id}`}
                className="flex flex-col items-center gap-3 rounded-2xl border border-line p-5 text-center transition hover:border-brand-500 hover:bg-sky-50"
              >
                <span className="grid size-14 place-items-center rounded-2xl bg-sky-100 text-brand-600">
                  {Icon && <Icon size={28} />}
                </span>
                <span className="text-sm font-semibold">{c.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Featured products ── */}
      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6" aria-labelledby="featured">
        <div className="flex items-end justify-between">
          <h2 id="featured" className="text-2xl font-extrabold">Featured products</h2>
          <Link to="/store" className="text-sm font-bold text-brand-600 hover:text-brand-700">
            View all
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* ── Today's deals ── */}
      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6" aria-labelledby="deals">
        <div className="rounded-3xl bg-gradient-to-br from-red-50 to-orange-50 p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="deals" className="text-2xl font-extrabold">⚡ Today's Deals</h2>
              <p className="mt-1 text-sm text-navy-600">Limited time offers - Grab them now!</p>
            </div>
            <Link to="/store?deals=1" className="text-sm font-bold text-brand-600 hover:text-brand-700">
              View all deals
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {deals.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      </section>

      {/* ── Promotional Banner Row ── */}
      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Smartphone Festival */}
          <Link 
            to="/store?category=smartphones"
            className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-600 to-blue-600 p-8 text-white"
          >
            <div className="relative z-10">
              <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-sm">
                📱 Smartphone Festival
              </span>
              <h3 className="mt-4 text-2xl font-extrabold">Great Offers on Top Brands</h3>
              <p className="mt-2 text-purple-100">Latest models from Apple, Samsung & more</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold">
                Shop Now <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </span>
            </div>
            <ProductImage
              product={smartphones[0]}
              iconSize={80}
              className="absolute -right-8 -top-8 size-48 opacity-30 blur-sm transition-transform group-hover:scale-110"
            />
          </Link>

          {/* Home Appliance Deals */}
          <Link 
            to="/store?category=refrigerators"
            className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-600 p-8 text-white"
          >
            <div className="relative z-10">
              <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-sm">
                🏠 Home Appliance Deals
              </span>
              <h3 className="mt-4 text-2xl font-extrabold">Upgrade Your Home</h3>
              <p className="mt-2 text-emerald-100">Refrigerators, Washing Machines & ACs</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold">
                Explore Now <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </span>
            </div>
            <ProductImage
              product={homeAppliances[0]}
              iconSize={80}
              className="absolute -right-8 -top-8 size-48 opacity-30 blur-sm transition-transform group-hover:scale-110"
            />
          </Link>
        </div>
      </section>

      {/* ── Top Value Deals ── */}
      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6" aria-labelledby="value-deals">
        <div className="flex items-end justify-between">
          <div>
            <h2 id="value-deals" className="text-2xl font-extrabold">💎 Top Value Deals</h2>
            <p className="mt-1 text-sm text-navy-600">Best prices on popular products</p>
          </div>
          <Link to="/store?deals=1" className="text-sm font-bold text-brand-600 hover:text-brand-700">
            View all
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {topValueDeals.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* ── Smartphones Collection ── */}
      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6" aria-labelledby="smartphones">
        <div className="flex items-end justify-between">
          <div>
            <h2 id="smartphones" className="text-2xl font-extrabold">📱 Smartphones & Electronics</h2>
            <p className="mt-1 text-sm text-navy-600">Latest models with exciting offers</p>
          </div>
          <Link to="/store?category=smartphones" className="text-sm font-bold text-brand-600 hover:text-brand-700">
            View all
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {smartphones.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* ── Audio Collection Banner ── */}
      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6">
        <Link 
          to="/store?category=headphones"
          className="group relative flex overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 p-10 text-white"
        >
          <div className="relative z-10 max-w-md">
            <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-sm">
              🎧 Audio Collection
            </span>
            <h3 className="mt-4 text-3xl font-extrabold">Premium Sound Experience</h3>
            <p className="mt-3 text-lg text-orange-100">Headphones, earbuds & speakers starting at ₹999</p>
            <span className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-orange-600 transition-transform group-hover:scale-105">
              Shop Audio <ArrowRight size={16} />
            </span>
          </div>
          <div className="absolute -right-12 -top-12 hidden lg:block">
            <ProductImage
              product={audioProducts[0]}
              iconSize={120}
              className="size-80 opacity-40 blur-sm"
            />
          </div>
        </Link>
      </section>

      {/* ── Audio Products Grid ── */}
      <section className="mx-auto mt-8 max-w-7xl px-4 sm:px-6" aria-labelledby="audio">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {audioProducts.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* ── Why shop with us ── */}
      <section
        className="mx-auto mt-14 grid max-w-7xl gap-6 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4"
        aria-label="Why shop with us"
      >
        {perks.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-100 text-brand-600">
              <Icon size={22} />
            </span>
            <div>
              <h3 className="font-bold">{title}</h3>
              <p className="text-sm text-navy-500">{text}</p>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}