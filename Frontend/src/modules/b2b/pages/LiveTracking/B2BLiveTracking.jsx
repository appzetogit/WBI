import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FiMapPin, FiPhone, FiMessageSquare, FiNavigation, FiBattery, 
  FiStar, FiClock, FiCheckCircle, FiSearch, FiRefreshCw, 
  FiGrid, FiList, FiAlertTriangle, FiUser, FiActivity, FiX, FiCheck, FiInfo
} from 'react-icons/fi';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { io } from 'socket.io-client';
import api from '../../../../services/api';

// Fix default Leaflet icon paths in React environment
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom consumer to auto-adjust map viewport based on active markers
const MapController = ({ center, bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (map) {
      map.invalidateSize();
      if (bounds && bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      } else if (center) {
        map.setView(center, 13);
      }
    }
  }, [map, center, bounds]);
  return null;
};

const B2BLiveTracking = () => {
  // Authentication & Socket base URL
  const token = localStorage.getItem('b2bAccessToken') || localStorage.getItem('accessToken');
  const socketBaseUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'https://app.wbinfs.com';

  // Live Tracking state
  const [engineers, setEngineers] = useState([]);
  const [summary, setSummary] = useState({
    onDuty: 0,
    enRoute: 0,
    atLocation: 0,
    completedToday: 0,
    offline: 0
  });

  // UI state
  const [selectedEngineer, setSelectedEngineer] = useState(null);
  const [engineerDetails, setEngineerDetails] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [jobRoute, setJobRoute] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshCountdown, setRefreshCountdown] = useState(10);
  const [viewMode, setViewMode] = useState('list'); // list or grid

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [skillFilter, setSkillFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('nearest'); // nearest or alphabetical
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Refs
  const socketRef = useRef(null);

  // Status mapping colors & labels
  const statusColors = {
    available: { border: '#10AFA5', bg: 'bg-[#10AFA5]/10', text: 'text-[#10AFA5]', dot: '#10AFA5', hex: '#10AFA5' },
    assigned: { border: '#3B82F6', bg: 'bg-blue-50', text: 'text-blue-600', dot: '#3B82F6', hex: '#3B82F6' },
    en_route: { border: '#3B82F6', bg: 'bg-blue-50', text: 'text-blue-600', dot: '#3B82F6', hex: '#3B82F6' },
    at_location: { border: '#10B981', bg: 'bg-emerald-50', text: 'text-emerald-600', dot: '#10B981', hex: '#10B981' },
    working: { border: '#10B981', bg: 'bg-emerald-50', text: 'text-emerald-600', dot: '#10B981', hex: '#10B981' },
    on_break: { border: '#F59E0B', bg: 'bg-amber-50', text: 'text-amber-600', dot: '#F59E0B', hex: '#F59E0B' },
    offline: { border: '#9CA3AF', bg: 'bg-gray-100', text: 'text-gray-500', dot: '#9CA3AF', hex: '#9CA3AF' }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'available': return 'Available';
      case 'assigned': return 'Assigned';
      case 'en_route': return 'En Route';
      case 'at_location': return 'At Location';
      case 'working': return 'Working';
      case 'on_break': return 'On Break';
      case 'offline': return 'Offline';
      default: return 'Offline';
    }
  };

  // 1. Fetch initial API data
  const fetchTrackingData = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    try {
      // Get Summary
      const summaryRes = await api.get('/b2b/live-tracking/summary');
      if (summaryRes.data.success) {
        setSummary(summaryRes.data.summary);
      }

      // Get Engineers
      const engineersRes = await api.get('/b2b/live-tracking/engineers');
      if (engineersRes.data.success) {
        setEngineers(engineersRes.data.data);
      }
    } catch (error) {
      console.error('Error fetching live tracking data:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch specific details when engineer is selected
  const fetchSelectedEngineerDetails = async (engineerId) => {
    try {
      const detailsRes = await api.get(`/b2b/live-tracking/engineers/${engineerId}`);
      if (detailsRes.data.success) {
        setEngineerDetails(detailsRes.data.data);
        
        // If engineer has a current job, load route and timeline
        if (detailsRes.data.data.currentJob) {
          const jobId = detailsRes.data.data.currentJob._id;
          
          // Get timeline
          const timelineRes = await api.get(`/b2b/live-tracking/engineers/${engineerId}/timeline`);
          if (timelineRes.data.success) {
            setTimeline(timelineRes.data.data);
          }

          // Get route
          const routeRes = await api.get(`/b2b/live-tracking/jobs/${jobId}/route`);
          if (routeRes.data.success) {
            setJobRoute(routeRes.data.route);
          } else {
            setJobRoute(null);
          }
        } else {
          setTimeline([]);
          setJobRoute(null);
        }
      }
    } catch (error) {
      console.error('Error fetching engineer details:', error);
    }
  };

  // Trigger manual refresh API
  const handleRefreshNow = async () => {
    setIsRefreshing(true);
    try {
      await api.post('/b2b/live-tracking/refresh');
      await fetchTrackingData();
      setRefreshCountdown(10);
      if (selectedEngineer) {
        await fetchSelectedEngineerDetails(selectedEngineer._id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 2. Setup Socket.IO connection and handlers
  useEffect(() => {
    fetchTrackingData();

    // Connect socket
    const socket = io(socketBaseUrl, {
      auth: { token },
      path: '/socket.io/',
      transports: ['websocket']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to real-time live-tracking server');
    });

    // Real-time update listeners
    socket.on('b2b:engineerLocationUpdated', (data) => {
      // update engineer list location & status in-place
      setEngineers(prev => prev.map(eng => {
        if (eng._id === data.engineerId) {
          // If selected, refresh details dynamically
          if (selectedEngineer && selectedEngineer._id === data.engineerId) {
            fetchSelectedEngineerDetails(data.engineerId);
          }
          return {
            ...eng,
            battery: data.battery !== undefined ? data.battery : eng.battery,
            status: data.status || eng.status,
            lastUpdatedAt: new Date(),
            location: {
              lat: data.lat,
              lng: data.lng,
              heading: data.heading,
              speed: data.speed
            }
          };
        }
        return eng;
      }));
    });

    socket.on('b2b:engineerStatusChanged', (data) => {
      setEngineers(prev => prev.map(eng => {
        if (eng._id === data.engineerId) {
          if (selectedEngineer && selectedEngineer._id === data.engineerId) {
            fetchSelectedEngineerDetails(data.engineerId);
          }
          return {
            ...eng,
            status: data.status
          };
        }
        return eng;
      }));
      // Recalculate summary totals
      fetchTrackingData();
    });

    socket.on('b2b:jobStatusUpdated', (data) => {
      // Refresh to grab the latest job logs/status mapping
      fetchTrackingData();
      if (selectedEngineer && engineerDetails?.currentJob?._id === data.jobId) {
        fetchSelectedEngineerDetails(selectedEngineer._id);
      }
    });

    socket.on('b2b:etaUpdated', (data) => {
      setEngineers(prev => prev.map(eng => {
        if (eng.currentJob && eng.currentJob._id === data.jobId) {
          return {
            ...eng,
            currentJob: { ...eng.currentJob, eta: data.eta }
          };
        }
        return eng;
      }));
      if (selectedEngineer && engineerDetails?.currentJob?._id === data.jobId) {
        setEngineerDetails(prev => ({
          ...prev,
          currentJob: { ...prev.currentJob, eta: data.eta }
        }));
      }
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // 3. Auto Refresh timer logic
  useEffect(() => {
    let timer;
    if (autoRefresh) {
      timer = setInterval(() => {
        setRefreshCountdown(prev => {
          if (prev <= 1) {
            fetchTrackingData(false);
            return 10;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [autoRefresh]);

  // Handle engineer selection
  const handleSelectEngineer = (engineer) => {
    setSelectedEngineer(engineer);
    fetchSelectedEngineerDetails(engineer._id);
  };

  // Filters calculation
  const uniqueSkills = useMemo(() => {
    return ['all', ...new Set(engineers.flatMap(eng => eng.currentJob ? [eng.currentJob.serviceName] : []))];
  }, [engineers]);

  const uniqueAreas = useMemo(() => {
    return ['all', ...new Set(engineers.flatMap(eng => eng.currentJob ? [eng.currentJob.address.split(',').slice(-2, -1)[0]?.trim()] : []).filter(Boolean))];
  }, [engineers]);

  // Filtered engineers list
  const filteredEngineers = useMemo(() => {
    let list = [...engineers];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      list = list.filter(eng => 
        eng.name.toLowerCase().includes(term) || 
        eng._id.toLowerCase().includes(term) ||
        (eng.currentJob && eng.currentJob.jobId.toLowerCase().includes(term))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      list = list.filter(eng => eng.status === statusFilter);
    }

    // Skills filter
    if (skillFilter !== 'all') {
      list = list.filter(eng => eng.currentJob && eng.currentJob.serviceName === skillFilter);
    }

    // Area filter
    if (areaFilter !== 'all') {
      list = list.filter(eng => eng.currentJob && eng.currentJob.address.includes(areaFilter));
    }

    // Sort order
    if (sortOrder === 'alphabetical') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [engineers, searchTerm, statusFilter, skillFilter, areaFilter, sortOrder]);

  // Pagination bounds
  const paginatedEngineers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredEngineers.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEngineers, currentPage]);

  const totalPages = Math.ceil(filteredEngineers.length / itemsPerPage);

  // Active markers on map
  const mapCenter = [28.6139, 77.2090]; // New Delhi default center
  
  // Resolve map bounds based on active engineers coordinates
  const activeBounds = useMemo(() => {
    const coords = [];
    filteredEngineers.forEach(eng => {
      if (eng.location) {
        coords.push([eng.location.lat, eng.location.lng]);
      }
      if (eng.currentJob && eng.currentJob.coordinates) {
        coords.push([eng.currentJob.coordinates.lat, eng.currentJob.coordinates.lng]);
      }
    });
    return coords.length > 0 ? coords : null;
  }, [filteredEngineers]);

  // Custom marker creators
  const getCustomMarkerIcon = (profilePhoto, status) => {
    const color = statusColors[status]?.hex || '#9CA3AF';
    return L.divIcon({
      className: 'custom-engineer-map-marker',
      html: `
        <div style="position: relative; width: 44px; height: 44px;">
          <div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; border: 3px solid ${color}; box-shadow: 0 4px 10px rgba(0,0,0,0.15); background: white;">
            <img src="${profilePhoto}" style="width: 100%; height: 100%; object-fit: cover;" alt="avatar"/>
          </div>
          <div style="position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; border-radius: 50%; background: ${color}; border: 2.5px solid white;"></div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });
  };

  const getCustomerMarkerIcon = () => {
    return L.divIcon({
      className: 'custom-customer-map-marker',
      html: `
        <div style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; background: #0F172A; color: white; border: 3px solid white; box-shadow: 0 4px 12px rgba(15,23,42,0.25);">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });
  };

  // Simple grid clustering: group close markers to prevent lag (if 50+ engineers)
  const isClustered = filteredEngineers.length >= 50;
  const mapElements = useMemo(() => {
    if (!isClustered) {
      return filteredEngineers.flatMap(eng => {
        const elements = [];
        if (eng.location) {
          elements.push(
            <Marker 
              key={`eng-${eng._id}`}
              position={[eng.location.lat, eng.location.lng]}
              icon={getCustomMarkerIcon(eng.profilePhoto, eng.status)}
              eventHandlers={{
                click: () => handleSelectEngineer(eng),
              }}
            >
              <Popup>
                <div className="p-1 font-sans text-xs">
                  <p className="font-bold text-gray-800">{eng.name}</p>
                  <p className="text-[10px] text-gray-500 uppercase font-semibold mt-0.5">{getStatusLabel(eng.status)}</p>
                  {eng.currentJob && (
                    <p className="text-[10px] text-[#10AFA5] font-bold mt-1">Current: {eng.currentJob.jobId} ({eng.currentJob.serviceName})</p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        }

        // Add Customer location if engineer has an active job
        if (eng.location && eng.currentJob && eng.currentJob.coordinates) {
          elements.push(
            <Marker
              key={`cust-${eng._id}`}
              position={[eng.currentJob.coordinates.lat, eng.currentJob.coordinates.lng]}
              icon={getCustomerMarkerIcon()}
            >
              <Popup>
                <div className="p-1 font-sans text-xs">
                  <p className="font-bold text-gray-800">Job Destination</p>
                  <p className="text-[10px] text-gray-500">{eng.currentJob.customerName}</p>
                  <p className="text-[10px] text-[#10AFA5] font-semibold">{eng.currentJob.jobId}</p>
                </div>
              </Popup>
            </Marker>
          );

          // Simple straight polyline linking them (individual route paths are queried in detail panel)
          elements.push(
            <Polyline
              key={`line-${eng._id}`}
              positions={[
                [eng.location.lat, eng.location.lng],
                [eng.currentJob.coordinates.lat, eng.currentJob.coordinates.lng]
              ]}
              color={statusColors[eng.status]?.hex || '#3B82F6'}
              weight={3}
              dashArray="5, 10"
              opacity={0.7}
            />
          );
        }
        return elements;
      });
    }

    // Clustering logic (Grid-based aggregation)
    const gridSize = 0.05; // degree size grid approx ~5km
    const clusters = {};

    filteredEngineers.forEach(eng => {
      if (!eng.location) return;
      const cellX = Math.round(eng.location.lng / gridSize);
      const cellY = Math.round(eng.location.lat / gridSize);
      const key = `${cellY}:${cellX}`;

      if (!clusters[key]) {
        clusters[key] = {
          latSum: 0,
          lngSum: 0,
          count: 0,
          engineers: []
        };
      }
      clusters[key].latSum += eng.location.lat;
      clusters[key].lngSum += eng.location.lng;
      clusters[key].count += 1;
      clusters[key].engineers.push(eng);
    });

    return Object.keys(clusters).map(key => {
      const cluster = clusters[key];
      const clusterLat = cluster.latSum / cluster.count;
      const clusterLng = cluster.lngSum / cluster.count;

      if (cluster.count === 1) {
        const eng = cluster.engineers[0];
        return (
          <Marker 
            key={`eng-${eng._id}`}
            position={[eng.location.lat, eng.location.lng]}
            icon={getCustomMarkerIcon(eng.profilePhoto, eng.status)}
            eventHandlers={{
              click: () => handleSelectEngineer(eng),
            }}
          />
        );
      }

      // Render aggregated cluster marker
      const clusterIcon = L.divIcon({
        className: 'custom-cluster-icon',
        html: `
          <div style="display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: #10AFA5; border: 3px solid white; box-shadow: 0 4px 14px rgba(16,175,165,0.4); color: white; font-weight: bold; font-size: 14px;">
            ${cluster.count}
          </div>
        `,
        iconSize: [44, 44]
      });

      return (
        <Marker 
          key={`cluster-${key}`}
          position={[clusterLat, clusterLng]}
          icon={clusterIcon}
        >
          <Popup>
            <div className="p-2 font-sans text-xs">
              <p className="font-bold text-gray-800 mb-1">{cluster.count} Engineers Grouped</p>
              <ul className="max-h-24 overflow-y-auto space-y-1">
                {cluster.engineers.map(eng => (
                  <li key={eng._id} className="text-[10px] text-gray-600 hover:text-[#10AFA5] cursor-pointer font-medium" onClick={() => handleSelectEngineer(eng)}>
                    • {eng.name} ({getStatusLabel(eng.status)})
                  </li>
                ))}
              </ul>
            </div>
          </Popup>
        </Marker>
      );
    });
  }, [filteredEngineers, isClustered]);

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-[#E6F4F2] shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Live Tracking</h1>
          <p className="text-sm text-slate-500 mt-1">Track your assigned engineers in real-time</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Auto Refresh Toggle Badge */}
          <div className="flex items-center gap-2 px-4 py-2 bg-[#F0FDFA] text-[#10AFA5] rounded-2xl border border-[#E6F4F2] text-xs font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
            <span>Auto Refresh {autoRefresh ? `• Every ${refreshCountdown}s` : 'Paused'}</span>
            <button 
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="ml-2 underline text-[#10AFA5] hover:text-teal-700 font-bold"
            >
              {autoRefresh ? 'Pause' : 'Resume'}
            </button>
          </div>
          
          <button 
            onClick={handleRefreshNow}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-2xl font-bold text-xs shadow-sm transition-all select-none disabled:opacity-50"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Now
          </button>
        </div>
      </div>

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* On Duty */}
        <div className="bg-white p-5 rounded-3xl border border-[#E6F4F2] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl shrink-0">
            <FiUser />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">On Duty Engineers</p>
            <h2 className="text-xl font-bold text-slate-800 mt-0.5">{summary.onDuty}</h2>
            <p className="text-[10px] text-indigo-500 font-semibold mt-0.5">Live</p>
          </div>
        </div>

        {/* En Route */}
        <div className="bg-white p-5 rounded-3xl border border-[#E6F4F2] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center text-xl shrink-0">
            <FiNavigation className="rotate-45" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">En Route</p>
            <h2 className="text-xl font-bold text-slate-800 mt-0.5">{summary.enRoute}</h2>
            <p className="text-[10px] text-sky-500 font-semibold mt-0.5">To Customer</p>
          </div>
        </div>

        {/* At Location */}
        <div className="bg-white p-5 rounded-3xl border border-[#E6F4F2] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#10AFA5] flex items-center justify-center text-xl shrink-0">
            <FiMapPin />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">At Location</p>
            <h2 className="text-xl font-bold text-slate-800 mt-0.5">{summary.atLocation}</h2>
            <p className="text-[10px] text-[#10AFA5] font-semibold mt-0.5">Working</p>
          </div>
        </div>

        {/* Completed Today */}
        <div className="bg-white p-5 rounded-3xl border border-[#E6F4F2] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#F0FDFA] text-teal-600 flex items-center justify-center text-xl shrink-0">
            <FiCheckCircle />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Completed Today</p>
            <h2 className="text-xl font-bold text-slate-800 mt-0.5">{summary.completedToday}</h2>
            <p className="text-[10px] text-teal-500 font-semibold mt-0.5">Jobs</p>
          </div>
        </div>

        {/* Offline */}
        <div className="bg-white p-5 rounded-3xl border border-[#E6F4F2] shadow-sm flex items-center gap-4 col-span-2 md:col-span-1">
          <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-500 flex items-center justify-center text-xl shrink-0">
            <FiUser className="opacity-60" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Offline</p>
            <h2 className="text-xl font-bold text-slate-800 mt-0.5">{summary.offline}</h2>
            <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Not Active</p>
          </div>
        </div>
      </div>

      {/* 3. Main Map Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* Map Container */}
        <div className={`bg-white rounded-3xl border border-[#E6F4F2] p-4 shadow-sm relative min-h-[500px] flex flex-col ${selectedEngineer ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
          <div className="flex justify-between items-center pb-3 border-b border-slate-50 mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10AFA5] animate-pulse"></span>
              <h3 className="text-xs uppercase tracking-wider font-extrabold text-slate-700">Interactive Radar</h3>
            </div>
            
            {/* Legend & Filter row inside map */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2.5 text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-xl">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> En Route</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> At Location</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> On Break</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400"></span> Offline</span>
              </div>
            </div>
          </div>

          {/* Actual Leaflet Map */}
          <div className="flex-1 rounded-2xl overflow-hidden relative border border-slate-100 min-h-[420px]">
            <MapContainer 
              center={mapCenter} 
              zoom={12} 
              style={{ width: '100%', height: '100%', zIndex: 10 }}
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />
              
              {/* Elements Renderer (markers/polylines) */}
              {mapElements}

              {/* Dynamic Map Bounds adjusting helper */}
              <MapController center={mapCenter} bounds={activeBounds} />
            </MapContainer>
          </div>
        </div>

        {/* 4. Right details drawer (Visible if selectedEngineer is active) */}
        {selectedEngineer && (
          <div className="lg:col-span-4 bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm flex flex-col justify-between max-h-[580px] overflow-y-auto relative animate-slide-up">
            
            {/* Header info */}
            <div>
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Engineer Details</h3>
                <button 
                  onClick={() => { setSelectedEngineer(null); setEngineerDetails(null); }}
                  className="p-1.5 bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>

              {/* Photo & Identity card */}
              <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-5">
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white shrink-0 shadow">
                  <img src={selectedEngineer.profilePhoto} className="w-100 h-100 object-cover" alt="avatar" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 leading-tight">{selectedEngineer.name}</h4>
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">{selectedEngineer._id.substring(0, 10).toUpperCase()}</p>
                  
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-lg border ${statusColors[selectedEngineer.status]?.bg} ${statusColors[selectedEngineer.status]?.text}`}>
                      {getStatusLabel(selectedEngineer.status)}
                    </span>
                    <span className="flex items-center gap-0.5 text-xs text-amber-500 font-bold">
                      <FiStar className="fill-current text-amber-500" />
                      {selectedEngineer.rating}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contact actions */}
              <div className="grid grid-cols-3 gap-2.5 mb-5">
                <a 
                  href={`tel:${selectedEngineer.phone}`}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-50 text-slate-700 rounded-xl text-xs font-bold border border-slate-200/60 hover:bg-slate-100 transition-all text-center"
                >
                  <FiPhone className="w-3.5 h-3.5" />
                  Call
                </a>
                <button 
                  onClick={() => alert(`Starting chat with ${selectedEngineer.name}`)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-50 text-slate-700 rounded-xl text-xs font-bold border border-slate-200/60 hover:bg-slate-100 transition-all text-center"
                >
                  <FiMessageSquare className="w-3.5 h-3.5" />
                  Chat
                </button>
                <button 
                  onClick={() => {
                    if (selectedEngineer.location) {
                      window.open(`https://www.google.com/maps/dir/?api=1&destination=${selectedEngineer.location.lat},${selectedEngineer.location.lng}`);
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-[#10AFA5] text-white rounded-xl text-xs font-bold hover:bg-teal-600 transition-all text-center"
                >
                  <FiNavigation className="w-3.5 h-3.5 rotate-45" />
                  Navigate
                </button>
              </div>

              {/* Current active Job section */}
              {engineerDetails?.currentJob ? (
                <div className="space-y-4">
                  <div className="bg-[#F0FDFA] border border-[#E6F4F2] p-4 rounded-2xl space-y-2.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-extrabold text-[#10AFA5] uppercase">Current Job</span>
                      <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-100 px-2 py-0.5 rounded-lg">
                        {engineerDetails.currentJob.jobId}
                      </span>
                    </div>
                    
                    <div>
                      <p className="text-xs font-bold text-slate-800 leading-tight">{engineerDetails.currentJob.serviceName}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Cust: {engineerDetails.currentJob.customerName}</p>
                      <p className="text-[10px] text-slate-500 mt-1.5 flex items-start gap-1">
                        <FiMapPin className="w-3 h-3 text-[#10AFA5] shrink-0 mt-0.5" />
                        {engineerDetails.currentJob.address}
                      </p>
                    </div>

                    <div className="border-t border-slate-100/50 pt-2 flex justify-between items-center text-[10px] text-slate-500 font-bold">
                      <span>ETA To Customer:</span>
                      <span className="text-[#10AFA5] font-extrabold text-xs">
                        {engineerDetails.currentJob.eta ? `${engineerDetails.currentJob.eta} mins` : 'calculating...'}
                      </span>
                    </div>
                  </div>

                  {/* Activity status log timeline */}
                  <div className="space-y-2.5">
                    <h5 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Activity Timeline</h5>
                    <div className="border-l border-slate-100 pl-4 space-y-3.5 ml-2">
                      {timeline.length > 0 ? (
                        timeline.map((log, idx) => (
                          <div key={log._id || idx} className="relative">
                            <span className="absolute -left-[20px] top-1 h-2 w-2 rounded-full bg-[#10AFA5]"></span>
                            <div className="text-[10px] font-bold text-slate-800 leading-none">
                              {log.message || `Status: ${log.status}`}
                            </div>
                            <div className="text-[8px] text-slate-400 mt-1">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-[10px] text-slate-400 italic">No job logs recorded today.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-2xl border border-slate-100 text-center text-slate-400">
                  <FiInfo className="w-8 h-8 opacity-40 mb-2" />
                  <p className="text-xs font-bold">No engineers are currently assigned to your jobs.</p>
                </div>
              )}
            </div>

            {/* Bottom auxiliary card metadata */}
            <div className="border-t border-slate-100 pt-4 mt-4 grid grid-cols-2 gap-2 text-[10px] text-slate-500 font-bold">
              <div>Battery: <span className="text-slate-800">{selectedEngineer.battery}%</span></div>
              <div className="text-right">Last Active: <span className="text-slate-800">{new Date(selectedEngineer.lastUpdatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>
            </div>

          </div>
        )}

      </div>

      {/* 5. Engineers Table & Filtering */}
      <div className="bg-white rounded-3xl border border-[#E6F4F2] p-6 shadow-sm space-y-4">
        
        {/* Table Search & Dropdowns filters */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search engineer or job ID..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-medium focus:outline-none focus:border-[#10AFA5] transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-semibold text-slate-600 focus:outline-none"
            >
              <option value="all">All Status</option>
              <option value="available">Available</option>
              <option value="en_route">En Route</option>
              <option value="at_location">At Location</option>
              <option value="working">Working</option>
              <option value="on_break">On Break</option>
              <option value="offline">Offline</option>
            </select>

            {/* Skill Filter */}
            <select
              value={skillFilter}
              onChange={(e) => { setSkillFilter(e.target.value); setCurrentPage(1); }}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-semibold text-slate-600 focus:outline-none"
            >
              <option value="all">All Skills</option>
              {uniqueSkills.filter(s => s !== 'all').map(skill => (
                <option key={skill} value={skill}>{skill}</option>
              ))}
            </select>

            {/* Area Filter */}
            <select
              value={areaFilter}
              onChange={(e) => { setAreaFilter(e.target.value); setCurrentPage(1); }}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-semibold text-slate-600 focus:outline-none"
            >
              <option value="all">All Areas</option>
              {uniqueAreas.filter(a => a !== 'all').map(area => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>

            {/* Sorting */}
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs font-semibold text-slate-600 focus:outline-none"
            >
              <option value="nearest">Nearest First</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          </div>
        </div>

        {/* Table itself */}
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/70 text-[10px] font-extrabold uppercase text-slate-400 border-b border-slate-100">
                <th className="px-6 py-4">Engineer</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Current Job</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">ETA / Last Update</th>
                <th className="px-6 py-4">Battery</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {paginatedEngineers.length > 0 ? (
                paginatedEngineers.map((eng) => (
                  <tr 
                    key={eng._id}
                    className={`hover:bg-slate-50/50 transition-all ${selectedEngineer?._id === eng._id ? 'bg-[#F0FDFA]/30' : ''}`}
                  >
                    {/* Column: Engineer info */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-100 bg-white shrink-0">
                          <img src={eng.profilePhoto} className="w-100 h-100 object-cover" alt="avatar" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 leading-tight">{eng.name}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">ENG-{eng._id.substring(0, 6).toUpperCase()}</p>
                        </div>
                      </div>
                    </td>

                    {/* Column: Status dot */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1.5 font-bold text-slate-700">
                          <span 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: statusColors[eng.status]?.dot }}
                          ></span>
                          {getStatusLabel(eng.status)}
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                          {eng.status === 'offline' ? 'Not Active' : 'Active'}
                        </span>
                      </div>
                    </td>

                    {/* Column: Current Job info */}
                    <td className="px-6 py-4">
                      {eng.currentJob ? (
                        <div>
                          <span className="text-[10px] font-extrabold text-[#10AFA5] bg-[#F0FDFA] px-2 py-0.5 rounded border border-[#E6F4F2]">
                            {eng.currentJob.jobId}
                          </span>
                          <p className="font-bold text-slate-800 mt-1 leading-tight">{eng.currentJob.serviceName}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{eng.currentJob.address.split(',')[0]}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-bold italic">No Active Job</span>
                      )}
                    </td>

                    {/* Column: Location */}
                    <td className="px-6 py-4">
                      {eng.location ? (
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-700">Live coordinates</p>
                          <p className="text-[9px] text-slate-400 font-semibold">{eng.location.lat.toFixed(4)}, {eng.location.lng.toFixed(4)}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-bold italic">Location not available</span>
                      )}
                    </td>

                    {/* Column: ETA / Update */}
                    <td className="px-6 py-4 font-semibold text-slate-600">
                      {eng.currentJob && eng.currentJob.eta !== null ? (
                        <div>
                          <p className="font-bold text-[#10AFA5]">{eng.currentJob.eta} mins</p>
                          <p className="text-[9px] text-slate-400 mt-0.5">Updated {new Date(eng.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      ) : (
                        <p className="text-slate-400 italic">No Active Route</p>
                      )}
                    </td>

                    {/* Column: Battery */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-bold text-slate-600">
                        <FiBattery className={`w-4.5 h-4.5 ${eng.battery < 25 ? 'text-red-500 animate-pulse' : 'text-emerald-500'}`} />
                        <span>{eng.battery}%</span>
                      </div>
                    </td>

                    {/* Column: Actions */}
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => handleSelectEngineer(eng)}
                          title="View Details"
                          className="p-2 bg-slate-50 hover:bg-[#F0FDFA] hover:text-[#10AFA5] rounded-xl text-slate-500 transition-all"
                        >
                          <FiInfo className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => {
                            handleSelectEngineer(eng);
                            // Set center map to engineer location
                            if (eng.location) {
                              // Action to highlight on map
                            }
                          }}
                          title="Track on Map"
                          className="p-2 bg-slate-50 hover:bg-[#F0FDFA] hover:text-blue-500 rounded-xl text-slate-500 transition-all"
                        >
                          <FiNavigation className="w-4 h-4 rotate-45" />
                        </button>
                        <a 
                          href={`tel:${eng.phone}`}
                          title="Call Engineer"
                          className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 transition-all"
                        >
                          <FiPhone className="w-4 h-4" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic font-bold">
                    No engineers match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center text-xs text-slate-500 font-bold border-t border-slate-50 pt-4 select-none">
            <span>Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredEngineers.length)} of {filteredEngineers.length} engineers</span>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-slate-200 hover:border-[#10AFA5] rounded-xl font-bold transition-all disabled:opacity-40"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }).map((_, idx) => (
                <button 
                  key={idx}
                  onClick={() => setCurrentPage(idx + 1)}
                  className={`w-8 h-8 rounded-xl font-bold transition-all ${currentPage === idx + 1 ? 'bg-[#10AFA5] text-white' : 'border border-slate-200 hover:border-[#10AFA5]'}`}
                >
                  {idx + 1}
                </button>
              ))}
              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 border border-slate-200 hover:border-[#10AFA5] rounded-xl font-bold transition-all disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
};

export default B2BLiveTracking;
