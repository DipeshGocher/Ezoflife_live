import { usesCustomerReferenceTemplate, customerInvoiceGst } from '../../../lib/customerInvoiceGst';
import { renderRegisteredCustomerInvoice } from '../../../lib/registeredCustomerInvoice';
import RecordedInvoicePrint from './RecordedInvoicePrint';
import { invoiceMoney } from '../../../shared/utils/invoiceFormat';
import InvoiceDocument from '../../../shared/components/InvoiceDocument';

const InvoicePrint = ({ order, invoice = null, settings = {}, recordedOnly = false }) => {
    if (!order) return null;
    if (!invoice && !order.invoices?.customerInvoice && !order.gstSnapshot) return <RecordedInvoicePrint order={order} settings={settings} recordedOnly={recordedOnly} />;

    const custInv = invoice || order.invoices?.customerInvoice;
    if (usesCustomerReferenceTemplate(custInv)) return <div dangerouslySetInnerHTML={{ __html: renderRegisteredCustomerInvoice(order, settings, custInv) }} />;
    const gst = customerInvoiceGst(order, settings, custInv);
    const isFinalized = custInv?.documentStatus === 'FINALIZED';

    const customerObj = order.customer || order.user;
    const vendorObj = order.vendor;
    const scenario = gst.scenario || 'C';

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
    const invoiceDate = custInv?.invoiceDate ? new Date(custInv.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Finalized on delivery';
    const invoiceLines = custInv?.lineItems?.length ? custInv.lineItems : (order.items || []).map(item => ({
        description: item.name, sacCode: item.sacCode, quantity: item.quantity || 1, unit: item.unit,
        unitPrice: item.price, taxableValue: item.price * (item.quantity || 1), totalAmount: item.price * (item.quantity || 1)
    }));

    return <InvoiceDocument
        id="invoice-content"
        title={`Invoice 1 · ${scenario === 'C' ? 'Customer Invoice' : 'Customer Tax Invoice'}`}
        issuerName={supplierName} gstin={gst.placement === 'header' && gst.value ? `GST # ${gst.value}` : ''}
        finalized={isFinalized} settings={settings}
        metadata={[
            { title: 'Invoice details', rows: [
                { label: 'Invoice No', value: invoiceNo },
                { label: 'Order Ref', value: order.orderId || order.orderNo || order._id || '—' },
                { label: 'Date', value: invoiceDate },
                { label: 'Supplier Address', value: custInv?.supplierAddress || order.gstSnapshot?.vendorAddress || '—' },
                { label: 'Vendor GST', value: gst.placement === 'vendor' ? gst.value : undefined },
            ] },
            { title: 'Billed to', rows: [
                { label: 'Customer Name', value: order.gstSnapshot?.customerName || order.customerSnapshot?.displayName || customerObj?.displayName || 'Customer' },
                { label: 'Recipient Address', value: custInv?.recipientAddress || order.gstSnapshot?.customerAddress || '—' },
                { label: 'Customer GST', value: gst.placement === 'customer' ? gst.value : undefined },
                { label: 'Place of supply', value: custInv?.placeOfSupplyStateCode ? `State code ${custInv.placeOfSupplyStateCode}` : undefined },
            ] },
        ]}
        lines={invoiceLines}
        summary={[
            { label: 'Line items subtotal (before GST)', value: invoiceMoney(invoiceLines.reduce((sum, line) => sum + Number(line.taxableValue || 0), 0)) },
            { label: 'Platform checkout discount', value: `− ${invoiceMoney(discount)}`, show: discount > 0 },
            { label: 'Total service value', value: invoiceMoney(serviceValue) },
            { label: scenario === 'C' ? 'GST (0% · Unregistered vendor)' : 'Total GST', value: invoiceMoney(taxAmount) },
            ...['cgst', 'sgst', 'igst'].map(tax => ({ label: tax.toUpperCase(), value: invoiceMoney(custInv?.[`${tax}Amount`]), show: Number(custInv?.[`${tax}Amount`]) > 0 })),
            { label: 'Customer wallet cashback (50% promotion benefit)', value: `${invoiceMoney(customerWalletCredit)} Credit`, show: customerWalletCredit > 0 },
        ]}
        totalLabel="Total customer payment" total={grandTotal}
    />;
};

export default InvoicePrint;
