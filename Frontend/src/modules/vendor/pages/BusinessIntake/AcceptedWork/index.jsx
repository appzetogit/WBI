import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, CheckCircle, TrendingUp, Handshake, MapPin } from 'lucide-react';
import { fetchAcceptedWork, formatINR } from '../../../services/businessIntakeService';
import { SkeletonGrid } from '../components/SkeletonCard';
import EmptyState from '../components/EmptyState';
import useVendorBasePath from '../../../hooks/useVendorBasePath';

const AwardCard = ({ item, projectsBase }) => {
  const projectId = item.projectId;
  const projectHref = projectId
    ? `${projectsBase}/${projectId}`
    : `${projectsBase}`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col h-full">
      <div className="p-5 flex-1">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold px-2 py-1 bg-green-100 text-green-700 rounded-lg flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5" /> Project Won
          </span>
          <span className="text-xs text-gray-500 font-medium">
            {new Date(item.wonAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>

        <h3 className="text-base font-bold text-gray-900 leading-snug mb-1 line-clamp-2">{item.title}</h3>
        <p className="text-xs text-gray-500 mb-3">{item.categoryName}</p>

        <div className="flex flex-wrap gap-2 text-xs text-gray-600 mb-4">
          {item.clientInfo?.company && (
            <span className="font-semibold">{item.clientInfo.company}</span>
          )}
          {item.requirements?.cities?.length > 0 && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {item.requirements.cities[0]} {item.requirements.cities.length > 1 && `+${item.requirements.cities.length - 1}`}
            </span>
          )}
        </div>
      </div>

      <div className="bg-green-50/50 border-t border-gray-100 p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-0.5">Awarded Value</p>
            <p className="text-lg font-black text-green-700">₹{(item.myBidAmount || 0).toLocaleString('en-IN')}</p>
          </div>
          <Link
            to={projectHref}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
          >
            Go to Project →
          </Link>
        </div>
      </div>
    </div>
  );
};

const LocalStatCard = ({ label, value, icon: Icon, color }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex items-center gap-4">
    <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color}`}>
      <Icon className="h-6 w-6 text-white" />
    </div>
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-black text-gray-900 mt-1">{value}</p>
    </div>
  </div>
);

const AcceptedWork = () => {
  const { basePath } = useVendorBasePath();
  const projectsBase = `${basePath}/projects`;
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({ wonThisMonth: 0, totalValue: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const res = await fetchAcceptedWork({ page: reset ? 1 : page, limit: 12 });
      const { data: items, stats: s, pagination } = res.data;
      setData(prev => reset ? items : [...prev, ...items]);
      setStats(s || { wonThisMonth: 0, totalValue: 0 });
      setHasMore(pagination.page < pagination.pages);
      if (reset) setPage(1);
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(true); }, []);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <LocalStatCard label="Won This Month" value={stats.wonThisMonth} icon={CheckCircle} color="bg-green-500" />
        <LocalStatCard label="Total Awarded Value" value={formatINR(stats.totalValue)} icon={TrendingUp} color="bg-blue-600" />
      </div>

      {loading && data.length === 0 ? (
        <SkeletonGrid count={4} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="No accepted work yet"
          description="Projects you win will appear here automatically."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.map(item => (
              <AwardCard key={item._id} item={item} projectsBase={projectsBase} />
            ))}
          </div>

          {hasMore && (
            <div className="text-center mt-8">
              <button
                onClick={() => { setPage(p => p + 1); load(false); }}
                disabled={loading}
                className="px-6 py-2.5 text-sm font-medium text-green-700 border border-green-300 rounded-xl hover:bg-green-50 disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load More Won Projects'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default AcceptedWork;
