import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiNavigation, FiClock, FiMapPin, FiPhone, FiAlertCircle } from 'react-icons/fi';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip as MapTooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../../../../../services/api';
import { useSocket } from '../../../../../context/SocketContext';
import { fmtDateTime } from '../../../components/ui';

const pin = (color, label) =>
  L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-8px)">
      <span style="background:${color};color:#fff;font:600 10px system-ui;padding:2px 6px;border-radius:4px;white-space:nowrap">${label}</span>
      <span style="width:14px;height:14px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);margin-top:2px"></span>
    </div>`,
    iconSize: [80, 36],
    iconAnchor: [40, 36]
  });
const ENGINEER_ICON = pin('#10AFA5', 'Engineer');
const SITE_ICON = pin('#DC2626', 'Site');

/** Keeps both points in view as the engineer moves. */
const FitBounds = ({ points }) => {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

/**
 * Live job tracking: the engineer's last reported position against the job
 * site, on a real map. Positions update over the socket and every 20 s.
 */
const LiveTrackingModal = ({ jobId, onClose }) => {
  const socket = useSocket();
  const [livePos, setLivePos] = useState(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['b2bJobLive', jobId],
    queryFn: async () => (await api.get(`/b2b/jobs/live/${jobId}`)).data?.data,
    enabled: Boolean(jobId),
    refetchInterval: 20000
  });

  useEffect(() => { setLivePos(null); }, [data]);

  useEffect(() => {
    if (!socket || !data?.engineer?._id) return undefined;
    const onUpdate = (u) => {
      const sameJob = u?.jobId && (String(u.jobId) === String(jobId) || u.jobId === data.jobId);
      const sameEngineer = u?.engineerId && String(u.engineerId) === String(data.engineer._id);
      const loc = u?.location || u;
      if ((sameJob || sameEngineer) && Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)) {
        setLivePos({ lat: loc.lat, lng: loc.lng, updatedAt: new Date().toISOString() });
      }
    };
    socket.on('engineer_location_update', onUpdate);
    socket.on('b2b:engineerLocationUpdated', onUpdate);
    return () => {
      socket.off('engineer_location_update', onUpdate);
      socket.off('b2b:engineerLocationUpdated', onUpdate);
    };
  }, [socket, jobId, data]);

  const engineerPos = livePos || data?.engineerLocation || null;
  const site = data?.destination || null;
  const points = useMemo(() => {
    const out = [];
    if (engineerPos) out.push([engineerPos.lat, engineerPos.lng]);
    if (site) out.push([site.lat, site.lng]);
    return out;
  }, [engineerPos, site]);

  if (!jobId) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Live tracking">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" />
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
        >
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><FiNavigation className="text-brand" /> Live tracking</h2>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {data?.jobId ? `Job ${data.jobId}` : 'Loading…'}
                {data?.engineer?.name ? ` · ${data.engineer.name}` : ''}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500" aria-label="Close"><FiX className="w-5 h-5" /></button>
          </div>

          <div className="flex-1 relative min-h-[360px] bg-gray-100">
            {isLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
              </div>
            ) : error ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-red-600">
                <FiAlertCircle className="w-6 h-6" />
                {error.response?.data?.message || 'Could not load tracking'}
                <button type="button" onClick={() => refetch()} className="text-brand font-semibold hover:underline">Retry</button>
              </div>
            ) : points.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-gray-500 px-6 text-center">
                <FiMapPin className="w-6 h-6" />
                {data?.reason || 'No location is available for this job yet.'}
              </div>
            ) : (
              <MapContainer center={points[0]} zoom={14} className="absolute inset-0 z-0" scrollWheelZoom>
                <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {engineerPos && (
                  <Marker position={[engineerPos.lat, engineerPos.lng]} icon={ENGINEER_ICON}>
                    <MapTooltip>{data?.engineer?.name || 'Engineer'}{engineerPos.updatedAt ? ` · ${fmtDateTime(engineerPos.updatedAt)}` : ''}</MapTooltip>
                  </Marker>
                )}
                {site && (
                  <Marker position={[site.lat, site.lng]} icon={SITE_ICON}>
                    <MapTooltip>{[site.address, site.city].filter(Boolean).join(', ') || 'Job site'}</MapTooltip>
                  </Marker>
                )}
                {points.length === 2 && <Polyline positions={points} pathOptions={{ color: '#10AFA5', dashArray: '6 6', weight: 3 }} />}
                <FitBounds points={points} />
              </MapContainer>
            )}
          </div>

          {data && (
            <div className="p-5 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500 flex items-center justify-center gap-1"><FiClock className="text-brand" /> ETA</p>
                <p className="text-lg font-bold text-gray-900">{data.etaMinutes === null ? '—' : data.etaMinutes === 0 ? 'On site' : `${data.etaMinutes} min`}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 flex items-center justify-center gap-1"><FiNavigation className="text-brand" /> Distance</p>
                <p className="text-lg font-bold text-gray-900">{data.distanceKm === null ? '—' : `${data.distanceKm} km`}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Last position</p>
                <p className={`text-sm font-semibold ${engineerPos && !livePos && data.engineerLocation?.stale ? 'text-amber-600' : 'text-gray-900'}`}>
                  {livePos ? 'Live' : data.engineerLocation?.ageMinutes != null ? `${data.engineerLocation.ageMinutes} min ago` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Engineer</p>
                {data.engineer?.phone ? (
                  <a href={`tel:${data.engineer.phone}`} className="text-sm font-semibold text-brand inline-flex items-center gap-1 hover:underline"><FiPhone /> Call</a>
                ) : <p className="text-sm text-gray-400">—</p>}
              </div>
              {data.etaBasis && <p className="col-span-2 sm:col-span-4 text-[11px] text-gray-400">ETA from {data.etaBasis}.</p>}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default LiveTrackingModal;
