/**
 * Map API/network errors to short production-safe messages.
 * Never surface stack traces, raw Axios dumps, or internal codes to users.
 */
export const getUserFacingError = (error, fallback = 'Something went wrong. Please try again.') => {
  if (!error) return fallback;

  const status = error.response?.status;
  const apiMessage = error.response?.data?.message || error.response?.data?.error;

  if (typeof apiMessage === 'string' && apiMessage.trim() && apiMessage.length < 160) {
    // Avoid leaking internal Mongo/SQL fragments
    if (/E11000|CastError|ValidationError|stack|at Object\./i.test(apiMessage)) {
      return fallback;
    }
    return apiMessage.trim();
  }

  if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
    return 'No internet connection. Check your network and try again.';
  }

  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested item was not found.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'Server is temporarily unavailable. Please try again shortly.';

  if (typeof error.message === 'string' && error.message.length < 120 && !/axios|fetch|http/i.test(error.message)) {
    return error.message;
  }

  return fallback;
};
