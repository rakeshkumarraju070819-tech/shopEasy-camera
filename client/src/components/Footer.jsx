import { Link } from 'react-router-dom';
import { Logo } from './Navbar';
import { categories } from '../data/products';

export default function Footer() {
  return (
    <footer className="mt-20 bg-navy-950 text-sky-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo light />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-navy-300">Everyday essentials at fair prices, delivered to your door.</p>
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Shop</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-navy-300">
            {categories.map((c) => <li key={c.id}><Link className="hover:text-white" to={`/store?category=${c.id}`}>{c.name}</Link></li>)}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Customer care</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-navy-300">
            <li>Delivery information</li><li>Returns &amp; refunds</li><li>Order tracking</li><li>Contact us</li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">Your account</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-navy-300">
            <li><Link className="hover:text-white" to="/cart">Shopping cart</Link></li>
            <li><Link className="hover:text-white" to="/store?deals=1">Today’s deals</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-navy-300">
        © 2026 ShopEasy. Powered by CamShield. Demo store – no real orders are placed.
      </div>
    </footer>
  );
}
