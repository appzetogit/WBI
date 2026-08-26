import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const VendorSocketContext = createContext(null);

const getVendorId = () => {
  try {
    const raw = localStorage.getItem('vendorData') || sessionStorage.getItem('vendorData');
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?._id || data?.id || null;
  } catch {
    return null;
  }
};

export const VendorSocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [liveUpdates, setLiveUpdates] = useState([]);

  useEffect(() => {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    const token = localStorage.getItem('vendorAccessToken') || sessionStorage.getItem('vendorAccessToken');
    const vendorId = getVendorId();

    const newSocket = io(backendUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionAttempts: 5,
      auth: token ? { token } : undefined
    });

    newSocket.on('connect', () => {
      console.log('Vendor Socket connected:', newSocket.id);
      if (vendorId) {
        newSocket.emit('joinVendorRoom', vendorId);
        newSocket.emit('join', `vendor:${vendorId}`);
        newSocket.emit('join_room', `vendor:${vendorId}`);
      }
    });

    newSocket.on('finance:updated', (data) => {
      window.dispatchEvent(new CustomEvent('vendor-finance-updated', { detail: data }));
    });
    newSocket.on('finance:paymentReceived', (data) => {
      window.dispatchEvent(new CustomEvent('vendor-finance-updated', { detail: data }));
    });
    newSocket.on('finance:withdrawalRequested', (data) => {
      window.dispatchEvent(new CustomEvent('vendor-finance-updated', { detail: data }));
    });
    newSocket.on('finance:synced', (data) => {
      window.dispatchEvent(new CustomEvent('vendor-finance-updated', { detail: data }));
    });

    newSocket.on('new_opportunity', (data) => {
      setLiveUpdates((prev) => [{ type: 'opportunity', data, timestamp: new Date() }, ...prev]);
      window.dispatchEvent(new CustomEvent('vendor-opportunity-new', { detail: data }));
    });

    newSocket.on('opportunity:new', (data) => {
      setLiveUpdates((prev) => [{ type: 'opportunity', data, timestamp: new Date() }, ...prev]);
      window.dispatchEvent(new CustomEvent('vendor-opportunity-new', { detail: data }));
    });

    newSocket.on('project_update', (data) => {
      setLiveUpdates((prev) => [{ type: 'project', data, timestamp: new Date() }, ...prev]);
    });

    newSocket.on('service-approved', (data) => {
      window.dispatchEvent(new CustomEvent('vendor-service-approved', { detail: data }));
    });

    newSocket.on('service-suspended', (data) => {
      window.dispatchEvent(new CustomEvent('vendor-service-suspended', { detail: data }));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <VendorSocketContext.Provider value={{ socket, liveUpdates }}>
      {children}
    </VendorSocketContext.Provider>
  );
};

export const useVendorSocket = () => {
  const context = useContext(VendorSocketContext);
  if (!context) {
    throw new Error('useVendorSocket must be used within a VendorSocketProvider');
  }
  return context;
};
