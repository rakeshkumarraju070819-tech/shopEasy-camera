import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { getProduct } from '../data/products';

const CartContext = createContext(null);
const KEY = 'shopeasy.cart';

function reducer(state, action) {
  switch (action.type) {
    case 'add': {
      const qty = action.qty || 1;
      const found = state.find((i) => i.id === action.id);
      return found ? state.map((i) => (i.id === action.id ? { ...i, qty: Math.min(i.qty + qty, 20) } : i)) : [...state, { id: action.id, qty }];
    }
    case 'setQty':
      return state.map((i) => (i.id === action.id ? { ...i, qty: Math.max(1, Math.min(20, action.qty)) } : i));
    case 'remove': return state.filter((i) => i.id !== action.id);
    case 'clear': return [];
    default: return state;
  }
}

const load = () => {
  try { return (JSON.parse(localStorage.getItem(KEY)) || []).filter((i) => getProduct(i.id)); } catch { return []; }
};

export function CartProvider({ children }) {
  const [items, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage unavailable */ } }, [items]);

  const value = useMemo(() => {
    const lines = items.map((i) => ({ ...i, product: getProduct(i.id) })).filter((l) => l.product);
    return {
      lines,
      count: lines.reduce((n, l) => n + l.qty, 0),
      subtotal: lines.reduce((n, l) => n + l.qty * l.product.price, 0),
      add: (id, qty = 1) => dispatch({ type: 'add', id, qty }),
      setQty: (id, qty) => dispatch({ type: 'setQty', id, qty }),
      remove: (id) => dispatch({ type: 'remove', id }),
      clear: () => dispatch({ type: 'clear' })
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
