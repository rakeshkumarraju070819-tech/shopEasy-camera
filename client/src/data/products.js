// Dummy catalogue. `icon` + `hue` drive the generated product art; set `image: "https://…"`
// on any product to use a real photo instead (the art is used as a fallback if it fails to load).
export const categories = [
  { id: 'electronics', name: 'Electronics', icon: 'Headphones' },
  { id: 'fashion', name: 'Fashion', icon: 'Shirt' },
  { id: 'home', name: 'Home & Kitchen', icon: 'Coffee' },
  { id: 'sports', name: 'Sports & Outdoors', icon: 'Dumbbell' },
  { id: 'beauty', name: 'Beauty & Care', icon: 'Sparkles' },
  { id: 'books', name: 'Books & Stationery', icon: 'BookOpen' }
];

export const products = [
  { id: 1, name: 'AirTone Wireless Headphones', category: 'electronics', price: 89.99, oldPrice: 129.99, rating: 4.6, reviews: 2841, badge: 'Deal', icon: 'Headphones', hue: 214, featured: true,
    description: 'Over-ear Bluetooth headphones with active noise cancelling, 40-hour battery life and soft memory-foam cushions.' },
  { id: 2, name: 'PulseFit Smartwatch Series 5', category: 'electronics', price: 149.0, oldPrice: 199.0, rating: 4.4, reviews: 1203, badge: 'Deal', icon: 'Watch', hue: 200, featured: true,
    description: 'Heart-rate, sleep and step tracking with a bright AMOLED display and 7-day battery.' },
  { id: 3, name: 'Boomline Portable Speaker', category: 'electronics', price: 54.5, rating: 4.5, reviews: 977, icon: 'Speaker', hue: 224, featured: true,
    description: 'Waterproof Bluetooth speaker with deep bass and 18 hours of playtime. Clips onto any bag.' },
  { id: 4, name: 'Elevate Aluminium Laptop Stand', category: 'electronics', price: 34.99, rating: 4.7, reviews: 3320, icon: 'Laptop', hue: 208,
    description: 'Foldable, adjustable stand that lifts your screen to eye level and keeps your laptop cool.' },
  { id: 5, name: 'VoltGo 20,000 mAh Power Bank', category: 'electronics', price: 39.0, oldPrice: 49.0, rating: 4.5, reviews: 1812, badge: 'Deal', icon: 'BatteryCharging', hue: 190,
    description: 'Fast-charging power bank with two USB-C ports and a digital charge indicator.' },
  { id: 6, name: 'Trailmate Everyday Backpack', category: 'fashion', price: 59.99, rating: 4.7, reviews: 2104, badge: 'Best seller', icon: 'Backpack', hue: 232, featured: true,
    description: 'Water-resistant 25L backpack with a padded laptop sleeve and hidden anti-slip pocket.' },
  { id: 7, name: 'Stride Lite Running Sneakers', category: 'fashion', price: 74.0, oldPrice: 95.0, rating: 4.3, reviews: 864, badge: 'Deal', icon: 'Footprints', hue: 12,
    description: 'Breathable knit sneakers with a cushioned sole built for daily miles.' },
  { id: 8, name: 'Coastline Polarised Sunglasses', category: 'fashion', price: 29.99, rating: 4.2, reviews: 540, icon: 'Glasses', hue: 36,
    description: 'Lightweight UV400 polarised lenses in a classic frame that suits every face shape.' },
  { id: 9, name: 'BrewMaster Drip Coffee Maker', category: 'home', price: 64.99, rating: 4.6, reviews: 1456, icon: 'Coffee', hue: 24, featured: true,
    description: 'Programmable 12-cup coffee maker with a reusable filter and keep-warm plate.' },
  { id: 10, name: 'CrispAir 5L Air Fryer', category: 'home', price: 79.0, oldPrice: 109.0, rating: 4.8, reviews: 5210, badge: 'Best seller', icon: 'Wind', hue: 4, featured: true,
    description: 'Cook crispy meals with up to 90% less oil. Seven presets and a dishwasher-safe basket.' },
  { id: 11, name: 'Halo LED Desk Lamp', category: 'home', price: 27.5, rating: 4.5, reviews: 702, icon: 'Lamp', hue: 48,
    description: 'Dimmable desk lamp with five colour temperatures and a built-in USB charging port.' },
  { id: 12, name: 'Cloudsoft Knit Throw Blanket', category: 'home', price: 32.0, rating: 4.7, reviews: 1189, icon: 'Sofa', hue: 262,
    description: 'Chunky knit throw in a soft cotton blend – warm for the sofa, pretty on the bed.' },
  { id: 13, name: 'GripFlex Yoga Mat 6 mm', category: 'sports', price: 24.99, rating: 4.4, reviews: 1921, icon: 'Dumbbell', hue: 160,
    description: 'Non-slip, extra-thick mat with alignment lines and a carry strap.' },
  { id: 14, name: 'IceVault Insulated Bottle 750 ml', category: 'sports', price: 21.0, rating: 4.8, reviews: 4388, badge: 'Best seller', icon: 'CupSoda', hue: 196, featured: true,
    description: 'Double-wall stainless steel bottle that keeps drinks cold for 24 hours or hot for 12.' },
  { id: 15, name: 'GlowDaily Skincare Trio', category: 'beauty', price: 36.0, oldPrice: 48.0, rating: 4.5, reviews: 1650, badge: 'Deal', icon: 'Sparkles', hue: 330,
    description: 'Gentle cleanser, vitamin C serum and light moisturiser – a simple routine in one set.' },
  { id: 16, name: 'Papertrail Notebook Set (3-pack)', category: 'books', price: 14.99, rating: 4.6, reviews: 2290, icon: 'NotebookPen', hue: 250,
    description: 'A5 dotted notebooks with thick, ink-friendly paper and a lay-flat binding.' }
];

export const getProduct = (id) => products.find((p) => String(p.id) === String(id));
export const formatPrice = (n) => `$${Number(n).toFixed(2)}`;
