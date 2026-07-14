import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiArrowLeft, FiSave, FiCheck, FiSettings, FiGrid, FiFlag, FiCheckSquare, FiDollarSign, FiMapPin, FiAlertCircle, FiPackage } from 'react-icons/fi';
import toast from 'react-hot-toast';
import { templateApi } from '../../../project-os/services/projectOS.api';

const MODULES = [
  { key: 'SITES', label: 'Sites & Locations', icon: FiMapPin, desc: 'Manage physical locations for the project' },
  { key: 'TASKS', label: 'Task Management', icon: FiCheckSquare, desc: 'Kanban boards and checklists for execution' },
  { key: 'MILESTONES', label: 'Milestones', icon: FiFlag, desc: 'Project phases and payment triggers' },
  { key: 'ISSUES', label: 'Issue Tracking', icon: FiAlertCircle, desc: 'Blockers and site-level issues' },
  { key: 'INVENTORY', label: 'Inventory Management', icon: FiPackage, desc: 'Material requests and issuance' },
  { key: 'FINANCE', label: 'Finance & Invoicing', icon: FiDollarSign, desc: 'Budget, POs, and Vendor Invoices' },
];

export default function TemplateForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    templateKey: '',
    category: '',
    description: '',
    executionType: 'MULTI_SITE',
    modules: [],
  });

  const toggleModule = (key) => {
    setForm(prev => {
      const exists = prev.modules.find(m => m.key === key);
      if (exists) {
        return { ...prev, modules: prev.modules.filter(m => m.key !== key) };
      } else {
        return { ...prev, modules: [...prev.modules, { key, enabled: true }] };
      }
    });
  };

  const hasModule = (key) => form.modules.some(m => m.key === key);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.templateKey) return toast.error('Name and Template Key are required');
    
    setSaving(true);
    try {
      if (isEdit) {
        // await templateApi.update(id, form);
      } else {
        await templateApi.createAdminTemplate(form);
      }
      toast.success('Template saved successfully!');
      navigate('/admin/project-templates');
    } catch (err) {
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-colors"
          >
            <FiArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{isEdit ? 'Edit Template' : 'New Project Template'}</h1>
            <p className="text-sm text-slate-500">Configure modules and widgets for this service type</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 font-semibold bg-[#10AFA5] text-white rounded-xl hover:bg-[#0D9488] disabled:opacity-50 transition-colors shadow-sm"
        >
          {saving ? 'Saving...' : <><FiSave size={18} /> Save Template</>}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Basic Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <FiSettings className="text-slate-400" /> Basic Information
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Template Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm(f => ({ ...f, name: e.target.value, templateKey: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-') }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-[#10AFA5]"
                  placeholder="e.g. Solar Rollout - Basic"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Unique Key *</label>
                <input
                  value={form.templateKey}
                  onChange={(e) => setForm(f => ({ ...f, templateKey: e.target.value }))}
                  className="w-full border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5 text-sm outline-none font-mono"
                  placeholder="solar-rollout-basic"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none min-h-[80px]"
                placeholder="Brief description of this template"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Execution Type</label>
                <select
                  value={form.executionType}
                  onChange={(e) => setForm(f => ({ ...f, executionType: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white"
                >
                  <option value="MULTI_SITE">Multi-Site Rollout</option>
                  <option value="SINGLE_SITE">Single Site (Enterprise)</option>
                  <option value="SOFTWARE">Software / Digital Delivery</option>
                  <option value="INSPECTION">Inspection / Audit</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Service Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none bg-white"
                >
                  <option value="">-- Select Category --</option>
                  <option value="Solar">Solar Energy</option>
                  <option value="CCTV">Security & Surveillance</option>
                  <option value="Networking">Networking</option>
                  <option value="Banking">Banking Devices (ATM)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Modules */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-4">
              <FiGrid className="text-slate-400" /> Enable Modules
            </h2>
            <p className="text-xs text-slate-500 mb-5">Select which features should be available in the vendor dashboard for this project.</p>
            
            <div className="space-y-3">
              {MODULES.map(mod => {
                const isActive = hasModule(mod.key);
                return (
                  <label key={mod.key} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isActive ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                    <div className={`w-5 h-5 mt-0.5 rounded flex items-center justify-center shrink-0 border ${isActive ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300'}`}>
                      {isActive && <FiCheck size={14} />}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${isActive ? 'text-emerald-900' : 'text-slate-700'}`}>{mod.label}</p>
                      <p className={`text-xs ${isActive ? 'text-emerald-700/80' : 'text-slate-400'}`}>{mod.desc}</p>
                    </div>
                    <input type="checkbox" className="hidden" checked={isActive} onChange={() => toggleModule(mod.key)} />
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
