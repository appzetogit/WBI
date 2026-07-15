import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const VendorSocketContext = createContext();

export const VendorSocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [liveUpdates, setLiveUpdates] = useState([]);

  useEffect(() => {
    // Connect to the backend socket server
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
    
    // In production, we'd pass auth tokens here
    const newSocket = io(backendUrl, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('Vendor Socket connected:', newSocket.id);
      // Join vendor specific room
      // newSocket.emit('joinVendorRoom', vendorId);
    });

    newSocket.on('new_opportunity', (data) => {
      setLiveUpdates(prev => [{ type: 'opportunity', data, timestamp: new Date() }, ...prev]);
    });

    newSocket.on('project_update', (data) => {
      setLiveUpdates(prev => [{ type: 'project', data, timestamp: new Date() }, ...prev]);
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
  if (context === undefined) {
    throw new Error('useVendorSocket must be used within a VendorSocketProvider');
  }
  return context;
};
