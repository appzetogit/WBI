import api from './api';

export const cmsService = {
  /**
   * Get public CMS content by slug
   * @param {string} slug - 'about-us' | 'terms-services' | 'privacy-policy'
   */
  getCmsContent: async (slug) => {
    try {
      const response = await api.get(`/cms/public/${slug}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching CMS content for ${slug}:`, error);
      throw error?.response?.data || { success: false, message: 'Failed to fetch content' };
    }
  },

  /**
   * Get all CMS content for Admin
   */
  getAllCmsContentAdmin: async () => {
    try {
      const response = await api.get('/cms/admin');
      return response.data;
    } catch (error) {
      console.error('Error fetching all CMS content for admin:', error);
      throw error?.response?.data || { success: false, message: 'Failed to fetch CMS list' };
    }
  },

  /**
   * Update CMS content for Admin
   * @param {string} slug 
   * @param {object} data - { title, subtitle, content, isActive }
   */
  updateCmsContentAdmin: async (slug, data) => {
    try {
      const response = await api.put(`/cms/admin/${slug}`, data);
      return response.data;
    } catch (error) {
      console.error(`Error updating CMS content for ${slug}:`, error);
      throw error?.response?.data || { success: false, message: 'Failed to update CMS content' };
    }
  }
};

export default cmsService;
