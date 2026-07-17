import React from 'react';
import { FiLoader } from 'react-icons/fi';

/**
 * SubmitButton
 * 
 * A generic submit button that inherently handles loading state 
 * and prevents double-clicks (debounce) during async operations.
 * It integrates seamlessly with React Hook Form or React Query's isPending.
 *
 * @param {boolean} isLoading - Whether the button should show a loading spinner
 * @param {string} loadingText - Text to show while loading (e.g. "Saving...")
 * @param {string} className - Additional CSS classes
 * @param {ReactNode} children - Button content (e.g. "Save Changes")
 */
const SubmitButton = ({
  isLoading = false,
  loadingText = 'Processing...',
  className = '',
  children,
  disabled,
  ...props
}) => {
  return (
    <button
      disabled={isLoading || disabled}
      className={`flex items-center justify-center gap-2 font-semibold transition-all rounded-lg 
        ${isLoading || disabled ? 'opacity-70 cursor-not-allowed' : 'hover:-translate-y-0.5 active:translate-y-0'} 
        ${className}`}
      {...props}
    >
      {isLoading ? (
        <>
          <FiLoader className="w-5 h-5 animate-spin" />
          <span>{loadingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};

export default SubmitButton;
