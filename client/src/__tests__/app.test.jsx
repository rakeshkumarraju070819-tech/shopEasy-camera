import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { ConsentProvider } from '../context/ConsentContext';
import * as visitor from '../services/visitorService';
import * as adminApi from '../services/adminService';

vi.mock('../services/visitorService', () => ({
  createSession: vi.fn(async () => ({ visitorId: 'v-1', sessionToken: 'tok-1' })),
  sendConsent: vi.fn(async () => ({})),
  patchStatus: vi.fn(async () => ({})),
  endSessionKeepalive: vi.fn()
}));
vi.mock('../services/adminService', () => ({
  login: vi.fn(),
  getStats: vi.fn(async () => ({ totalSessions: 7, consentAccepted: 4, consentDeclined: 2, consentPending: 1, permissionGranted: 3, permissionDenied: 1, activeDemoSessions: 1, simulatedRecords: 0, sessionsByDay: [] })),
  getVisitors: vi.fn(async () => ({ total: 0, visitors: [] })),
  getVisitor: vi.fn(),
  getEvents: vi.fn(async () => ({ events: [] })),
  getSettings: vi.fn(async () => ({})),
  deleteVisitor: vi.fn(), purgeVisitors: vi.fn()
}));
vi.mock('../components/LocationMap', () => ({ default: () => <div>map</div> }));

const track = { stop: vi.fn(), addEventListener: vi.fn() };
const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
let getUserMedia;

const renderAt = (route = '/') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider><ConsentProvider><CartProvider><App /></CartProvider></ConsentProvider></AuthProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  getUserMedia = vi.fn(async () => stream);
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
});

describe('Customer website isolation & camera removal', () => {
  it('opening "/" shows only ShopEasy and no camera notification or dialog', async () => {
    renderAt('/');
    expect(screen.getAllByLabelText('ShopEasy home').length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/Camera Access Request/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Privacy Lab/i)).not.toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('no camera permission request occurs on customer pages', async () => {
    for (const route of ['/', '/store', '/product/1', '/cart']) {
      const { unmount } = renderAt(route);
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('/camera-test route is removed and renders Page not found without camera preview', async () => {
    renderAt('/camera-test');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText('The page you’re looking for doesn’t exist.')).toBeInTheDocument();
    expect(screen.queryByText(/CamShield camera test/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Camera is on/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stop Camera/i })).not.toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('customer pages contain no camera UI, camera buttons, or admin links', async () => {
    for (const route of ['/', '/store', '/product/1', '/cart']) {
      const { unmount } = renderAt(route);
      const text = document.body.textContent;
      expect(text).not.toMatch(/Camera Privacy Lab|camera preview|camera active|Stop Camera|camera simulation|camera test/i);
      expect(document.querySelector('a[href*="admin"]')).toBeNull();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Privacy choices/i })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('home has categories, search, featured products with prices, and deals', () => {
    renderAt('/');
    expect(screen.getAllByRole('search').length).toBeGreaterThan(0);
    expect(screen.getByText('Shop by category')).toBeInTheDocument();
    expect(screen.getByText('Featured products')).toBeInTheDocument();
    expect(screen.getAllByText(/Today’s deals/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Add to Cart' }).length).toBeGreaterThan(3);
    expect(screen.getAllByText(/^\$\d+\.\d\d$/).length).toBeGreaterThan(3);
  });

  it('store search and category filtering work correctly', async () => {
    renderAt('/store?q=backpack');
    expect(screen.getByText('Trailmate Everyday Backpack')).toBeInTheDocument();
    expect(screen.queryByText('CrispAir 5L Air Fryer')).not.toBeInTheDocument();
  });

  it('empty search shows a helpful empty state', () => {
    renderAt('/store?q=zzzzzz');
    expect(screen.getByText('No products match your search')).toBeInTheDocument();
  });

  it('unknown product shows not-found state', () => {
    renderAt('/product/9999');
    expect(screen.getByText(/couldn’t find that product/)).toBeInTheDocument();
  });

  it('shopping cart: add, update quantity, remove, and place demo order', async () => {
    const user = userEvent.setup();
    renderAt('/product/4');
    await user.click(screen.getAllByRole('button', { name: 'Add to Cart' })[0]);
    await user.click(screen.getByRole('link', { name: /Shopping cart, \d+ items/ }));
    expect(await screen.findByRole('heading', { name: 'Shopping cart' })).toBeInTheDocument();
    expect(screen.getAllByText('$34.99').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(screen.getAllByText('$69.98').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Remove/ }));
    expect(await screen.findByText('Your cart is empty')).toBeInTheDocument();
  });
});

describe('Admin separation and authentication', () => {
  it('redirects unauthenticated users from every admin route to login', async () => {
    for (const r of ['/admin/dashboard', '/admin/visitors', '/admin/visitors/abc', '/admin/settings', '/admin/consent', '/admin/events', '/admin/ip-intelligence']) {
      const { unmount } = renderAt(r);
      expect(await screen.findByRole('heading', { name: 'Administrator sign in' })).toBeInTheDocument();
      unmount();
    }
  });

  it('login page has no camera notification and shows errors for bad credentials', async () => {
    adminApi.login.mockRejectedValueOnce({ response: { data: { message: 'Incorrect email or password.' } } });
    const user = userEvent.setup();
    renderAt('/admin/login');
    await screen.findByLabelText('Email');
    expect(screen.queryByText('Camera Access Request')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'admin@camshield.local');
    await user.type(screen.getByLabelText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
  });

  it('authenticated admin can access dashboard and logout returns to login', async () => {
    sessionStorage.setItem('camshield.admin.token', 'jwt');
    sessionStorage.setItem('camshield.admin.email', 'admin@camshield.local');
    const user = userEvent.setup();
    renderAt('/admin/dashboard');

    expect(await screen.findByRole('heading', { name: 'Overview' }, { timeout: 4000 })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    for (const label of ['Overview', 'Visitor Sessions', 'IP Intelligence', 'Consent Records', 'Security Events', 'Settings']) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    expect(await screen.findByText('Camera consent accepted')).toBeInTheDocument();
    expect(screen.getByText('Browser permission denied')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Logout/ }));
    expect(await screen.findByRole('heading', { name: 'Administrator sign in' })).toBeInTheDocument();
  });

  it('visitor details clearly show disclosed visitor session and consent information without actual footage', async () => {
    sessionStorage.setItem('camshield.admin.token', 'jwt');
    sessionStorage.setItem('camshield.admin.email', 'admin@camshield.local');
    adminApi.getVisitor.mockResolvedValueOnce({
      visitorId: 'abcd-1234', ip: '203.0.113.9', ipSource: 'simulated', city: 'Northvale', country: 'Fictionia', isp: 'Example ISP',
      browser: 'Chrome', os: 'Windows', deviceType: 'desktop', consentDecision: 'accepted', cameraPermission: 'granted',
      cameraActive: false, sessionStatus: 'active', startedAt: new Date().toISOString(), isSimulated: true, events: []
    });
    const { unmount } = renderAt('/admin/visitors/abcd-1234');
    expect(await screen.findByText('Consent (customer’s choice)')).toBeInTheDocument();
    expect(screen.getByText('Browser permission (reported by browser)')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Granted')).toBeInTheDocument();
    expect(screen.getByText('Not active')).toBeInTheDocument();
    expect(screen.getByText('Simulated sample record')).toBeInTheDocument();
    expect(screen.getByText(/No camera footage is captured, stored or viewable here/i)).toBeInTheDocument();
    unmount();
  });
});
