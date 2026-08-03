import api from './api';

export const cmsService = {
  /**
   * Get public CMS content by slug and targetPanel
   * @param {string} slug - 'about-us' | 'terms-services' | 'privacy-policy'
   * @param {string} targetPanel - 'user' | 'engineer' | 'b2b' | 'vendor'
   */
  getCmsContent: async (slug, targetPanel = 'user') => {
    try {
      const response = await api.get(`/cms/public/${slug}`, {
        params: { targetPanel }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching CMS content for ${slug} (${targetPanel}):`, error);
      throw error?.response?.data || { success: false, message: 'Failed to fetch content' };
    }
  },

  /**
   * Get all CMS content for Admin by targetPanel
   * @param {string} targetPanel - 'user' | 'engineer' | 'b2b' | 'vendor'
   */
  getAllCmsContentAdmin: async (targetPanel = 'user') => {
    try {
      const response = await api.get('/cms/admin', {
        params: { targetPanel }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching all CMS content for admin (${targetPanel}):`, error);
      throw error?.response?.data || { success: false, message: 'Failed to fetch CMS list' };
    }
  },

  /**
   * Update CMS content for Admin
   * @param {string} slug 
   * @param {object} data - { title, subtitle, content, isActive }
   * @param {string} targetPanel - 'user' | 'engineer' | 'b2b' | 'vendor'
   */
  updateCmsContentAdmin: async (slug, data, targetPanel = 'user') => {
    try {
      const response = await api.put(`/cms/admin/${slug}`, {
        ...data,
        targetPanel
      });
      return response.data;
    } catch (error) {
      console.error(`Error updating CMS content for ${slug} (${targetPanel}):`, error);
      throw error?.response?.data || { success: false, message: 'Failed to update CMS content' };
    }
  }
};

export default cmsService;

