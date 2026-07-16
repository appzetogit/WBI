// Skeleton loading cards
export const SkeletonCard = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
    <div className="flex gap-2 mb-3">
      <div className="h-5 w-24 bg-gray-200 rounded-full" />
      <div className="h-5 w-16 bg-gray-200 rounded-full" />
    </div>
    <div className="h-5 w-3/4 bg-gray-200 rounded mb-2" />
    <div className="h-4 w-1/3 bg-gray-100 rounded mb-4" />
    <div className="flex gap-4 mb-4">
      <div className="h-4 w-20 bg-gray-100 rounded" />
      <div className="h-4 w-20 bg-gray-100 rounded" />
      <div className="h-4 w-24 bg-gray-100 rounded" />
    </div>
    <div className="flex gap-2">
      <div className="flex-1 h-9 bg-gray-100 rounded-lg" />
      <div className="flex-1 h-9 bg-blue-100 rounded-lg" />
    </div>
  </div>
);

export const SkeletonGrid = ({ count = 6 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
  </div>
);
