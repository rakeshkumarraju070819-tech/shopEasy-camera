import { Link, useSearchParams } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import { categories, products } from '../data/products';

const SORTS = {
  featured: ['Featured', () => 0],
  low: ['Price: low to high', (a, b) => a.price - b.price],
  high: ['Price: high to low', (a, b) => b.price - a.price],
  rating: ['Top rated', (a, b) => b.rating - a.rating]
};

export default function Store() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') || '').trim().toLowerCase();
  const category = params.get('category') || '';
  const deals = params.get('deals') === '1';
  const sort = SORTS[params.get('sort')] ? params.get('sort') : 'featured';

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next);
  };

  const list = products
    .filter((p) => !category || p.category === category)
    .filter((p) => !deals || p.oldPrice)
    .filter((p) => !q || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q))
    .sort(SORTS[sort][1]);

  const title = deals ? 'Today’s deals' : category ? categories.find((c) => c.id === category)?.name || 'Shop' : q ? `Results for “${params.get('q')}”` : 'All products';
  const chip = (active) => `rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line text-navy-700 hover:border-brand-500'}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">{title}</h1>
          <p className="mt-1 text-sm text-navy-500">{list.length} {list.length === 1 ? 'product' : 'products'}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          Sort by
          <select value={sort} onChange={(e) => set('sort', e.target.value === 'featured' ? '' : e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2 font-medium outline-none focus:border-brand-500">
            {Object.entries(SORTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        <button className={chip(!category && !deals)} onClick={() => { const n = new URLSearchParams(params); n.delete('category'); n.delete('deals'); setParams(n); }}>All</button>
        {categories.map((c) => <button key={c.id} className={chip(category === c.id)} onClick={() => set('category', category === c.id ? '' : c.id)}>{c.name}</button>)}
        <button className={chip(deals)} onClick={() => set('deals', deals ? '' : '1')}>Deals</button>
      </div>

      {list.length ? (
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <SearchX size={44} className="mx-auto text-navy-300" />
          <h2 className="mt-4 text-xl font-bold">No products match your search</h2>
          <p className="mt-1 text-navy-500">Try a different word, or browse everything.</p>
          <Link to="/store" className="mt-5 inline-block rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">Browse all products</Link>
        </div>
      )}
    </div>
  );
}
