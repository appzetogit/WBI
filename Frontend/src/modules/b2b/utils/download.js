import toast from 'react-hot-toast';
import api from '../../../services/api';

/** Reads the filename the server set, falling back to `fallback`. */
const filenameFrom = (res, fallback) => {
  const cd = res.headers?.['content-disposition'] || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return match ? decodeURIComponent(match[1]) : fallback;
};

/** A blob error body is JSON from the API — surface its message. */
const blobErrorMessage = async (err) => {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return parsed?.message;
    } catch {
      return null;
    }
  }
  return data?.message;
};

/**
 * GET `url` as a file and save it. Shows progress and the API's error.
 */
export async function downloadFile(url, { params, fallbackName = 'download', label = 'Preparing download…' } = {}) {
  const id = toast.loading(label);
  try {
    const res = await api.get(url, { params, responseType: 'blob' });
    const href = window.URL.createObjectURL(new Blob([res.data], { type: res.headers?.['content-type'] }));
    const link = document.createElement('a');
    link.href = href;
    link.download = filenameFrom(res, fallbackName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => window.URL.revokeObjectURL(href), 1000);
    toast.success('Download ready', { id });
  } catch (err) {
    toast.error((await blobErrorMessage(err)) || 'Download failed', { id });
  }
}
