import React from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

/**
 * PrefetchLink component
 * 
 * Replaces <Link> to enable instant navigation. 
 * On mouse enter, it triggers a React Query prefetch so the 
 * data is already downloading/cached by the time the user clicks.
 * 
 * @param {string} to - The route to navigate to
 * @param {Array} queryKey - The React Query key to prefetch
 * @param {Function} queryFn - The function that fetches the data
 * @param {ReactNode} children - Content of the link
 * @param {string} className - Additional CSS classes
 */
const PrefetchLink = ({ to, queryKey, queryFn, children, className, ...props }) => {
  const queryClient = useQueryClient();

  const handleMouseEnter = () => {
    if (queryKey && queryFn) {
      queryClient.prefetchQuery({
        queryKey,
        queryFn,
        staleTime: 5 * 60 * 1000, // 5 minutes
      });
    }
  };

  return (
    <Link 
      to={to} 
      className={className} 
      onMouseEnter={handleMouseEnter}
      {...props}
    >
      {children}
    </Link>
  );
};

export default PrefetchLink;
