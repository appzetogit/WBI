import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiTag, FiLoader, FiPlus, FiDownload, FiToggleLeft, FiToggleRight, FiTrash2, FiEdit2 } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import CardShell from '../UserCategories/components/CardShell';
import adminEngineerCouponService from '../../../../services/adminEngineerCouponService';
import { formatCurrency } from '../../utils/adminHelpers';

const emptyCoupon = () => ({
  code: '',
  title: '',
  description: '',
  discountType: 'flat',
  discountValue: 0,
  maxDiscount: 0,
  minAmount: 0,
  usageLimit: 0,
  perUserLimit: 1,
  validFrom: '',
  validTill: '',
  isActive: true,
  autoApply: false,
  isPublic: true,
  applicableUserTypes: ['freelancer', 'vendor_engineer'],
  applicableRegistrationTypes: ['engineer_joining_fee'],
  applicableServices: [],
  applicableLocations: []
});

const emptyBanner = () => ({
  title: '',
  subtitle: '',
  backgroundColor: '#4F46E5',
  textColor: '#FFFFFF',
  linkedCouponCode: '',
  placement: 'engineer_registration_payment',
  validFrom: '',
  validTill: '',
  isActive: true,
  priority: 0
});

const toInputDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 16);
};

const fromInputDate = (v) => (v ? new Date(v).toISOString() : null);

