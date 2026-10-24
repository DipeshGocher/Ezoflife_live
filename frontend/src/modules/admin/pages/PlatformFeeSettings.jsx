import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Percent, IndianRupee, Save, MapPin, Info } from 'lucide-react';
import { b2bOrderApi, supplierServiceZoneApi } from '../../../lib/api';
import { computePlatformFee } from '../../vendor/utils/vendorCartCalculations';
import PageHeader from '../components/common/PageHeader';

const inputCls = 'w-full px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 rounded-sm text-[11px] font-bold text-slate-900 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-all outline-none disabled:bg-slate-50 disabled:text-slate-400';
const labelCls = 'text-[9px] font-black text-slate-800 uppercase tracking-widest block ml-1 mb-1.5';

const EMPTY = { enabled: true, type: 'FLAT', value: '40', minFee: '0', maxFee: '' };

const toForm = (cfg) => ({
    enabled: cfg.enabled === true,
    type: cfg.type || 'PERCENTAGE',
    value: String(cfg.value ?? 0),
    minFee: String(cfg.minFee ?? 0),
    maxFee: cfg.maxFee === null || cfg.maxFee === undefined ? '' : String(cfg.maxFee)
});

const zoneRuleText = (z) => {
    if (z.platformFeeMode === 'WAIVED') return 'Waived';
    const base = z.platformFeeMode === 'FLAT' ? `₹${z.platformFeeValue || 0} / order` : `${z.platformFeeValue || 0}% of goods`;
    const limits = [];
    if (z.platformFeeMode === 'PERCENTAGE' && Number(z.minSupplierPlatformFee) > 0) limits.push(`min ₹${z.minSupplierPlatformFee}`);
    if (z.platformFeeMode === 'PERCENTAGE' && z.maxSupplierPlatformFee !== null && z.maxSupplierPlatformFee !== undefined) limits.push(`max ₹${z.maxSupplierPlatformFee}`);
    return limits.length ? `${base} (${limits.join(', ')})` : base;
};

