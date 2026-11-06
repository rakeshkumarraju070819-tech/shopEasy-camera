import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { getProduct } from '../data/products';

const CartContext = createContext(null);
const KEY = 'shopeasy.cart';

function reducer(state = [], action) {
  const current = Array.isArray(state) ? state.filter(Boolean) : [];
  switch (action.type) {
    case 'add': {
      const qty = action.qty || 1;
      const found = current.find((i) => i && i.id === action.id);
      return found
        ? current.map((i) => (i.id === action.id ? { ...i, qty: Math.min((i.qty || 1) + qty, 20) } : i))
        : [...current, { id: action.id, qty }];
    }
    case 'setQty':
      return current.map((i) => (i.id === action.id ? { ...i, qty: Math.max(1, Math.min(20, action.qty)) } : i));
    case 'remove':
      return current.filter((i) => i && i.id !== action.id);
    case 'clear':
      return [];
    default:
      return current;
  }
}

const load = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!Array.isArray(raw)) return [];
    return raw.filter((i) => i && i.id && getProduct(i.id));
  } catch {
    return [];
  }
};

export function CartProvider({ children }) {
  const [items, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items || []));
    } catch {
      /* storage unavailable */
    }
  }, [items]);

  const value = useMemo(() => {
    const lines = (items || [])
      .filter((i) => i && i.id)
      .map((i) => {
        const product = getProduct(i.id);
        return product ? { ...i, product } : null;
      })
      .filter(Boolean);

    return {
      lines,
      count: lines.reduce((n, l) => n + (Number(l.qty) || 1), 0),
      subtotal: lines.reduce((n, l) => n + (Number(l.qty) || 1) * (Number(l.product?.price) || 0), 0),
      add: (id, qty = 1) => dispatch({ type: 'add', id, qty }),
      setQty: (id, qty) => dispatch({ type: 'setQty', id, qty }),
      remove: (id) => dispatch({ type: 'remove', id }),
      clear: () => dispatch({ type: 'clear' })
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
