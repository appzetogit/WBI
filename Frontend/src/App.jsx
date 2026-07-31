import React, { useEffect } from 'react'; // Updated index to .jsx
import { BrowserRouter } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import { Toaster as SonnerToaster } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppRoutes from './routes';
import { SocketProvider } from './context/SocketContext';
import { CartProvider } from './context/CartContext';
import { CityProvider } from './context/CityContext';
import { LocationPermissionChecker } from './components/common/LocationPermissionChecker';
import NavigationProgress from './components/common/NavigationProgress';
import { useJsApiLoader } from '@react-google-maps/api';
import ErrorBoundary from './components/common/ErrorBoundary';

const libraries = ['places', 'geometry'];

function GoogleMapsBootstrap({ children }) {
  const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!mapsKey) return children;
  return <GoogleMapsLoader mapsKey={mapsKey}>{children}</GoogleMapsLoader>;
}

function GoogleMapsLoader({ mapsKey, children }) {
  useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: mapsKey,
    libraries
  });
  return children;
}

// Configure a global QueryClient with aggressive caching for speed
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // Data remains fresh for 5 minutes (increased for instant navigation)
      gcTime: 30 * 60 * 1000, // Keep in memory for 30 minutes (was cacheTime)
      refetchOnWindowFocus: false, // Prevent unnecessary refetches when switching tabs
      refetchOnMount: false, // Prevent refetching on component remount if data is fresh
      retry: 1, // Only retry once to avoid blocking UI on hard failures
    },
  },
});

function App() {
  // Initialize push notifications on app load
  useEffect(() => {
    // Check if user has any active token before loading notification services
    const tokenExists = ['accessToken', 'vendorAccessToken', 'workerAccessToken', 'engineerAccessToken', 'adminAccessToken', 'b2bAccessToken'].some(
      key => localStorage.getItem(key) || sessionStorage.getItem(key)
    );

    if (tokenExists) {
      // Lazy load service to keep startup bundle tiny
      import('./services/pushNotificationService').then((module) => {
        module.setupForegroundNotificationHandler((payload) => {
          const data = payload?.data || {};
          const title = payload?.notification?.title || data.title || 'Notification';
          const body = payload?.notification?.body || data.body || '';
          const type = data.type || '';
          const isEngineer =
            localStorage.getItem('engineerAccessToken') ||
            sessionStorage.getItem('engineerAccessToken');

          window.dispatchEvent(new Event('vendorJobsUpdated'));
          window.dispatchEvent(new Event('vendorStatsUpdated'));
          window.dispatchEvent(new Event('workerJobsUpdated'));
          window.dispatchEvent(new Event('userBookingsUpdated'));
          window.dispatchEvent(new Event('appNotificationReceived'));

          if (isEngineer) {
            window.dispatchEvent(new Event('workerNotificationsUpdated'));
            window.dispatchEvent(new Event('engineerJobsUpdated'));
            if (type === 'ops_job_assigned' || type === 'freelancer_pool') {
              window.dispatchEvent(new Event('ops:job_assigned'));
            }
            if (type === 'payment_received' || type === 'payout_requested' || type === 'payout_processed') {
              window.dispatchEvent(new Event('engineerWalletUpdated'));
            }
            if (title || body) {
              toast(`${title}${body ? `: ${body}` : ''}`, { duration: 4500 });
            }
          }
        });
      }).catch(err => console.warn('Deferred push notifications setup failed:', err));
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <NavigationProgress />
        <SocketProvider>
          <CityProvider>
            <CartProvider>
              <GoogleMapsBootstrap>
                <div className="App">
                  <ErrorBoundary>
                    <AppRoutes />
                    <LocationPermissionChecker />
                    <SonnerToaster richColors position="bottom-right" closeButton />
                    <Toaster
                      position="top-center"
                      reverseOrder={false}
                      toastOptions={{
                        duration: 3000,
                        style: {
                          background: '#0f172a',
                          color: '#ffffff',
                          borderRadius: '16px',
                          padding: '12px 20px',
                          fontSize: '14px',
                          fontWeight: '500',
                          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.25)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          maxWidth: '90vw'
                        },
                        success: {
                          duration: 2500,
                          iconTheme: {
                            primary: '#10b981',
                            secondary: '#ffffff',
                          },
                          style: {
                            background: '#0f172a',
                            color: '#ffffff',
                            borderLeft: '4px solid #10b981',
                          }
                        },
                        error: {
                          duration: 3500,
                          iconTheme: {
                            primary: '#f43f5e',
                            secondary: '#ffffff',
                          },
                          style: {
                            background: '#0f172a',
                            color: '#ffffff',
                            borderLeft: '4px solid #f43f5e',
                          }
                        },
                      }}
                    />
                  </ErrorBoundary>
                </div>
              </GoogleMapsBootstrap>
            </CartProvider>
          </CityProvider>
        </SocketProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
