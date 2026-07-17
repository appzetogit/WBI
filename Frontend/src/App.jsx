import React, { useEffect } from 'react'; // Updated index to .jsx
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
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
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries
  });

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
          // Dispatch update events for listening components to refresh UI
          window.dispatchEvent(new Event('vendorJobsUpdated'));
          window.dispatchEvent(new Event('vendorStatsUpdated'));
          window.dispatchEvent(new Event('workerJobsUpdated'));
          window.dispatchEvent(new Event('userBookingsUpdated'));
          window.dispatchEvent(new Event('appNotificationReceived'));
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
              <div className="App">
                <ErrorBoundary>
                  <AppRoutes />
                  <LocationPermissionChecker />
                  <SonnerToaster richColors position="bottom-right" closeButton />
                  <Toaster
                    position="top-center"
                    reverseOrder={false}
                    toastOptions={{
                      duration: 2000,
                      style: { background: '#333', color: '#fff', borderRadius: '10px', padding: '12px 20px' },
                      success: { duration: 1000, style: { background: '#10B981' } },
                      error: { duration: 2000, style: { background: '#EF4444' } },
                    }}
                  />
                </ErrorBoundary>
              </div>
            </CartProvider>
          </CityProvider>
        </SocketProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
