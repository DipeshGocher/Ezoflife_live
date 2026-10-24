import { DEFAULT_INVOICE_SETTINGS, normalizeInvoiceSettings } from '../../../lib/invoiceSettings';
import React, { useState, useEffect } from 'react';
import { adminApi } from '../../../lib/api';
import { toast } from 'react-hot-toast';
import InvoicePrint from '../components/InvoicePrint';
import B2BInvoicePrint from '../../vendor/components/B2BInvoicePrint';

const AdminInvoiceSettings = () => {
    const [settings, setSettings] = useState({ ...DEFAULT_INVOICE_SETTINGS });
    const [loadError, setLoadError] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('Customer'); // 'Customer' or 'B2B'

    const fetchSettings = async () => {
        setLoading(true);
        setLoadError('');
        try {
            const configs = await adminApi.getConfig();
            if (!Array.isArray(configs)) throw new Error('Invalid configuration response');
            const invoiceConfig = configs.find(c => c.key === 'invoice_settings');
            if (invoiceConfig) {
                setSettings(normalizeInvoiceSettings(invoiceConfig.value));
            }
        } catch (err) {
            console.error('Failed to fetch invoice settings:', err);
            setLoadError('Invoice settings could not be loaded. Please retry before making changes.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleSave = async (event) => {
        event.preventDefault();
        try {
            setSaving(true);
            const validated = normalizeInvoiceSettings(settings, { validate: true });
            const saved = await adminApi.updateConfig('invoice_settings', validated);
            setSettings(normalizeInvoiceSettings(saved.value));
            toast.success('Invoice settings updated successfully');
        } catch (err) {
            toast.error(err.message || 'Failed to update settings');
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (field, value) => {
        setSettings(prev => ({ ...prev, [field]: value, ...(field === 'businessAddress' ? { registeredAddress: value } : {}) }));
    };

    const sampleCustomerOrder = {
        id: '#SPZ-98765',
        invoiceNo: 'SZ-CUST-2026-1001',
        date: 'May 05, 2026',
        user: { name: 'Julian Mendoza' },
        vendor: { id: 'VEN-001' },
        items: [
            { name: 'Regular Laundry (Wash & Fold)', qty: '5.0 kg', price: 300.00, serviceType: 'Per Kg' },
            { name: 'Premium Silk Saree', qty: '2 Units', price: 500.00, serviceType: 'Dry Clean' },
            { name: 'Men\'s Formal Shirt', qty: '4 Units', price: 80.00, serviceType: 'Steam Iron' }
        ],
        total: 1320.00
    };

    const sampleB2BOrder = {
        _id: 'b2border_12345678',
        b2bOrderId: 'B2B-436756',
        createdAt: new Date().toISOString(),
        totalAmount: 1500,
        items: [
            { name: 'Industrial Detergent (Batch A)', quantity: 2, price: 500 },
            { name: 'Plastic Packaging Rolls', quantity: 5, price: 100 }
        ],
        supplier: {
            displayName: 'Test Supplier Biz',
            supplierDetails: { businessName: 'Test Supplier Biz', gstNumber: '27AAAEZ1234F1Z1' },
            address: 'Industrial Estate, Phase 2, Delhi - 110020',
            phone: '9999999993',
            email: 'sales@testsupplier.com'
        },
        vendor: {
            shopDetails: { name: 'Laundry Partner Express' },
            address: 'Shop No 4, Main Road, Mumbai',
            phone: '9888888888',
            email: 'partner@express.com'
        }
    };

    if (loading) return <div className="p-8 text-center opacity-40">Loading settings...</div>;

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <header className="mb-10 flex flex-col lg:flex-row lg:justify-between lg:items-end gap-6">
                <div className="text-center lg:text-left">
                    <h1 className="text-3xl lg:text-4xl font-black tracking-tighter text-slate-900 uppercase leading-none">Invoice Customization</h1>
                    <p className="text-slate-500 font-medium mt-3 text-sm lg:text-base">Edit the business, contact and footer details used on your invoices.</p>
                </div>
                
                {/* Tab Switcher */}
                <div className="flex bg-slate-100 p-1.5 rounded-2xl lg:rounded-[1.2rem] shadow-inner w-full lg:w-auto">
                    {['Customer', 'B2B'].map(tab => (
                        <button 
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 lg:flex-none px-6 lg:px-8 py-3 lg:py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-slate-900 shadow-lg shadow-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <form onSubmit={handleSave} className="space-y-6">
                    {loadError && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
                        <p>{loadError}</p>
                        <button type="button" onClick={fetchSettings} className="mt-3 font-bold underline">Retry loading</button>
                    </div>}
                    <fieldset disabled={saving || !!loadError} className="space-y-6 disabled:opacity-50">
                        {[
                            { title: 'Business and contact details', fields: [
                                ['businessName', 'Business name', 'text', 120, true],
                                ['contactEmail', 'Contact email', 'email', 254],
                                ['contactPhone', 'Contact phone', 'tel', 40],
                                ['website', 'Website', 'text', 200],
                                ['gstNumber', 'Business GST number', 'text', 15],
                                ['businessAddress', 'Registered business address', 'textarea', 500],
                                ['logo', 'Logo image URL', 'url', 2000]
                            ] },
                            { title: 'Invoice details', fields: [
                                ['invoiceTitle', 'Invoice title', 'text', 60, true],
                                ['platformSacCode', 'Platform service accounting code', 'text', 8],
                                ['logisticsSacCode', 'Logistics service accounting code', 'text', 8],
                                ['promotionSacCode', 'Promotion service accounting code', 'text', 8],
                                ['paymentInstructions', 'Payment instructions', 'textarea', 1000],
                                ['customTerms', 'Terms and conditions', 'textarea', 2000],
                                ['invoiceNote', 'Footer note', 'textarea', 500]
                            ] }
                        ].map(section => <section key={section.title} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-5">
                            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">{section.title}</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {section.fields.map(([field, label, type, maxLength, required]) => <div key={field} className={`space-y-2 ${type === 'textarea' || field === 'logo' ? 'md:col-span-2' : ''}`}>
                                    <label htmlFor={`invoice-${field}`} className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</label>
                                    {type === 'textarea' ? <textarea id={`invoice-${field}`} rows={3} maxLength={maxLength} value={settings[field]}
                                        onChange={event => handleChange(field, event.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-slate-900/10" /> :
                                        <input id={`invoice-${field}`} type={type} required={required} maxLength={maxLength} value={settings[field]}
                                            onChange={event => handleChange(field, event.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-slate-900/10" />}
                                </div>)}
                            </div>
                        </section>)}
                        <section className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                            <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Display options</h2>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    ['showLogo', 'Show logo'], ['showTerms', 'Show terms'],
                                    ...(activeTab === 'Customer' ? [['showVendorDetails', 'Show vendor details'], ['showServiceFee', 'Show platform fee'], ['showTaxes', 'Show tax breakdown'], ['showDiscount', 'Show discount']] : [])
                                ].map(([field, label]) => <label key={field} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={settings[field]} onChange={event => handleChange(field, event.target.checked)} className="accent-slate-900" />{label}
                                </label>)}
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">Details are shared by customer and B2B invoices. Order items, recipients, amounts and invoice numbers come from the order.</p>
                        </section>
                        <button type="submit" disabled={saving || !!loadError} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg disabled:opacity-50">
                            {saving ? 'Saving...' : 'Save invoice details'}
                        </button>
                    </fieldset>
                </form>

                {/* Preview Panel */}
                <div className="sticky top-8 h-[calc(100vh-100px)] flex flex-col">
                    <div className="flex items-center justify-between mb-4 px-4">
                        <h2 className="text-xs font-black uppercase tracking-[0.4em] text-slate-400">{activeTab} Preview</h2>
                        <div className="flex items-center gap-2">
                             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                             <span className="text-[10px] font-black text-slate-900 uppercase">Live Rendering</span>
                        </div>
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-[3rem] border border-slate-100 shadow-inner overflow-hidden flex flex-col items-center">
                        <div className="w-full h-full overflow-y-auto p-4 flex flex-col items-center">
                             <div 
                                style={{ 
                                    transform: 'scale(0.4)',
                                    transformOrigin: 'top center',
                                    width: '850px',
                                    marginBottom: '-500px'
                                }}
                                className="bg-white shadow-2xl shrink-0"
                             >
                                {activeTab === 'Customer' ? (
                                    <InvoicePrint settings={settings} order={sampleCustomerOrder} />
                                ) : (
                                    <B2BInvoicePrint settings={settings} order={sampleB2BOrder} />
                                )}
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminInvoiceSettings;

