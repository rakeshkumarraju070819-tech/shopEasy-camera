import { Link } from 'react-router-dom';
import { ArrowRight, Headphones, RotateCcw, ShieldCheck, Truck, Wallet } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import ProductImage from '../components/ProductImage';
import { categories, getProduct, products } from '../data/products';
import { ICONS_FOR_CATEGORIES } from './categoryIcons';

const perks = [
  { icon: Truck, title: 'Free delivery', text: 'On every order over ₹499' },
  { icon: RotateCcw, title: '30-day returns', text: 'Changed your mind? Send it back' },
  { icon: ShieldCheck, title: 'Secure checkout', text: 'Your payment details stay private' },
  { icon: Wallet, title: 'Fair prices', text: 'Everyday low prices on top brands' }
];

export default function Home() {
  const featured = products.filter((p) => p && p.featured);
  const deals = products.filter((p) => p && p.oldPrice).slice(0, 4);
  const heroIds = [101, 103, 105];
  const heroTiles = heroIds.map(getProduct).filter(Boolean);
  const displayHeroTiles = heroTiles.length >= 3 ? heroTiles : products.slice(0, 3);

  return (
    <>
      <section className="mx-auto grid max-w-7xl gap-4 px-4 pt-6 sm:px-6 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-3xl bg-navy-900 p-8 text-white sm:p-10 lg:col-span-2 lg:p-12">
          <div className="relative z-10 max-w-md">
            <p className="inline-block rounded-full bg-deal px-3 py-1 text-xs font-bold text-navy-950">Autumn refresh sale</p>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">Up to 30% off the things you use every day</h1>
            <p className="mt-4 text-sky-200">Kitchen upgrades, audio, bags and more, with free delivery over ₹499.</p>
            <Link to="/store?deals=1" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-navy-900 hover:bg-sky-100">
              Shop the deals <ArrowRight size={18} />
            </Link>
          </div>
          <div className="pointer-events-none absolute -right-6 bottom-0 top-0 hidden w-[46%] items-center sm:flex" aria-hidden="true">
            {displayHeroTiles.map((p, i) => (
              <ProductImage
                key={p?.id || `hero-${i}`}
                product={p}
                iconSize={56}
                className={`size-44 shrink-0 rounded-3xl border-4 border-navy-900 shadow-xl ${i === 1 ? '-ml-10 mt-24' : i === 2 ? '-ml-10 -mt-24' : ''}`}
              />
            ))}
          </div>
        </div>
        <div className="grid gap-4">
          <Link to="/store?category=electronics" className="group flex items-center justify-between gap-4 rounded-3xl bg-sky-100 p-7 hover:bg-sky-200">
            <div>
              <h2 className="text-xl font-extrabold">New in audio</h2>
              <p className="mt-1 text-sm text-navy-700">Headphones &amp; speakers from ₹799</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand-700">Explore <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></span>
            </div>
            <Headphones size={64} strokeWidth={1.4} className="shrink-0 text-brand-600" />
          </Link>
          <Link to="/store?category=home" className="group rounded-3xl border border-line p-7 hover:border-brand-500">
            <h2 className="text-xl font-extrabold">Make home easier</h2>
            <p className="mt-1 text-sm text-navy-700">Air fryers, coffee makers and cosy throws.</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-brand-700">Shop home <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" /></span>
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-7xl px-4 sm:px-6" aria-labelledby="cats">
        <h2 id="cats" className="text-2xl font-extrabold">Shop by category</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(categories || []).filter(Boolean).map((c, i) => {
            const Icon = ICONS_FOR_CATEGORIES[c.id] || ICONS_FOR_CATEGORIES.electronics;
            return (
              <Link key={c?.id || `cat-${i}`} to={`/store?category=${c.id}`} className="flex flex-col items-center gap-3 rounded-2xl border border-line p-5 text-center transition hover:border-brand-500 hover:bg-sky-50">
                <span className="grid size-14 place-items-center rounded-2xl bg-sky-100 text-brand-600">{Icon && <Icon size={28} />}</span>
                <span className="text-sm font-semibold">{c.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6" aria-labelledby="featured">
        <div className="flex items-end justify-between">
          <h2 id="featured" className="text-2xl font-extrabold">Featured products</h2>
          <Link to="/store" className="text-sm font-bold text-brand-600 hover:text-brand-700">View all</Link>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(featured || []).filter(Boolean).map((p, i) => <ProductCard key={p?.id || `feat-${i}`} product={p} />)}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-7xl px-4 sm:px-6" aria-labelledby="deals">
        <div className="rounded-3xl bg-sky-50 p-6 sm:p-8">
          <div className="flex items-end justify-between">
            <h2 id="deals" className="text-2xl font-extrabold">Today’s deals</h2>
            <Link to="/store?deals=1" className="text-sm font-bold text-brand-600 hover:text-brand-700">See all deals</Link>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(deals || []).filter(Boolean).map((p, i) => <ProductCard key={p?.id || `deal-${i}`} product={p} />)}
          </div>
        </div>
      </section>

      <section className="mx-auto mt-14 grid max-w-7xl gap-6 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4" aria-label="Why shop with us">
        {perks.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-100 text-brand-600"><Icon size={22} /></span>
            <div><h3 className="font-bold">{title}</h3><p className="text-sm text-navy-500">{text}</p></div>
          </div>
        ))}
      </section>
    </>
  );
}
