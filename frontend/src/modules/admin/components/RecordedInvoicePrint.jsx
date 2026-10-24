import { customerInvoiceGst } from '../../../lib/customerInvoiceGst';
import { normalizeInvoiceSettings } from '../../../lib/invoiceSettings';
import React from 'react';

const RecordedInvoicePrint = ({ order, settings: savedSettings = {}, recordedOnly = false }) => {
    const settings = normalizeInvoiceSettings(savedSettings);
    if (!order) return null;

    const itemsTotal = (order.items || []).reduce((sum, item) => {
        if (item.quantity !== undefined) {
            return sum + (item.price * item.quantity);
        } else {
            return sum + item.price;
        }
    }, 0);

    const isMock = !recordedOnly && !order.priceBreakdown;
    const isHeritage = order.tier === 'Heritage' || order.serviceTier === 'Heritage';
    const gstPercent = recordedOnly ? order.priceBreakdown?.gstPercent : (isHeritage ? 18 : 5);

    const grandTotal = order.total || order.totalAmount || 0;
    const discount = order.discountAmount || (order.priceBreakdown?.discount !== undefined ? order.priceBreakdown.discount : (!recordedOnly && isMock && settings.showDiscount !== false ? 50 : 0));

    let platformFee = 0;
    if (!isMock) {
        platformFee = order.priceBreakdown?.platformFee || 0;
    } else if (itemsTotal !== grandTotal) {
        platformFee = settings.showServiceFee !== false ? grandTotal * 0.02 : 0;
    }

    let gstAmount = 0;
    if (!isMock) {
        gstAmount = order.priceBreakdown?.gstAmount || 0;
    } else {
        const target = grandTotal + discount - platformFee;
        const taxable = target / (1 + gstPercent / 100);
        gstAmount = target - taxable;
    }

    const logisticsFee = recordedOnly ? (order.priceBreakdown?.logisticsFee || 0) : 0;
    const expressSurcharge = recordedOnly ? (order.priceBreakdown?.expressSurcharge || 0) : 0;
    const subtotal = grandTotal - platformFee - gstAmount - logisticsFee - expressSurcharge + discount;

    const customerObj = order.user || order.customer;
    const gst = customerInvoiceGst(order, settings);
    const gstNotice = recordedOnly ? '' : 'Vendor to Customer Invoice';

    // Use settings or fallbacks
    const businessName = settings.businessName;
    const contactEmail = settings.contactEmail;

    return (
        <div className="bg-white p-12 max-w-[850px] mx-auto font-sans text-slate-900" id="invoice-content">
            {/* Header Section */}
            <div className="bg-[#f3f4f6] p-10 flex justify-between items-center relative overflow-hidden rounded-t-sm border border-slate-200">
                <div className="relative z-10 space-y-4">
                    <h1 className="text-[32px] font-black break-words max-w-[420px] tracking-tight leading-none text-slate-900">{businessName}</h1>
                    <p className="text-[11px] font-bold uppercase tracking-widest">{settings.invoiceTitle}</p>
                    <div className="space-y-1 text-[13px] font-bold text-slate-600">
                        <p className="tracking-tight">{settings.website}</p>
                        <p className="tracking-tight">{contactEmail}</p>
                        {settings.contactPhone && <p>{settings.contactPhone}</p>}
                        {settings.businessAddress && <p className="whitespace-pre-line break-words max-w-[420px]">{settings.businessAddress}</p>}
                        {gst.placement === 'header' && gst.value && (
                            <p className="tracking-tight">GST # {gst.value}</p>
                        )}
                    </div>
                </div>
                {settings.showLogo !== false && settings.logo && (
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg mb-3">
                            <img
                                src={settings.logo}
                                alt="Logo"
                                className="w-12 h-12 object-contain"
                            />
                        </div>
                        <span className="text-2xl font-black break-words max-w-[160px] text-center tracking-[0.2em] leading-none text-slate-900">{businessName}</span>
                    </div>
                )}
                {/* Subtle Geometric Background Pattern */}
                <div className="absolute inset-0 opacity-[0.01] pointer-events-none">
                    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M0 40L40 0H20L0 20V40Z" fill="#000000"/>
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#pattern)" />
                    </svg>
                </div>
            </div>

            {/* Order Info Section */}
            <div className="py-10 px-2 flex justify-between items-start border-x border-slate-200">
                <div className="space-y-2">
                    <p className="text-[13px] font-black uppercase tracking-tight text-slate-900">Invoice No: <span className="font-bold text-slate-600 ml-2">{order.invoiceNo || (recordedOnly ? 'Not issued' : `SZ-CUST-2026-${order.id?.slice(-4) || '1001'}`)}</span></p>
                    <p className="text-[13px] font-black uppercase tracking-tight text-slate-900">Customer Name: <span className="font-bold text-slate-600 ml-2">{customerObj?.displayName || order.user?.name || '[Customer Name]'}</span></p>
                    {gst.placement !== 'header' && gst.value && (
                        <p className="text-[13px] font-black uppercase tracking-tight text-slate-900">{gst.label}: <span className="font-bold text-slate-600 ml-2">{gst.value}</span></p>
                    )}
                    {settings.showVendorDetails !== false && (
                        <p className="text-[13px] font-black uppercase tracking-tight text-slate-900">Vendor ID : <span className="font-bold text-slate-600 ml-2">{order.vendor?.id || (recordedOnly ? 'Not recorded' : 'VEN-001')}</span></p>
                    )}
                    {gstNotice && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-purple-600 mt-2">{gstNotice}</p>
                    )}
                </div>
                <div className="space-y-2 text-right">
                    <p className="text-[13px] font-black uppercase tracking-tight text-slate-900">Order No: <span className="font-bold text-slate-600 ml-2">{order.orderNo || order.id || (recordedOnly ? 'Not recorded' : '#SPZ-98765')}</span></p>
                    <p className="text-[13px] font-black uppercase tracking-tight text-slate-900">Date: <span className="font-bold text-slate-600 ml-2">{order.date || (recordedOnly ? 'Not recorded' : 'May 05, 2026')}</span></p>
                </div>
            </div>

            {/* Items Table */}
            <div className="border border-slate-200 border-t-0">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-y border-slate-200">
                            <th className="border-r border-slate-200 px-6 py-4 text-left text-[11px] font-black uppercase tracking-widest text-slate-400">Item Description</th>
                            <th className="border-r border-slate-200 px-4 py-4 text-center text-[11px] font-black uppercase tracking-widest text-slate-400 w-20">SAC</th>
                            <th className="border-r border-slate-200 px-6 py-4 text-left text-[11px] font-black uppercase tracking-widest text-slate-400">Service Type</th>
                            <th className="border-r border-slate-200 px-4 py-4 text-center text-[11px] font-black uppercase tracking-widest text-slate-400 w-28">Qty / Weight</th>
                            <th className="border-r border-slate-200 px-6 py-4 text-right text-[11px] font-black uppercase tracking-widest text-slate-400 w-32">Unit Price</th>
                            <th className="px-6 py-4 text-right text-[11px] font-black uppercase tracking-widest text-slate-400 w-32">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {(order.items || []).map((item, i) => (
                            <tr key={i} className="hover:bg-slate-50/50">
                                <td className="border-r border-slate-200 px-6 py-4 text-[13px] font-bold text-slate-700">{item.name}</td>
                                <td className="border-r border-slate-200 px-4 py-4 text-center text-[13px] font-bold text-slate-500">{recordedOnly ? (item.sacCode || 'Not recorded') : '9994'}</td>
                                <td className="border-r border-slate-200 px-6 py-4 text-[13px] font-bold text-slate-600">{item.serviceType || (recordedOnly ? 'Not recorded' : 'Laundry')}</td>
                                <td className="border-r border-slate-200 px-4 py-4 text-center text-[13px] font-bold text-slate-700">{item.qty}</td>
                                <td className="border-r border-slate-200 px-6 py-4 text-right text-[13px] font-bold text-slate-700">₹{(item.unitPrice ?? (item.price / parseFloat(item.qty || 1))).toFixed(2)}</td>
                                <td className="px-6 py-4 text-right text-[13px] font-black text-slate-900">₹{item.price.toFixed(2)}</td>
                            </tr>
                        ))}
                        {/* Empty rows for layout */}
                        {[...Array(Math.max(0, 4 - (order.items?.length || 0)))].map((_, i) => (
                            <tr key={`blank-${i}`}>
                                <td className="border-r border-slate-200 px-6 py-8" colSpan={6}></td>
                            </tr>
                        ))}

                        {/* Calculations Section */}
                        <tr className="border-t-2 border-slate-900">
                            <td colSpan={5} className="border-r border-slate-200 px-6 py-3 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">Subtotal Services</td>
                            <td className="px-6 py-3 text-right text-[13px] font-black text-slate-900">₹{subtotal.toFixed(2)}</td>
                        </tr>
                        {settings.showServiceFee !== false && platformFee > 0 && (
                            <tr>
                                <td colSpan={5} className="border-r border-slate-200 px-6 py-3 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">Platform Fee</td>
                                <td className="px-6 py-3 text-right text-[13px] font-black text-slate-900">₹{platformFee.toFixed(2)}</td>
                            </tr>
                        )}
                        {recordedOnly && logisticsFee > 0 && <tr>
                            <td colSpan={5} className="border-r border-slate-200 px-6 py-3 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">Delivery Fee</td>
                            <td className="px-6 py-3 text-right text-[13px] font-black text-slate-900">₹{logisticsFee.toFixed(2)}</td>
                        </tr>}
                        {recordedOnly && expressSurcharge > 0 && <tr>
                            <td colSpan={5} className="border-r border-slate-200 px-6 py-3 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">Express Surcharge</td>
                            <td className="px-6 py-3 text-right text-[13px] font-black text-slate-900">₹{expressSurcharge.toFixed(2)}</td>
                        </tr>}
                        {settings.showDiscount !== false && discount > 0 && (
                            <tr>
                                <td colSpan={5} className="border-r border-slate-200 px-6 py-3 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">Promotional Discount</td>
                                <td className="px-6 py-3 text-right text-[13px] font-black text-slate-900">- ₹{discount.toFixed(2)}</td>
                            </tr>
                        )}
                        {settings.showTaxes !== false && (!recordedOnly || order.priceBreakdown?.gstAmount !== undefined) && (
                            <tr>
                                <td colSpan={5} className="border-r border-slate-200 px-6 py-3 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">GST{gstPercent !== undefined ? ` (${gstPercent}%)` : ''}</td>
                                <td className="px-6 py-3 text-right text-[13px] font-black text-slate-900">₹{gstAmount.toFixed(2)}</td>
                            </tr>
                        )}
                        <tr className="bg-slate-900 text-white">
                            <td colSpan={5} className="px-6 py-4 text-left text-[12px] font-black uppercase tracking-[0.2em]">Grand Total</td>
                            <td className="px-6 py-4 text-right text-[16px] font-black tracking-tight">₹{grandTotal.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Footer Section */}
            <div className="mt-12 text-center space-y-4">
                <div className="py-4 border-y border-slate-100">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em]">{settings.invoiceNote}</p>
                </div>
                <div className="pt-2">
                    {settings.paymentInstructions && <p className="text-[11px] text-slate-500 whitespace-pre-line mb-3">{settings.paymentInstructions}</p>}
                    {settings.showTerms !== false && (
                        <p className="text-[10px] font-bold text-slate-400 mb-2 whitespace-pre-line uppercase tracking-widest italic">{settings.customTerms}</p>
                    )}
                    <h3 className="text-[12px] font-black tracking-[0.3em] uppercase text-slate-900">{businessName}</h3>
                </div>
            </div>
        </div>
    );
};

export default RecordedInvoicePrint;
