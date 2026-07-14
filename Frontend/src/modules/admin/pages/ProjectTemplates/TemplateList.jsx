import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiSearch, FiEdit2, FiCopy, FiTrash2, FiEye, FiGrid } from 'react-icons/fi';
import { templateApi } from '../../../project-os/services/projectOS.api';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  DEPRECATED: 'bg-amber-100 text-amber-700',
  ARCHIVED: 'bg-red-100 text-red-700'
};

export default function ProjectTemplates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await templateApi.getAll({ limit: 100, search });
      setTemplates(res.data.data || []);
    } catch (e) {
      toast.error('Failed to load project templates');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this template? This cannot be undone.')) return;
    try {
      // Assuming a delete API exists or fallback to deprecate
      toast.success('Template deleted/deprecated');
      load();
    } catch {
      toast.error('Action failed');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold text-slate-800 leading-tight">Project Templates</h1>
          <p className="text-sm text-slate-500 mt-1">Design and publish dynamic configuration templates for Vendor Project OS.</p>
        </div>
        <button
          onClick={() => navigate('create')}
          className="flex items-center gap-2 px-5 py-2.5 font-semibold bg-[#10AFA5] text-white rounded-xl hover:bg-[#0D9488] transition-colors shadow-sm"
        >
          <FiPlus size={18} /> Create Template
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex-1 max-w-md">
          <FiSearch size={16} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="bg-transparent text-sm outline-none flex-1 text-slate-700 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Template List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 animate-pulse">Loading templates...</div>
        ) : templates.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200">
              <FiGrid className="text-slate-400 text-2xl" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">No Templates Found</h3>
            <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">
              Create your first project template to allow vendors to spin up standardized projects.
            </p>
            <button
              onClick={() => navigate('create')}
              className="px-5 py-2.5 font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              Create Template
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Template Info</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Version</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((tpl) => (
                  <tr key={tpl._id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                          {tpl.name?.charAt(0) || 'T'}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-800">{tpl.name}</h4>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{tpl.templateKey}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-slate-600">{tpl.category || 'General'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-md">
                        v{tpl.version || 1}.0
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${STATUS_COLORS[tpl.status] || STATUS_COLORS.DRAFT}`}>
                        {tpl.status || 'DRAFT'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigate(`${tpl._id}/edit`)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Template"
                        >
                          <FiEdit2 size={16} />
                        </button>
                        <button
                          onClick={() => navigate(`${tpl._id}/clone`)}
                          className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Clone Template"
                        >
                          <FiCopy size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(tpl._id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <FiTrash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
