import React from 'react';

const InvoicePrint = ({ order, invoice = null, settings = {} }) => {
    if (!order) return null;

    const custInv = invoice || order.invoices?.customerInvoice;
    const isFinalized = custInv?.documentStatus === 'FINALIZED';

    const customerObj = order.customer || order.user;
    const customerGstin = custInv ? (custInv.recipientGstin || '') : (order.gstSnapshot?.customerGstin || customerObj?.gstNumber || '');
    const isCustRD = order.gstSnapshot?.customerRegistered ?? Boolean(custInv?.gstScenario === 'RD_RD');

    const vendorObj = order.vendor;
    const vendorGstin = custInv ? (custInv.supplierGstin || '') : (order.gstSnapshot?.vendorGstin || vendorObj?.shopDetails?.gst || vendorObj?.gstNumber || order.vendorSnapshot?.gstNumber || '');
    const isVendRD = order.gstSnapshot?.vendorRegistered ?? Boolean(['RD_RD', 'URD_RD'].includes(custInv?.gstScenario));

    let scenario = custInv?.scenario;
    if (!scenario) {
        if (isCustRD && isVendRD) scenario = 'A';
        else if (!isCustRD && isVendRD) scenario = 'B';
        else scenario = 'C';
    }

    let displayGstNo = custInv?.displayGstinNo;
    let displayGstLabel = custInv?.displayGstinLabel;
    let gstNotice = '';

    if (scenario === 'A') {
        displayGstNo = displayGstNo || customerGstin;
        displayGstLabel = displayGstLabel || "Customer GSTIN";
        gstNotice = "Scenario A: B2B Tax Invoice - Tax Credit Available";
    } else if (scenario === 'B') {
        displayGstNo = displayGstNo || vendorGstin;
        displayGstLabel = displayGstLabel || "Vendor GSTIN";
        gstNotice = "Scenario B: B2C Tax Invoice";
    } else {
        displayGstNo = displayGstNo || order.gstSnapshot?.spinzytGstin || settings.gstNumber || '';
        displayGstLabel = displayGstLabel || "Spinzyt GSTIN";
        gstNotice = "Scenario C: Marketplace / Platform Invoice (0% GST Unregistered Vendor)";
    }

    const baseWithArea = Number(order.priceBreakdown?.baseWithArea || 0) || (order.items || []).reduce((s, i) => s + (i.price * (i.quantity || i.qty || 1)), 0);
    const expressSurcharge = Number(order.priceBreakdown?.expressSurcharge || 0);
    const platformFee = Number(order.priceBreakdown?.platformFee || 0);
    const logisticsFee = Number(order.priceBreakdown?.logisticsFee || order.deliveryCharge || 0);
    const discount = Number(custInv?.discountAmount ?? order.checkoutDiscountAmount ?? 0);

    const serviceValue = custInv?.serviceValue !== undefined 
        ? custInv.serviceValue 
        : Math.round((baseWithArea + expressSurcharge + platformFee + logisticsFee) * 100) / 100;

    const taxPercent = custInv?.taxPercent !== undefined 
        ? custInv.taxPercent 
        : (scenario === 'C' ? 0 : Number(order.gstSnapshot?.gstPercent ?? settings.gstPercent ?? 0));

    const taxAmount = custInv?.taxAmount !== undefined 
        ? custInv.taxAmount 
        : (scenario === 'C' ? 0 : Math.round(serviceValue * (taxPercent / 100) * 100) / 100);

    const customerWalletCredit = custInv?.customerWalletCredit !== undefined 
        ? custInv.customerWalletCredit 
        : (order.ledger?.customerWalletCredit || 0);

    const grandTotal = custInv?.totalAmount !== undefined 
        ? custInv.totalAmount 
        : (serviceValue + taxAmount);

    const invoiceNo = custInv?.invoiceNo || 'Pending delivery';
    const supplierName = custInv?.issuerName || order.gstSnapshot?.vendorName || vendorObj?.shopDetails?.name || 'Partner Vendor';
    const contactEmail = settings.contactEmail || 'connect@spinzyt.com';
    const invoiceDate = custInv?.invoiceDate ? new Date(custInv.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Finalized on delivery';
    const invoiceLines = custInv?.lineItems?.length ? custInv.lineItems : (order.items || []).map(item => ({
        description: item.name, sacCode: item.sacCode, quantity: item.quantity || 1, unit: item.unit,
        unitPrice: item.price, taxableValue: item.price * (item.quantity || 1), totalAmount: item.price * (item.quantity || 1)
    }));

    return (
        <div className="bg-white p-12 max-w-[850px] mx-auto font-sans text-slate-900" id="invoice-content">
            {/* Header Section */}
            <div className="bg-[#f3f4f6] p-10 flex justify-between items-center relative overflow-hidden rounded-t-sm border border-slate-200">
                <div className="relative z-10 space-y-4">
                    <h1 className="text-[32px] font-black tracking-tight leading-none text-slate-900">{supplierName}</h1>
                    <div className="inline-block bg-purple-100 text-purple-800 border border-purple-200 px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest">
                        Invoice 1 • {scenario === 'C' ? 'Customer Invoice' : 'Customer Tax Invoice'}
                    </div>
                    <div className="space-y-1 text-[13px] font-bold text-slate-600">
                        <p className="tracking-tight">www.spinzyt.com • {contactEmail}</p>
                        {displayGstNo && (
                            <p className="tracking-tight text-slate-900 font-black">{displayGstLabel}: {displayGstNo}</p>
                        )}
                    </div>
                </div>
                {!isFinalized && <div className="absolute top-3 right-3 bg-amber-100 text-amber-800 px-3 py-1 text-[10px] font-black uppercase">Draft — Not a Tax Invoice</div>}
                {settings.showLogo !== false && (
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg mb-3">
                            <img 
                                src="/logo.png"
                                alt="Spinzyt"
                                className="w-12 h-12 object-contain"
                            />
                        </div>
                        <span className="text-2xl font-black tracking-[0.2em] leading-none text-slate-900">SPINZYT</span>
                    </div>
                )}
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
            <div className="py-8 px-4 flex justify-between items-start border-x border-slate-200 bg-slate-50/50">
                <div className="space-y-1.5">
                    <p className="text-[13px] font-black uppercase tracking-tight text-slate-900">Invoice No: <span className="font-mono text-purple-700 ml-2">{invoiceNo}</span></p>
                    <p className="text-[13px] font-black uppercase tracking-tight text-slate-900">Customer Name: <span className="font-bold text-slate-600 ml-2">{order.gstSnapshot?.customerName || order.customerSnapshot?.displayName || customerObj?.displayName || 'Customer'}</span></p>
                    <p className="text-[11px] font-medium text-slate-600">Supplier Address: {custInv?.supplierAddress || order.gstSnapshot?.vendorAddress || '—'}</p>
                    <p className="text-[11px] font-medium text-slate-600">Recipient Address: {custInv?.recipientAddress || order.gstSnapshot?.customerAddress || '—'}</p>
                    {customerGstin && (
                        <p className="text-[13px] font-black uppercase tracking-tight text-slate-900">Customer GSTIN: <span className="font-bold text-slate-900 ml-2">{customerGstin}</span></p>
                    )}
                    {vendorObj && (
                        <p className="text-[12px] font-black uppercase tracking-tight text-slate-700">Vendor: <span className="font-bold text-slate-600 ml-2">{supplierName} {vendorGstin ? `(${vendorGstin})` : ''}</span></p>
                    )}
                    {gstNotice && (
                        <p className="text-[11px] font-black uppercase tracking-wider text-purple-700 mt-2 bg-purple-50 inline-block px-2 py-1 rounded border border-purple-200">{gstNotice}</p>
                    )}
                </div>
                <div className="space-y-1.5 text-right">
                    <p className="text-[13px] font-black uppercase tracking-tight text-slate-900">Order Ref: <span className="font-bold text-slate-600 ml-2">{order.orderId || order.orderNo || '#SPZ-98765'}</span></p>
                    <p className="text-[13px] font-black uppercase tracking-tight text-slate-900">Date: <span className="font-bold text-slate-600 ml-2">{invoiceDate}</span></p>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Classification: <span className="text-slate-900 font-bold">Scenario {scenario}</span></p>
                </div>
            </div>

            {/* Items Table */}
            <div className="border border-slate-200">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-100 border-b border-slate-200">
                            <th className="border-r border-slate-200 px-6 py-4 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">Item Description</th>
                            <th className="border-r border-slate-200 px-4 py-4 text-center text-[11px] font-black uppercase tracking-widest text-slate-500 w-20">SAC</th>
                            <th className="border-r border-slate-200 px-6 py-4 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">Service Type</th>
                            <th className="border-r border-slate-200 px-4 py-4 text-center text-[11px] font-black uppercase tracking-widest text-slate-500 w-24">Qty</th>
                            <th className="border-r border-slate-200 px-6 py-4 text-right text-[11px] font-black uppercase tracking-widest text-slate-500 w-28">Unit Price</th>
                            <th className="px-6 py-4 text-right text-[11px] font-black uppercase tracking-widest text-slate-500 w-32">Total</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {invoiceLines.map((item, i) => (
                            <tr key={i} className="hover:bg-slate-50/50">
                                <td className="border-r border-slate-200 px-6 py-3.5 text-[13px] font-bold text-slate-800">{item.description}</td>
                                <td className="border-r border-slate-200 px-4 py-3.5 text-center text-[12px] font-mono text-slate-500">{item.sacCode || '—'}</td>
                                <td className="border-r border-slate-200 px-6 py-3.5 text-[13px] font-medium text-slate-600">{item.unit || 'service'} · GST {Number(item.gstRate ?? taxPercent)}%</td>
                                <td className="border-r border-slate-200 px-4 py-3.5 text-center text-[13px] font-bold text-slate-700">{item.quantity || 1}</td>
                                <td className="border-r border-slate-200 px-6 py-3.5 text-right text-[13px] font-bold text-slate-700">₹{Number(item.unitPrice || 0).toFixed(2)}</td>
                                <td className="px-6 py-3.5 text-right text-[13px] font-black text-slate-900">₹{Number(item.totalAmount ?? item.taxableValue ?? 0).toFixed(2)}</td>
                            </tr>
                        ))}
                        
                        {/* Frozen line values already include platform and logistics components. */}
                        <tr className="border-t-2 border-slate-300 bg-slate-50/50">
                            <td colSpan={5} className="px-6 py-3 text-left text-[11px] font-black uppercase tracking-widest text-slate-500">Line Items Subtotal (Before GST)</td>
                            <td className="px-6 py-3 text-right text-[13px] font-black text-slate-900">₹{invoiceLines.reduce((sum, line) => sum + Number(line.taxableValue || 0), 0).toFixed(2)}</td>
                        </tr>
                        {discount > 0 && (
                            <tr className="bg-slate-50/50 text-emerald-700">
                                <td colSpan={5} className="px-6 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider">Platform Checkout Discount</td>
                                <td className="px-6 py-2.5 text-right text-[13px] font-bold">- ₹{discount.toFixed(2)}</td>
                            </tr>
                        )}

                        <tr className="bg-slate-100 border-t border-slate-200">
                            <td colSpan={5} className="border-r border-slate-200 px-6 py-3 text-left text-[12px] font-black uppercase tracking-wider text-slate-800">Total Service Value</td>
                            <td className="px-6 py-3 text-right text-[13px] font-black text-slate-900">₹{serviceValue.toFixed(2)}</td>
                        </tr>

                        {/* Promotional Discount (Customer Wallet Share only) */}
                        {customerWalletCredit > 0 && (
                            <tr className="bg-emerald-50/50">
                                <td colSpan={5} className="border-r border-slate-200 px-6 py-3 text-left text-[11px] font-black uppercase tracking-widest text-emerald-800">
                                    Customer Wallet Cashback (50% Promotion Benefit)
                                </td>
                                <td className="px-6 py-3 text-right text-[13px] font-black text-emerald-700">₹{customerWalletCredit.toFixed(2)} Credit</td>
                            </tr>
                        )}

                        {/* Taxes */}
                        <tr>
                            <td colSpan={5} className="border-r border-slate-200 px-6 py-3 text-left text-[11px] font-black uppercase tracking-widest text-slate-600">
                                {scenario === 'C' ? 'GST (0% - Unregistered Vendor Facilitated)' : 'Total GST (Line Rates Above)'}
                            </td>
                            <td className="px-6 py-3 text-right text-[13px] font-black text-slate-900">
                                {scenario === 'C' ? '₹0.00 (Inclusive)' : `₹${taxAmount.toFixed(2)}`}
                            </td>
                        </tr>
                        {Number(custInv?.cgstAmount || 0) > 0 && <tr><td colSpan={5} className="px-6 py-2 font-bold">CGST</td><td className="px-6 py-2 text-right font-bold">₹{Number(custInv.cgstAmount).toFixed(2)}</td></tr>}
                        {Number(custInv?.sgstAmount || 0) > 0 && <tr><td colSpan={5} className="px-6 py-2 font-bold">SGST</td><td className="px-6 py-2 text-right font-bold">₹{Number(custInv.sgstAmount).toFixed(2)}</td></tr>}
                        {Number(custInv?.igstAmount || 0) > 0 && <tr><td colSpan={5} className="px-6 py-2 font-bold">IGST</td><td className="px-6 py-2 text-right font-bold">₹{Number(custInv.igstAmount).toFixed(2)}</td></tr>}

                        {/* Grand Total */}
                        <tr className="bg-slate-900 text-white">
                            <td colSpan={5} className="px-6 py-4 text-left text-[12px] font-black uppercase tracking-[0.2em]">Total Customer Payment (Invoice 1)</td>
                            <td className="px-6 py-4 text-right text-[17px] font-black tracking-tight">₹{grandTotal.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Footer Section */}
            <div className="mt-10 text-center space-y-3">
                <div className="py-3 border-y border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">{settings.invoiceNote || 'This is a computer generated invoice and does not require a physical signature.'}</p>
                </div>
                <div className="pt-1">
                    {settings.showTerms !== false && settings.customTerms && (
                        <p className="text-[10px] font-medium text-slate-500 mb-1 tracking-wide">{settings.customTerms}</p>
                    )}
                    <h3 className="text-[12px] font-black tracking-[0.2em] uppercase text-slate-900">{supplierName}</h3>
                </div>
            </div>
        </div>
    );
};

export default InvoicePrint;
