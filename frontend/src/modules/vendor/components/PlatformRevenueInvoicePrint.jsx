import { usesPlatformReferenceTemplate, renderPlatformReferenceInvoice } from '../../../lib/platformReferenceInvoice';
import { invoiceMoney } from '../../../shared/utils/invoiceFormat';
import InvoiceDocument from "../../../shared/components/InvoiceDocument";

const PlatformRevenueInvoicePrint = ({
  order,
  invoice = null,
  settings = {},
}) => {
  if (!order) return null;

  const platInv = invoice || order.invoices?.platformInvoice || {};
  if (usesPlatformReferenceTemplate(order, platInv)) return <div dangerouslySetInnerHTML={{ __html: renderPlatformReferenceInvoice(order, settings, platInv).replace('id="invoice-content"', 'id="platform-invoice-content"') }} />;
  const isFinalized = platInv.documentStatus === "FINALIZED";

  const businessName = platInv.issuerName || settings.businessName || "EZOFLIFE TECHNOLOGY LLP";
  const spinzytGstin =
    platInv.spinzytGstin || order.gstSnapshot?.spinzytGstin || settings.gstNumber || "";

  const platformFee =
    platInv.platformFee !== undefined
      ? platInv.platformFee
      : order.priceBreakdown?.platformFee || 0;
  const platformFeeTaxPercent = Number(platInv.platformFeeTaxPercent ?? order.gstSnapshot?.platformFeeGstPercent ?? 0);
  const platformFeeTax =
    platInv.platformFeeTax !== undefined
      ? platInv.platformFeeTax
      : Math.round(platformFee * (platformFeeTaxPercent / 100) * 100) / 100;

  const logisticsFee =
    platInv.logisticsFee !== undefined
      ? platInv.logisticsFee
      : order.priceBreakdown?.logisticsFee || order.deliveryCharge || 0;
  const logisticsFeeTaxPercent = Number(platInv.logisticsFeeTaxPercent ?? order.gstSnapshot?.logisticsFeeGstPercent ?? 0);
  const logisticsFeeTax =
    platInv.logisticsFeeTax !== undefined
      ? platInv.logisticsFeeTax
      : Math.round(logisticsFee * (logisticsFeeTaxPercent / 100) * 100) / 100;

  const spinzytPromoShare =
    platInv.spinzytPromoShare ?? order.ledger?.spinzytPromoShare ?? 0;

  const totalInvoiceAmount =
    platInv.totalInvoiceAmount !== undefined
      ? platInv.totalInvoiceAmount
      : Math.round(
          (platformFee +
            platformFeeTax +
            logisticsFee +
            logisticsFeeTax +
            spinzytPromoShare) *
            100,
        ) / 100;

  const vendorObj = order.vendor || {};
  const vendorName =
    order.vendorSnapshot?.displayName ||
    order.gstSnapshot?.vendorName ||
    vendorObj.displayName ||
    "Partner Vendor";
  const shopName =
    platInv.recipientName ||
    order.gstSnapshot?.vendorName ||
    vendorObj.shopDetails?.name ||
    order.vendorSnapshot?.shopName ||
    "Partner Shop";
  const vendorGstin = platInv.documentStatus
    ? (platInv.recipientGstin || "URD (Unregistered)")
    : vendorObj.shopDetails?.gst ||
    vendorObj.gstNumber ||
    order.vendorSnapshot?.gstNumber ||
    "URD (Unregistered)";

  const invoiceNo =
    platInv.invoiceNo || "Pending delivery";
  const orderNo = order.orderId || order.orderNo || order._id || "N/A";
  const invoiceDate = platInv.invoiceDate
    ? new Date(platInv.invoiceDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Finalized on delivery";
  const fallbackLine = (description, taxableValue, rate, tax) => ({
    description, quantity: 1, unitPrice: taxableValue, taxableValue, gstRate: rate,
    igstAmount: tax, totalAmount: Number(taxableValue) + Number(tax),
  });
  const lines = platInv.lineItems?.length ? platInv.lineItems : [
    fallbackLine('Platform Facilitation Fee', platformFee, platformFeeTaxPercent, platformFeeTax),
    fallbackLine('Logistics / Transportation Fee', logisticsFee, logisticsFeeTaxPercent, logisticsFeeTax),
    ...(spinzytPromoShare > 0 ? [fallbackLine('Spinzyt Promo Share', spinzytPromoShare, 0, 0)] : []),
  ];
  return <InvoiceDocument
    id="platform-invoice-content" title="Invoice 2 · Platform Charges"
    issuerName={businessName} gstin={spinzytGstin ? `Spinzyt GSTIN: ${spinzytGstin}` : ''}
    finalized={isFinalized} settings={settings}
    metadata={[
      { title: 'Invoice details', rows: [
        { label: 'Invoice No', value: invoiceNo }, { label: 'Order Ref', value: orderNo },
        { label: 'Date', value: invoiceDate }, { label: 'Supplier Address', value: platInv.supplierAddress || '—' },
      ] },
      { title: 'Billed to (vendor)', rows: [
        { label: 'Vendor', value: shopName === vendorName ? shopName : `${shopName} (${vendorName})` },
        { label: 'Vendor GSTIN', value: vendorGstin },
        { label: 'Recipient Address', value: platInv.recipientAddress || order.gstSnapshot?.vendorAddress || '—' },
        { label: 'Place of supply', value: `State code ${platInv.placeOfSupplyStateCode || '—'}` },
      ] },
    ]}
    lines={lines.map(line => ({ ...line, description: line.description === 'Spinzyt promotion share' ? 'Spinzyt Promo Share' : line.description }))}
    summary={[
      { label: 'Taxable value', value: invoiceMoney(lines.reduce((sum, line) => sum + Number(line.taxableValue || 0), 0)) },
      { label: 'Total GST', value: invoiceMoney(Number(platformFeeTax) + Number(logisticsFeeTax)) },
      ...['cgst', 'sgst', 'igst'].map(tax => ({ label: tax.toUpperCase(), value: invoiceMoney(platInv[`${tax}Amount`]), show: Number(platInv[`${tax}Amount`]) > 0 })),
    ]}
    totalLabel="Total platform charges" total={totalInvoiceAmount}
    note={`Net payment to vendor = Invoice 1 total − Invoice 2 total − customer wallet promotion credit. Platform charges of ${invoiceMoney(totalInvoiceAmount)} are withheld from the customer collection; customer wallet promotion credit is reserved separately.`}
  />;
};

export default PlatformRevenueInvoicePrint;