export default function PlatformFeeSettings() {
    const navigate = useNavigate();
    const [form, setForm] = useState(EMPTY);
    const [saved, setSaved] = useState(EMPTY);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [zones, setZones] = useState([]);
    const [previewAmount, setPreviewAmount] = useState('5000');

    useEffect(() => {
        const load = async () => {
            try {
                const [cfg, zoneList] = await Promise.all([
                    b2bOrderApi.getPlatformFeeConfig(),
                    supplierServiceZoneApi.getAll().catch(() => [])
                ]);
                const f = toForm(cfg);
                setForm(f);
                setSaved(f);
                setZones(Array.isArray(zoneList) ? zoneList : []);
            } catch (err) {
                toast.error(err.message || 'Failed to load platform fee settings');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const overrides = useMemo(
        () => zones.filter(z => z.platformFeeMode && z.platformFeeMode !== 'DEFAULT'),
        [zones]
    );

    const isPercentage = form.type === 'PERCENTAGE';
    const dirty = JSON.stringify(form) !== JSON.stringify(saved);

    const previewFee = useMemo(() => {
        if (!form.enabled) return 0;
        return computePlatformFee(Number(previewAmount) || 0, {
            type: form.type,
            value: Number(form.value) || 0,
            minFee: isPercentage ? Number(form.minFee) || 0 : 0,
            maxFee: isPercentage && form.maxFee !== '' ? Number(form.maxFee) : null
        });
    }, [form, previewAmount, isPercentage]);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                enabled: form.enabled,
                type: form.type,
                value: Number(form.value) || 0,
                // Min/max only bound a percentage fee.
                minFee: isPercentage ? Number(form.minFee) || 0 : 0,
                maxFee: isPercentage && form.maxFee !== '' ? Number(form.maxFee) : null
            };
            const res = await b2bOrderApi.updatePlatformFeeConfig(payload);
            const f = toForm(res);
            setForm(f);
            setSaved(f);
            toast.success('Platform fee settings saved');
        } catch (err) {
            toast.error(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
            <PageHeader title="Supplier Platform Fee" />

            <div className="p-4 sm:p-6 max-w-[1100px] mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Global default */}
                <form onSubmit={handleSave} className="lg:col-span-2 bg-white border border-slate-200 rounded-sm p-6 space-y-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-[12px] font-black text-slate-900 uppercase tracking-widest">Global Default</h2>
                            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed max-w-lg">
                                Charged to the vendor on every order they place with a supplier, once per supplier order,
                                on the goods value (excluding GST and delivery). Supplier zones set to
                                <span className="font-bold"> Use Global Default</span> follow this rule.
                            </p>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer shrink-0">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                                {form.enabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={form.enabled}
                                disabled={loading}
                                onChange={e => setForm({ ...form, enabled: e.target.checked })}
                            />
                            <span className="relative w-10 h-5 bg-slate-200 rounded-full peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-slate-900" />
                        </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Fee Type</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'PERCENTAGE', label: '% of Goods', Icon: Percent },
                                    { id: 'FLAT', label: 'Flat / Order', Icon: IndianRupee }
                                ].map(({ id, label, Icon }) => (
                                    <button
                                        type="button"
                                        key={id}
                                        disabled={loading || !form.enabled}
                                        onClick={() => setForm({ ...form, type: id })}
                                        className={`flex items-center justify-center gap-2 py-3 rounded-sm border text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 ${
                                            form.type === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                        }`}
                                    >
                                        <Icon size={13} /> {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className={labelCls} htmlFor="fee-value">
                                {isPercentage ? 'Fee (% of goods value)' : 'Fee per supplier order (₹)'}
                            </label>
                            <input
                                id="fee-value"
                                type="number"
                                min="0"
                                max={isPercentage ? 100 : undefined}
                                step="0.01"
                                required
                                disabled={loading || !form.enabled}
                                value={form.value}
                                onChange={e => setForm({ ...form, value: e.target.value })}
                                className={inputCls}
                            />
                        </div>
                        {isPercentage && (
                            <>
                                <div>
                                    <label className={labelCls} htmlFor="fee-min">Minimum Fee per Order (₹)</label>
                                    <input
                                        id="fee-min"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        disabled={loading || !form.enabled}
                                        value={form.minFee}
                                        onChange={e => setForm({ ...form, minFee: e.target.value })}
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls} htmlFor="fee-max">Maximum Fee per Order (₹)</label>
                                    <input
                                        id="fee-max"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="No limit"
                                        disabled={loading || !form.enabled}
                                        value={form.maxFee}
                                        onChange={e => setForm({ ...form, maxFee: e.target.value })}
                                        className={inputCls}
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100">
                        <p className="text-[10px] text-slate-400 font-bold flex items-center gap-1.5">
                            <Info size={12} /> Applies to new orders only. Existing orders keep the fee they were placed with.
                        </p>
                        <button
                            type="submit"
                            disabled={loading || saving || !dirty}
                            className="px-5 py-3 bg-slate-900 text-white rounded-sm text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black transition-all flex items-center gap-2 disabled:opacity-40 shrink-0"
                        >
                            <Save size={13} /> {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>

                {/* Preview */}
                <div className="bg-white border border-slate-200 rounded-sm p-6 space-y-4 h-fit">
                    <h2 className="text-[12px] font-black text-slate-900 uppercase tracking-widest">Preview</h2>
                    <div>
                        <label className={labelCls} htmlFor="fee-preview">Goods value of a supplier order (₹)</label>
                        <input
                            id="fee-preview"
                            type="number"
                            min="0"
                            value={previewAmount}
                            onChange={e => setPreviewAmount(e.target.value)}
                            className={inputCls}
                        />
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-sm p-4">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vendor pays platform</p>
                        <p className="text-2xl font-black text-slate-900 tabular-nums mt-1">₹{previewFee.toFixed(2)}</p>
                        {!form.enabled && (
                            <p className="text-[10px] text-slate-500 font-bold mt-1">Global fee is disabled</p>
                        )}
                    </div>
                </div>

                {/* Zone overrides */}
                <div className="lg:col-span-3 bg-white border border-slate-200 rounded-sm p-6">
                    <div className="flex items-center justify-between gap-4 mb-4">
                        <div>
                            <h2 className="text-[12px] font-black text-slate-900 uppercase tracking-widest">Supplier Zone Overrides</h2>
                            <p className="text-[11px] text-slate-500 mt-1">These zones use their own fee instead of the global default.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate('/admin/vendor-supply-pricing/zones')}
                            className="px-3 py-2 border border-slate-200 rounded-sm text-[9px] font-black uppercase tracking-[0.2em] text-slate-600 hover:bg-slate-50 flex items-center gap-2 shrink-0"
                        >
                            <MapPin size={12} /> Manage Zones
                        </button>
                    </div>
                    {overrides.length === 0 ? (
                        <p className="text-[11px] text-slate-400 font-bold py-6 text-center">
                            No overrides. Every supplier zone follows the global default.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-[11px]">
                                <thead className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                                    <tr>
                                        <th className="py-2 pr-4">Zone</th>
                                        <th className="py-2 pr-4">Supplier</th>
                                        <th className="py-2 pr-4">Fee Rule</th>
                                        <th className="py-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {overrides.map(z => (
                                        <tr key={z._id}>
                                            <td className="py-2.5 pr-4 font-bold text-slate-800 uppercase">{z.zoneName}</td>
                                            <td className="py-2.5 pr-4 text-slate-500">{z.supplierId}</td>
                                            <td className="py-2.5 pr-4 font-bold text-slate-900">{zoneRuleText(z)}</td>
                                            <td className="py-2.5 text-slate-500">{z.isActive ? 'Active' : 'Inactive'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