const EngineerCoupons = () => {
  const [tab, setTab] = useState('coupons');
  const [loading, setLoading] = useState(true);
  const [coupons, setCoupons] = useState([]);
  const [banners, setBanners] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [couponModal, setCouponModal] = useState(null);
  const [bannerModal, setBannerModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, bRes, aRes] = await Promise.all([
        adminEngineerCouponService.listCoupons(),
        adminEngineerCouponService.listBanners(),
        adminEngineerCouponService.getAnalytics()
      ]);
      if (cRes.success) setCoupons(cRes.data || []);
      if (bRes.success) setBanners(bRes.data || []);
      if (aRes.success) setAnalytics(aRes.data);
    } catch {
      toast.error('Failed to load coupon data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const summary = analytics?.summary;

  const openCreateCoupon = () => setCouponModal({ mode: 'create', form: emptyCoupon() });
  const openEditCoupon = (c) =>
    setCouponModal({
      mode: 'edit',
      id: c._id,
      form: {
        ...emptyCoupon(),
        ...c,
        applicableServices: (c.applicableServices || []).join(', '),
        applicableLocations: (c.applicableLocations || []).join(', '),
        validFrom: toInputDate(c.validFrom),
        validTill: toInputDate(c.validTill)
      }
    });

  const saveCoupon = async () => {
    if (!couponModal?.form?.code?.trim()) {
      toast.error('Coupon code is required');
      return;
    }
    setSaving(true);
    try {
      const f = couponModal.form;
      const payload = {
        ...f,
        code: f.code.trim().toUpperCase(),
        discountValue: Number(f.discountValue) || 0,
        maxDiscount: Number(f.maxDiscount) || 0,
        minAmount: Number(f.minAmount) || 0,
        usageLimit: Number(f.usageLimit) || 0,
        perUserLimit: Number(f.perUserLimit) || 1,
        validFrom:
          couponModal.mode === 'create' && !f.validFrom
            ? new Date().toISOString()
            : fromInputDate(f.validFrom) || undefined,
        validTill: fromInputDate(f.validTill),
        applicableServices: String(f.applicableServices || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        applicableLocations: String(f.applicableLocations || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        applicableRegistrationTypes: ['engineer_joining_fee'],
        applicableUserTypes:
          Array.isArray(f.applicableUserTypes) && f.applicableUserTypes.length
            ? f.applicableUserTypes
            : ['freelancer', 'vendor_engineer']
      };
      const res =
        couponModal.mode === 'edit'
          ? await adminEngineerCouponService.updateCoupon(couponModal.id, payload)
          : await adminEngineerCouponService.createCoupon(payload);
      if (res.success) {
        toast.success(couponModal.mode === 'edit' ? 'Coupon updated' : 'Coupon created');
        setCouponModal(null);
        loadAll();
      } else {
        toast.error(res.message || 'Save failed');
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleCoupon = async (id) => {
    try {
      const res = await adminEngineerCouponService.toggleCoupon(id);
      if (res.success) {
        setCoupons((prev) => prev.map((c) => (c._id === id ? res.data : c)));
      }
    } catch {
      toast.error('Toggle failed');
    }
  };

  const deleteCoupon = async (id) => {
    if (!window.confirm('Delete this coupon?')) return;
    try {
      const res = await adminEngineerCouponService.deleteCoupon(id);
      if (res.success) {
        toast.success('Deleted');
        loadAll();
      }
    } catch {
      toast.error('Delete failed');
    }
  };

  const openCreateBanner = () => setBannerModal({ mode: 'create', form: emptyBanner() });
  const openEditBanner = (b) =>
    setBannerModal({
      mode: 'edit',
      id: b._id,
      form: {
        ...emptyBanner(),
        ...b,
        validFrom: toInputDate(b.validFrom),
        validTill: toInputDate(b.validTill)
      }
    });

  const saveBanner = async () => {
    if (!bannerModal?.form?.title?.trim()) {
      toast.error('Banner title is required');
      return;
    }
    setSaving(true);
    try {
      const f = bannerModal.form;
      const payload = {
        ...f,
        priority: Number(f.priority) || 0,
        validFrom: fromInputDate(f.validFrom) || undefined,
        validTill: fromInputDate(f.validTill),
        linkedCouponCode: f.linkedCouponCode ? String(f.linkedCouponCode).toUpperCase().trim() : ''
      };
      const res =
        bannerModal.mode === 'edit'
          ? await adminEngineerCouponService.updateBanner(bannerModal.id, payload)
          : await adminEngineerCouponService.createBanner(payload);
      if (res.success) {
        toast.success('Banner saved');
        setBannerModal(null);
        loadAll();
      }
    } catch {
      toast.error('Banner save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteBanner = async (id) => {
    if (!window.confirm('Delete this banner?')) return;
    try {
      await adminEngineerCouponService.deleteBanner(id);
      toast.success('Banner deleted');
      loadAll();
    } catch {
      toast.error('Delete failed');
    }
  };

  const exportCsv = async () => {
    try {
      await adminEngineerCouponService.exportRedemptions();
    } catch {
      toast.error('Export failed');
    }
  };

  const tabBtn = (key, label) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        tab === key ? 'bg-[#4F46E5] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );

  const couponRows = useMemo(() => coupons, [coupons]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabBtn('coupons', 'Coupons')}
        {tabBtn('banners', 'Offer banners')}
        {tabBtn('analytics', 'Analytics')}
      </div>

      {tab === 'coupons' && (
        <CardShell icon={FiTag} title="Engineer registration coupons" subtitle="Joining fee offers — no code deploys required">
          <div className="flex justify-end mb-4">
            <button
              type="button"
              onClick={openCreateCoupon}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#4F46E5] text-white rounded-xl font-semibold text-sm"
            >
              <FiPlus /> New coupon
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <FiLoader className="animate-spin mr-2" /> Loading…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Discount</th>
                    <th className="py-2 pr-4">Usage</th>
                    <th className="py-2 pr-4">Schedule</th>
                    <th className="py-2 pr-4">Flags</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {couponRows.map((c) => (
                    <tr key={c._id} className="border-b border-gray-50">
                      <td className="py-3 pr-4 font-mono font-bold">{c.code}</td>
                      <td className="py-3 pr-4">
                        {c.discountType === 'percentage'
                          ? `${c.discountValue}%`
                          : formatCurrency(c.discountValue)}
                        {c.maxDiscount > 0 && c.discountType === 'percentage' && (
                          <span className="text-gray-400 text-xs block">max {formatCurrency(c.maxDiscount)}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        {c.usedCount || 0}
                        {c.usageLimit > 0 ? ` / ${c.usageLimit}` : ' / ∞'}
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-600">
                        {c.validFrom ? new Date(c.validFrom).toLocaleDateString() : '—'} →{' '}
                        {c.validTill ? new Date(c.validTill).toLocaleDateString() : 'No end'}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {c.autoApply && <span className="mr-1 px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded">Auto</span>}
                        {!c.isPublic && <span className="px-1.5 py-0.5 bg-gray-200 rounded">Private</span>}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => toggleCoupon(c._id)} className="text-gray-600" title="Toggle active">
                            {c.isActive ? <FiToggleRight className="w-6 h-6 text-green-600" /> : <FiToggleLeft className="w-6 h-6" />}
                          </button>
                          <button type="button" onClick={() => openEditCoupon(c)} className="text-blue-600">
                            <FiEdit2 />
                          </button>
                          <button type="button" onClick={() => deleteCoupon(c._id)} className="text-red-600">
                            <FiTrash2 />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!couponRows.length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        No coupons yet. Create one to show offers on engineer signup.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>
      )}

      {tab === 'banners' && (
        <CardShell icon={FiTag} title="Payment step banners" subtitle="Shown on engineer joining fee screen">
          <div className="flex justify-end mb-4">
            <button type="button" onClick={openCreateBanner} className="inline-flex items-center gap-2 px-4 py-2 bg-[#4F46E5] text-white rounded-xl font-semibold text-sm">
              <FiPlus /> New banner
            </button>
          </div>
          <div className="space-y-3">
            {banners.map((b) => (
              <div key={b._id} className="flex items-center justify-between border rounded-xl p-4">
                <div>
                  <p className="font-bold">{b.title}</p>
                  <p className="text-sm text-gray-500">{b.subtitle}</p>
                  <p className="text-xs text-gray-400 mt-1">Priority {b.priority} · {b.isActive ? 'Active' : 'Inactive'}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => openEditBanner(b)} className="text-blue-600 p-2">
                    <FiEdit2 />
                  </button>
                  <button type="button" onClick={() => deleteBanner(b._id)} className="text-red-600 p-2">
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))}
            {!banners.length && !loading && <p className="text-gray-500 text-center py-6">No banners configured.</p>}
          </div>
        </CardShell>
      )}

      {tab === 'analytics' && (
        <CardShell icon={FiTag} title="Redemption analytics">
          <div className="flex justify-end mb-4">
            <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-semibold">
              <FiDownload /> Export CSV
            </button>
          </div>
          {summary && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase">Redemptions</p>
                <p className="text-2xl font-bold">{summary.redemptions || 0}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase">Total discount</p>
                <p className="text-2xl font-bold">{formatCurrency(summary.totalDiscount || 0)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase">Net revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(summary.totalRevenue || 0)}</p>
              </div>
            </div>
          )}
          <h3 className="font-semibold mb-2">Recent redemptions</h3>
          <div className="overflow-x-auto max-h-96">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2">Date</th>
                  <th className="py-2">Code</th>
                  <th className="py-2">Mobile</th>
                  <th className="py-2">Discount</th>
                  <th className="py-2">Paid</th>
                </tr>
              </thead>
              <tbody>
                {(analytics?.recent || []).map((r) => (
                  <tr key={r._id} className="border-b border-gray-50">
                    <td className="py-2">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</td>
                    <td className="py-2 font-mono">{r.code}</td>
                    <td className="py-2">{r.mobile || '—'}</td>
                    <td className="py-2">{formatCurrency(r.discountAmount)}</td>
                    <td className="py-2">{formatCurrency(r.finalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardShell>
      )}

      {couponModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4">{couponModal.mode === 'edit' ? 'Edit coupon' : 'New coupon'}</h3>
            <div className="space-y-3 text-sm">
              {[
                ['code', 'Code', 'text'],
                ['title', 'Title', 'text'],
                ['discountValue', 'Discount value', 'number'],
                ['maxDiscount', 'Max discount (%)', 'number'],
                ['minAmount', 'Min registration amount', 'number'],
                ['usageLimit', 'Total usage limit (0 = unlimited)', 'number'],
                ['perUserLimit', 'Per-user limit', 'number']
              ].map(([key, label, type]) => (
                <label key={key} className="block">
                  <span className="text-gray-600">{label}</span>
                  <input
                    type={type}
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={couponModal.form[key]}
                    onChange={(e) =>
                      setCouponModal((m) => ({
                        ...m,
                        form: { ...m.form, [key]: type === 'number' ? e.target.value : e.target.value }
                      }))
                    }
                    disabled={couponModal.mode === 'edit' && key === 'code'}
                  />
                </label>
              ))}
              <label className="block">
                <span className="text-gray-600">Discount type</span>
                <select
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={couponModal.form.discountType}
                  onChange={(e) => setCouponModal((m) => ({ ...m, form: { ...m.form, discountType: e.target.value } }))}
                >
                  <option value="flat">Flat (₹)</option>
                  <option value="percentage">Percentage</option>
                </select>
              </label>
              <label className="block">
                <span className="text-gray-600">Valid from</span>
                <input
                  type="datetime-local"
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={couponModal.form.validFrom}
                  onChange={(e) => setCouponModal((m) => ({ ...m, form: { ...m.form, validFrom: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="text-gray-600">Valid till</span>
                <input
                  type="datetime-local"
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={couponModal.form.validTill}
                  onChange={(e) => setCouponModal((m) => ({ ...m, form: { ...m.form, validTill: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="text-gray-600">Services (comma-separated codes, empty = all)</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={couponModal.form.applicableServices}
                  onChange={(e) => setCouponModal((m) => ({ ...m, form: { ...m.form, applicableServices: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="text-gray-600">Locations (city/state, comma-separated)</span>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={couponModal.form.applicableLocations}
                  onChange={(e) => setCouponModal((m) => ({ ...m, form: { ...m.form, applicableLocations: e.target.value } }))}
                />
              </label>
              <div className="flex flex-wrap gap-4 pt-2">
                {[
                  ['isActive', 'Active'],
                  ['autoApply', 'Auto apply'],
                  ['isPublic', 'Public (list on signup)']
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!couponModal.form[key]}
                      onChange={(e) => setCouponModal((m) => ({ ...m, form: { ...m.form, [key]: e.target.checked } }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" className="px-4 py-2 rounded-lg border" onClick={() => setCouponModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#4F46E5] text-white font-semibold disabled:opacity-50"
                onClick={saveCoupon}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4">{bannerModal.mode === 'edit' ? 'Edit banner' : 'New banner'}</h3>
            <div className="space-y-3 text-sm">
              {['title', 'subtitle', 'linkedCouponCode', 'backgroundColor', 'textColor'].map((key) => (
                <label key={key} className="block">
                  <span className="text-gray-600 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                    value={bannerModal.form[key] || ''}
                    onChange={(e) => setBannerModal((m) => ({ ...m, form: { ...m.form, [key]: e.target.value } }))}
                  />
                </label>
              ))}
              <label className="block">
                <span className="text-gray-600">Priority</span>
                <input
                  type="number"
                  className="mt-1 w-full border rounded-lg px-3 py-2"
                  value={bannerModal.form.priority}
                  onChange={(e) => setBannerModal((m) => ({ ...m, form: { ...m.form, priority: e.target.value } }))}
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={bannerModal.form.isActive}
                  onChange={(e) => setBannerModal((m) => ({ ...m, form: { ...m.form, isActive: e.target.checked } }))}
                />
                Active
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button type="button" className="px-4 py-2 rounded-lg border" onClick={() => setBannerModal(null)}>
                Cancel
              </button>
              <button type="button" disabled={saving} className="px-4 py-2 rounded-lg bg-[#4F46E5] text-white font-semibold" onClick={saveBanner}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EngineerCoupons;
