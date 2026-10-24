import { normalizeInvoiceSettings, drawInvoiceBusinessName, drawInvoiceContactDetails, drawInvoiceFooter } from '../../../lib/invoiceSettings';
import FilterSearchParams from '../../../lib/FilterSearchParams';
import MultiSelectFilter from '../components/common/MultiSelectFilter';
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShoppingBag, Search, Download, Filter, FileText, PlusCircle, ExternalLink, User, Store, Calendar, ArrowRight, Eye, Edit3, Trash2, ChevronDown } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import StatusBadge from '../components/common/StatusBadge';
import { orderApi, adminApi, supplierServiceZoneApi } from '../../../lib/api';

const generateStatusHistory = (row) => {
  // If the order already has a tracked history of multiple states, use it
  if (row.statusHistory && row.statusHistory.length > 1) {
    return row.statusHistory;
  }

  const currentStatus = (row.status || '').toUpperCase();
  const orderType = row.orderType;
  const createdAt = new Date(row.createdAt || Date.now());
  const updatedAt = new Date(row.updatedAt || createdAt);
  
  if (currentStatus === 'ORDER_PLACED' && (!row.statusHistory || row.statusHistory.length <= 1)) {
    return [{ status: 'ORDER_PLACED', timestamp: createdAt }];
  }

  if (currentStatus === 'CANCELLED') {
    return [
      { status: 'ORDER_PLACED', timestamp: createdAt },
      { status: 'CANCELLED', timestamp: updatedAt }
    ];
  }

  let chain = [];
  if (orderType === 'Walk-In') {
    chain = ['PROCESSING', 'READY_FOR_DISPATCH', 'DELIVERED'];
  } else {
    chain = [
      'ORDER_PLACED', 
      'PICKUP_ASSIGNED', 
      'RIDER_ARRIVING', 
      'IN_TRANSIT', 
      'RECEIVED_BY_VENDOR', 
      'PROCESSING', 
      'READY_FOR_DISPATCH', 
      'OUT_FOR_DELIVERY', 
      'DELIVERED'
    ];
  }

  let index = chain.indexOf(currentStatus);
  if (index === -1) {
    return [{ status: row.status, timestamp: updatedAt }];
  }

  const subChain = chain.slice(0, index + 1);
  if (subChain.length === 1) {
    return [{ status: subChain[0], timestamp: createdAt }];
  }

  const startMs = createdAt.getTime();
  const endMs = updatedAt.getTime();
  const diffMs = endMs - startMs;
  
  return subChain.map((status, i) => {
    let timestamp;
    if (diffMs > 5000) {
      const stepMs = startMs + (diffMs * (i / (subChain.length - 1)));
      timestamp = new Date(stepMs);
    } else {
      const stepMs = startMs + (i * 60 * 60 * 1000);
      timestamp = new Date(stepMs);
    }
    return { status, timestamp };
  });
};

const generateStatusDurations = (history) => {
  const durations = [];
  for (let i = 0; i < history.length; i++) {
    const start = new Date(history[i].timestamp);
    let end;
    if (i < history.length - 1) {
      end = new Date(history[i + 1].timestamp);
    } else {
      const statusUpper = (history[i].status || '').toUpperCase();
      if (statusUpper === 'DELIVERED' || statusUpper === 'CANCELLED') {
        end = start;
      } else {
        end = new Date();
      }
    }
    const diffMs = end.getTime() - start.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    let durationStr = '0m';
    if (diffMs > 0) {
      if (diffHours >= 24) {
        durationStr = `${(diffHours / 24).toFixed(1)}d`;
      } else if (diffHours >= 1) {
        durationStr = `${diffHours.toFixed(1)}h`;
      } else {
        const diffMins = diffMs / (1000 * 60);
        durationStr = `${Math.round(diffMins)}m`;
      }
    }
    
    durations.push({
      status: history[i].status,
      duration: durationStr
    });
  }
  return durations;
};

const calculateTotalTurnaroundTime = (row) => {
  const history = generateStatusHistory(row);
  const completedEntry = history.find(h => (h.status || '').toUpperCase() === 'DELIVERED');
  if (!completedEntry || !completedEntry.timestamp) {
    return null;
  }
  const start = new Date(row.createdAt);
  const end = new Date(completedEntry.timestamp);
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return '0.0 hrs';
  const diffHours = diffMs / (1000 * 60 * 60);
  return `${diffHours.toFixed(1)} hrs`;
};



export default function Orders() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const activeTab = useMemo(() => {
    const queryParams = new FilterSearchParams(location.search);
    return queryParams.get('tab') || 'Active';
  }, [location.search]);

  const [invoiceSettings, setInvoiceSettings] = useState(() => normalizeInvoiceSettings());
  useEffect(() => {
    let cancelled = false;
    adminApi.getConfig().then(configs => {
      const config = configs.find(item => item.key === 'invoice_settings');
      if (!cancelled) setInvoiceSettings(normalizeInvoiceSettings(config?.value));
    }).catch(error => console.error('Failed to load invoice details:', error));
    return () => { cancelled = true; };
  }, []);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  
  // Pagination State
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [backendCustomerNames, setBackendCustomerNames] = useState([]);
  const [backendServiceZones, setBackendServiceZones] = useState([]);
  
  // Modal states for Service Items JSON
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedOrderItems, setSelectedOrderItems] = useState([]);
  const [selectedOrderIdForItems, setSelectedOrderIdForItems] = useState('');

  const getCustomerInvoiceCalculations = (order) => {
    const isCustomerRD = !!(order.customer?.gstNumber && order.customer?.gstNumber.trim());
    const isVendorRD = !!(order.vendor?.gstNumber && order.vendor?.gstNumber.trim());
    
    const serviceCost = order.grossServiceCost || (order.items || []).reduce((acc, item) => acc + (item.quantity || 0) * (item.price || 0), 0);
    
    let gstRate = 0.18;
    let gstAmount = 0;
    let totalInvoiceAmt = serviceCost;
    let gstinOnInvoice = '';
    
    if (isCustomerRD && isVendorRD) {
      gstAmount = Math.round(serviceCost * gstRate);
      totalInvoiceAmt = serviceCost + gstAmount;
      gstinOnInvoice = `Customer GSTIN: ${order.customer.gstNumber}`;
    } else if (!isCustomerRD && isVendorRD) {
      gstAmount = Math.round(serviceCost * gstRate);
      totalInvoiceAmt = serviceCost + gstAmount;
      gstinOnInvoice = `Vendor GSTIN: ${order.vendor.gstNumber}`;
    } else if (!isCustomerRD && !isVendorRD) {
      gstAmount = Math.round(serviceCost * gstRate);
      totalInvoiceAmt = serviceCost + gstAmount;
      gstinOnInvoice = `${invoiceSettings.businessName} GSTIN: ${invoiceSettings.gstNumber || 'Not provided'} (ECO)`;
    } else if (isCustomerRD && !isVendorRD) {
      gstAmount = 0;
      totalInvoiceAmt = serviceCost;
      gstinOnInvoice = `ECO TO CUSTOMER (Reverse Charge)`;
    }
    
    return {
      isCustomerRD,
      isVendorRD,
      serviceCost,
      gstAmount,
      totalInvoiceAmt,
      gstinOnInvoice
    };
  };

  const getVendorInvoiceCalculations = (order, customerCalc) => {
    const platformFee = order.priceBreakdown?.platformFee || 25;
    const platformFeeGst = Math.round(platformFee * 0.18 * 100) / 100;
    
    const logisticsFee = order.orderType === 'Walk-In' 
      ? (order.deliveryCharge || 0) 
      : (order.priceBreakdown?.logisticsFee !== undefined ? order.priceBreakdown.logisticsFee : (order.deliveryCharge || 50));
    
    const logisticsFeeGst = Math.round(logisticsFee * 0.18 * 100) / 100;
    
    const totalInvoiceAmt = platformFee + platformFeeGst + logisticsFee + logisticsFeeGst;
    const netPaymentToVendor = customerCalc.totalInvoiceAmt - totalInvoiceAmt;
    
    return {
      platformFee,
      platformFeeGst,
      logisticsFee,
      logisticsFeeGst,
      totalInvoiceAmt,
      netPaymentToVendor
    };
  };

  const handleDownloadCustomerInvoice = (order) => {
    try {
      const calc = getCustomerInvoiceCalculations(order);
      const doc = new jsPDF();
      
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      drawInvoiceBusinessName(doc, invoiceSettings.businessName);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(invoiceSettings.website, 15, 26, { maxWidth: 105 });
      drawInvoiceContactDetails(doc, invoiceSettings);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(invoiceSettings.invoiceTitle, 200 - 15, 20, { align: 'right', maxWidth: 75 });
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Invoice No: INV-CUST-${order.orderId || (order._id ? order._id.slice(-6).toUpperCase() : 'TEMP')}`, 200 - 15, 26, { align: 'right' });
      doc.text(`Date: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}`, 200 - 15, 31, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Seller (Vendor Details):', 15, 55);
      doc.text('Buyer (Customer Details):', 110, 55);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(70, 70, 70);
      
      doc.text(`Shop Name: ${order.vendor?.shopDetails?.name || 'Spinzyt Partner'}`, 15, 62);
      doc.text(`Phone: ${order.vendor?.phone || 'N/A'}`, 15, 67);
      doc.text(`GSTIN: ${order.vendor?.gstNumber || 'URD (Unregistered)'}`, 15, 72);
      
      doc.text(`Name: ${order.customer?.displayName || 'Valued Customer'}`, 110, 62);
      doc.text(`Phone: ${order.customer?.phone || 'N/A'}`, 110, 67);
      doc.text(`GSTIN: ${order.customer?.gstNumber || 'URD (Individual)'}`, 110, 72);

      doc.setDrawColor(220, 220, 220);
      doc.line(15, 80, 195, 80);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`Order ID: ${order.orderId || 'N/A'}`, 15, 90);
      doc.text(`Service Zone: ${order.serviceZone || 'N/A'}`, 110, 90);

      const tableHeaders = [['S.No', 'Service Item', 'Qty', 'Rate (Rs.)', 'Total (Rs.)']];
      const tableRows = (order.items || []).map((item, idx) => [
        idx + 1,
        item.name || 'Service Item',
        item.quantity || 0,
        (item.price || 0).toFixed(2),
        ((item.quantity || 0) * (item.price || 0)).toFixed(2)
      ]);

      autoTable(doc, {
        head: tableHeaders,
        body: tableRows,
        startY: 98,
        styles: { fontSize: 9, font: 'helvetica' },
        headStyles: { fillColor: [15, 23, 42], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });

      const finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : doc.previousAutoTable ? doc.previousAutoTable.finalY : 150) + 10;

      doc.setFont('helvetica', 'normal');
      doc.text('Service Cost (Gross):', 130, finalY);
      doc.text(`${calc.serviceCost.toFixed(2)}`, 195, finalY, { align: 'right' });

      doc.text('GST (18%):', 130, finalY + 6);
      doc.text(`${calc.gstAmount.toFixed(2)}`, 195, finalY + 6, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.text('Total Customer Payable:', 130, finalY + 13);
      doc.text(`${calc.totalInvoiceAmt.toFixed(2)}`, 195, finalY + 13, { align: 'right' });

      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text(`GSTIN Reference: ${calc.gstinOnInvoice}`, 15, finalY + 25);
      doc.text('Note: This is an electronically generated invoice raised by the Vendor to the Customer on Spinzyt.', 15, finalY + 30);

      drawInvoiceFooter(doc, invoiceSettings, finalY + 38);

      doc.save(`Invoice_Customer_${order.orderId || (order._id ? order._id.slice(-6).toUpperCase() : 'TEMP')}.pdf`);
    } catch (err) {
      console.error('Error generating Customer Invoice:', err);
      alert('Error generating Customer Invoice: ' + err.message);
    }
  };

  const handleDownloadVendorInvoice = (order) => {
    try {
      const customerCalc = getCustomerInvoiceCalculations(order);
      const calc = getVendorInvoiceCalculations(order, customerCalc);
      const doc = new jsPDF();
      
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      drawInvoiceBusinessName(doc, invoiceSettings.businessName);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(invoiceSettings.website, 15, 26, { maxWidth: 105 });
      drawInvoiceContactDetails(doc, invoiceSettings);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('REVENUE & COMMISSIONS INVOICE', 200 - 15, 20, { align: 'right' });
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Invoice No: INV-VEND-${order.orderId || (order._id ? order._id.slice(-6).toUpperCase() : 'TEMP')}`, 200 - 15, 26, { align: 'right' });
      doc.text(`Date: ${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}`, 200 - 15, 31, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Billed By (Spinzyt Platform):', 15, 55);
      doc.text('Billed To (Vendor Partner):', 110, 55);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(70, 70, 70);
      
      doc.text(invoiceSettings.businessName, 15, 62, { maxWidth: 85 });
      doc.text(`Email: ${invoiceSettings.contactEmail}`, 15, 67, { maxWidth: 85 });
      doc.text(`GSTIN: ${invoiceSettings.gstNumber || 'Not provided'}`, 15, 72);
      
      doc.text(`Shop Name: ${order.vendor?.shopDetails?.name || 'Spinzyt Partner'}`, 110, 62);
      doc.text(`Phone: ${order.vendor?.phone || 'N/A'}`, 110, 67);
      doc.text(`GSTIN: ${order.vendor?.gstNumber || 'URD (Unregistered)'}`, 110, 72);

      doc.setDrawColor(220, 220, 220);
      doc.line(15, 80, 195, 80);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`Linked Order ID: ${order.orderId || 'N/A'}`, 15, 90);
      doc.text(`Service Zone: ${order.serviceZone || 'N/A'}`, 110, 90);

      const tableHeaders = [['Description', 'Net Amount (Rs.)', 'GST 18% (Rs.)', 'Gross Amount (Rs.)']];
      const tableRows = [
        [
          'Platform Fee (Spinzyt Commission)', 
          calc.platformFee.toFixed(2), 
          calc.platformFeeGst.toFixed(2), 
          (calc.platformFee + calc.platformFeeGst).toFixed(2)
        ],
        [
          'Logistics Fee (Delivery Charge)', 
          calc.logisticsFee.toFixed(2), 
          calc.logisticsFeeGst.toFixed(2), 
          (calc.logisticsFee + calc.logisticsFeeGst).toFixed(2)
        ]
      ];

      autoTable(doc, {
        head: tableHeaders,
        body: tableRows,
        startY: 98,
        styles: { fontSize: 9, font: 'helvetica' },
        headStyles: { fillColor: [15, 23, 42], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });

      const finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : doc.previousAutoTable ? doc.previousAutoTable.finalY : 150) + 10;

      doc.setFont('helvetica', 'normal');
      doc.text('Customer Invoice Total:', 120, finalY);
      doc.text(`${customerCalc.totalInvoiceAmt.toFixed(2)}`, 195, finalY, { align: 'right' });

      doc.text('Total Deductions (Inc. GST):', 120, finalY + 6);
      doc.text(`${calc.totalInvoiceAmt.toFixed(2)}`, 195, finalY + 6, { align: 'right' });

      doc.setFont('helvetica', 'bold');
      doc.text('Net Payout to Vendor:', 120, finalY + 13);
      doc.text(`${calc.netPaymentToVendor.toFixed(2)}`, 195, finalY + 13, { align: 'right' });

      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);
      doc.text(`GSTIN Reference: ${invoiceSettings.gstNumber || 'Not provided'}`, 15, finalY + 25);
      doc.text('Note: This invoice records the platform and logistics commissions charged by Spinzyt to the Vendor.', 15, finalY + 30);

      drawInvoiceFooter(doc, invoiceSettings, finalY + 38);

      doc.save(`Invoice_Vendor_${order.orderId || (order._id ? order._id.slice(-6).toUpperCase() : 'TEMP')}.pdf`);
    } catch (err) {
      console.error('Error generating Vendor Invoice:', err);
      alert('Error generating Vendor Invoice: ' + err.message);
    }
  };

  const tabs = useMemo(() => ['Active', 'Completed'], []);

  const latestFilterRequest = React.useRef(0);
  const fetchAllOrders = async (currentPage = page, filters = {
    selectedZone,
    selectedCustomer,
    selectedStatus,
    startDate,
    endDate,
    activeTab
  }) => {
    const requestId = ++latestFilterRequest.current;
    try {
      setLoading(true);
      const res = await orderApi.getAllOrders(currentPage, itemsPerPage, {
        zone: filters.selectedZone,
        customer: filters.selectedCustomer,
        status: filters.selectedStatus,
        startDate: filters.startDate,
        endDate: filters.endDate,
        activeTab: filters.activeTab
      });
      if (requestId !== latestFilterRequest.current) return;
      
      if (res && res.data) {
        setAllOrders(res.data);
        setTotalOrders(res.pagination.total);
        setTotalPages(res.pagination.totalPages);
        setBackendCustomerNames(res.filterOptions.customerNames);
        setBackendServiceZones(res.filterOptions.serviceZones);
      } else {
        setAllOrders(res || []);
        setTotalOrders(res ? res.length : 0);
        setTotalPages(1);
      }
    } catch (err) {
      if (requestId !== latestFilterRequest.current) return;
      console.error('Fetch all orders error:', err);
    } finally {
      if (requestId === latestFilterRequest.current) setLoading(false);
    }
  };

  const handleDeleteOrder = async (id) => {
    if (!window.confirm('Are you sure you want to delete this order?')) return;
    try {
      await orderApi.deleteOrder(id);
      setAllOrders(prev => prev.filter(order => order._id !== id));
      alert('Order deleted successfully');
    } catch (err) {
      console.error('Delete order error:', err);
      alert('Error deleting order');
    }
  };

  const handleUpdateStatus = async (id, currentStatus) => {
      const nextStatuses = ['ORDER_PLACED', 'PICKUP_ASSIGNED', 'RIDER_ARRIVING', 'IN_TRANSIT', 'RECEIVED_BY_VENDOR', 'PROCESSING', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
      const newStatus = window.prompt(`Update status for order ${id}. Choices: ${nextStatuses.join(', ')}`, currentStatus);
      
      if (newStatus && nextStatuses.includes(newStatus)) {
          try {
              await orderApi.updateOrderStatus(id, newStatus);
              setAllOrders(prev => prev.map(order => 
                  order._id === id ? { ...order, status: newStatus } : order
              ));
              alert('Status updated');
          } catch (err) {
              console.error('Update status error:', err);
              alert('Error updating status');
          }
      }
  };

  const handleExportPDF = async () => {
    console.log('Exporting PDF for:', activeTab);
    try {
      setLoading(true);
      // Fetch all matching orders (without pagination limit) for export
      const allMatching = await orderApi.getAllOrders(undefined, undefined, {
        zone: selectedZone,
        customer: selectedCustomer,
        status: selectedStatus,
        startDate,
        endDate,
        activeTab
      });

      const doc = new jsPDF();
      
      // Add Branding / Header
      doc.setFontSize(20);
      doc.text('EZOFLIFE - ORDER REPORT', 14, 22);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
      doc.text(`Category: ${activeTab} Orders`, 14, 35);
      
      // Flatten fetched orders for export
      const listForExport = [];
      const ordersToFlatten = Array.isArray(allMatching) ? allMatching : (allMatching?.data || []);
      ordersToFlatten.forEach(order => {
        if (!order.items || order.items.length === 0) {
          listForExport.push({
            ...order,
            uniqueRowId: `${order._id}_none`,
            singleItem: null,
            grossServiceCost: 0
          });
        } else {
          order.items.forEach((item, index) => {
            listForExport.push({
              ...order,
              uniqueRowId: `${order._id}_${item._id || index}`,
              singleItem: item,
              grossServiceCost: (item.quantity || 0) * (item.price || 0)
            });
          });
        }
      });

      // Prepare Table Data
      const tableColumn = ["Service Zone", "Order ID", "Customer Name", "Order Submitted Timestamp", "Service Items JSON", "Current Order Status", "Rider ID", "Rider Name", "Rider Contact Number", "Status Timestamp History", "Status Duration Hours", "Order Completed Timestamp", "Total Turnaround Time (Hrs)", "Cashback Received", "Wallet Used", "Gross Service Cost", "Logistics Fee", "Platform GST Amount", "Vendor GST Amount", "Total Customer Payable", "Vendor Payout Share", "Admin Revenue Share", "Total Payable to GST", "Vendor", "Date"];
      const tableRows = listForExport.map(row => [
        row.serviceZone || 'N/A',
        row.orderId || row._id.slice(-6).toUpperCase(),
        row.customer?.displayName || 'Unknown',
        row.createdAt ? new Date(row.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A',
        row.singleItem ? `${row.singleItem.name} (Qty: ${row.singleItem.quantity}, Rate: Rs. ${row.singleItem.price})` : '-',
        row.status,
        "-",
        "-",
        "-",
        JSON.stringify(generateStatusHistory(row).map(h => ({
          status: h.status,
          time: h.timestamp ? new Date(h.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'
        }))),
        JSON.stringify(generateStatusDurations(generateStatusHistory(row))),
        (() => {
          const completedEntry = generateStatusHistory(row).find(h => (h.status || '').toUpperCase() === 'DELIVERED');
          return completedEntry?.timestamp ? new Date(completedEntry.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '-';
        })(),
        calculateTotalTurnaroundTime(row) || '-',
        `Rs. ${row.ledger?.customerWalletCredit || 0}`,
        `Rs. ${row.walletAmountDeducted || 0}`,
        `Rs. ${row.grossServiceCost || 0}`,
        `Rs. ${row.orderType === 'Walk-In' ? (row.deliveryCharge || 0) : (row.priceBreakdown?.logisticsFee !== undefined ? row.priceBreakdown.logisticsFee : (row.deliveryCharge || 0))}`,
        `Rs. ${Math.round((row.priceBreakdown?.platformFee || 0) * ((row.tier === 'Heritage' ? 18 : 5) / 100))}`,
        `Rs. ${Math.round(((row.priceBreakdown?.baseWithArea || 0) + (row.priceBreakdown?.expressSurcharge || 0)) * ((row.tier === 'Heritage' ? 18 : 5) / 100))}`,
        `Rs. ${row.totalAmount}`,
        `Rs. ${Math.round((row.grossServiceCost || 0) * (1 + (row.tier === 'Heritage' ? 18 : 5) / 100))}`,
        `Rs. ${Math.round((row.priceBreakdown?.platformFee || 0) * (1 + (row.tier === 'Heritage' ? 18 : 5) / 100))}`,
        (() => {
          const gstPercent = row.tier === 'Heritage' ? 18 : 5;
          const platformGst = (row.priceBreakdown?.platformFee || 0) * (gstPercent / 100);
          const vendorGst = ((row.priceBreakdown?.baseWithArea || 0) + (row.priceBreakdown?.expressSurcharge || 0)) * (gstPercent / 100);
          return `Rs. ${Math.round(platformGst + vendorGst)}`;
        })(),
        row.vendor?.shopDetails?.name || 'N/A',
        new Date(row.createdAt).toLocaleDateString()
      ]);
      
      // Generate Table
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 45,
        styles: { fontSize: 8, font: 'helvetica' },
        headStyles: { fillColor: [15, 23, 42], textColor: 255 }, // Slate-900
        alternateRowStyles: { fillColor: [248, 250, 252] } // Slate-50
      });
      
      doc.save(`EzofLife_Orders_${activeTab}_${new Date().getTime()}.pdf`);
      console.log('PDF Download Started');
    } catch (err) {
      console.error('Export PDF error:', err);
      alert('Error exporting PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleExportFile = async (format) => {
    console.log(`Exporting ${format} for:`, activeTab);
    try {
      setLoading(true);
      // Fetch all matching orders (without pagination limit) for export
      const allMatching = await orderApi.getAllOrders(undefined, undefined, {
        zone: selectedZone,
        customer: selectedCustomer,
        status: selectedStatus,
        startDate,
        endDate,
        activeTab
      });

      const listForExport = [];
      const ordersToFlatten = Array.isArray(allMatching) ? allMatching : (allMatching?.data || []);
      ordersToFlatten.forEach(order => {
        if (!order.items || order.items.length === 0) {
          listForExport.push({
            ...order,
            uniqueRowId: `${order._id}_none`,
            singleItem: null,
            grossServiceCost: 0
          });
        } else {
          order.items.forEach((item, index) => {
            listForExport.push({
              ...order,
              uniqueRowId: `${order._id}_${item._id || index}`,
              singleItem: item,
              grossServiceCost: (item.quantity || 0) * (item.price || 0)
            });
          });
        }
      });

      const headers = [
        "Service Zone", "Order ID", "Customer Name", "Order Submitted Timestamp", 
        "Service Items JSON", "Current Order Status", "Rider ID", "Rider Name", 
        "Rider Contact Number", "Status Timestamp History", "Status Duration Hours", 
        "Order Completed Timestamp", "Total Turnaround Time (Hrs)", "Cashback Received", "Wallet Used", "Gross Service Cost", 
        "Logistics Fee", "Platform GST Amount", "Vendor GST Amount", "Total Customer Payable", 
        "Vendor Payout Share", "Admin Revenue Share", "Total Payable to GST", "Vendor", "Date"
      ];
      
      const rows = listForExport.map(row => [
        row.serviceZone || 'N/A',
        row.orderId || row._id.slice(-6).toUpperCase(),
        row.customer?.displayName || 'Unknown',
        row.createdAt ? new Date(row.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A',
        row.singleItem ? `${row.singleItem.name} (Qty: ${row.singleItem.quantity}, Rate: Rs. ${row.singleItem.price})` : '-',
        row.status,
        "-",
        "-",
        "-",
        JSON.stringify(generateStatusHistory(row).map(h => ({
          status: h.status,
          time: h.timestamp ? new Date(h.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'
        }))),
        JSON.stringify(generateStatusDurations(generateStatusHistory(row))),
        (() => {
          const completedEntry = generateStatusHistory(row).find(h => (h.status || '').toUpperCase() === 'DELIVERED');
          return completedEntry?.timestamp ? new Date(completedEntry.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '-';
        })(),
        calculateTotalTurnaroundTime(row) || '-',
        row.ledger?.customerWalletCredit || 0,
        row.walletAmountDeducted || 0,
        row.grossServiceCost || 0,
        row.orderType === 'Walk-In' ? (row.deliveryCharge || 0) : (row.priceBreakdown?.logisticsFee !== undefined ? row.priceBreakdown.logisticsFee : (row.deliveryCharge || 0)),
        Math.round((row.priceBreakdown?.platformFee || 0) * ((row.tier === 'Heritage' ? 18 : 5) / 100)),
        Math.round(((row.priceBreakdown?.baseWithArea || 0) + (row.priceBreakdown?.expressSurcharge || 0)) * ((row.tier === 'Heritage' ? 18 : 5) / 100)),
        row.totalAmount,
        Math.round((row.grossServiceCost || 0) * (1 + (row.tier === 'Heritage' ? 18 : 5) / 100)),
        Math.round((row.priceBreakdown?.platformFee || 0) * (1 + (row.tier === 'Heritage' ? 18 : 5) / 100)),
        (() => {
          const gstPercent = row.tier === 'Heritage' ? 18 : 5;
          const platformGst = (row.priceBreakdown?.platformFee || 0) * (gstPercent / 100);
          const vendorGst = ((row.priceBreakdown?.baseWithArea || 0) + (row.priceBreakdown?.expressSurcharge || 0)) * (gstPercent / 100);
          return Math.round(platformGst + vendorGst);
        })(),
        row.vendor?.shopDetails?.name || 'N/A',
        new Date(row.createdAt).toLocaleDateString()
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // Auto-fit column widths to prevent text clipping in Excel
      ws['!cols'] = headers.map((header, colIndex) => {
        let maxLen = header.length;
        rows.forEach(row => {
          const val = row[colIndex];
          if (val !== undefined && val !== null) {
            const strVal = String(val);
            if (strVal.length > maxLen) {
              maxLen = strVal.length;
            }
          }
        });
        // Set column width with a minimum of 12 and maximum of 50 characters (caps JSON/history fields)
        return { wch: Math.min(Math.max(maxLen + 3, 12), 50) };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Orders Detail');

      if (format === 'excel') {
        XLSX.writeFile(wb, `EzofLife_Orders_Detail_${activeTab}_${new Date().getTime()}.xlsx`);
      } else if (format === 'csv') {
        XLSX.writeFile(wb, `EzofLife_Orders_Detail_${activeTab}_${new Date().getTime()}.csv`, { bookType: 'csv' });
      }
      console.log(`${format.toUpperCase()} Download Finished`);
    } catch (err) {
      console.error(`Export ${format} error:`, err);
      alert(`Error exporting to ${format}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAllOrders = async () => {
    if (!window.confirm('⚠️ WARNING: This will permanently delete ALL orders from the system. This action cannot be undone. Are you sure?')) return;
    
    try {
        setLoading(true);
        const result = await adminApi.clearAllOrders();
        if (result.message) {
            setAllOrders([]);
            alert(result.message);
        } else {
            throw new Error('Invalid response from server');
        }
    } catch (err) {
        console.error('Clear all orders error:', err);
        alert(`Failed to clear orders: ${err.message}`);
    } finally {
        setLoading(false);
    }
  };

  const fetchZones = async () => {
    try {
      const data = await supplierServiceZoneApi.getAll();
      let rawZones = [];
      if (Array.isArray(data)) {
        rawZones = data;
      } else if (data && Array.isArray(data.data)) {
        rawZones = data.data;
      }
      
      const uniqueNames = new Set();
      const uniqueZones = [];
      rawZones.forEach(z => {
        const name = (z.zoneName || '').trim();
        if (name && !uniqueNames.has(name.toLowerCase())) {
          uniqueNames.add(name.toLowerCase());
          uniqueZones.push(z);
        }
      });
      setZones(uniqueZones);
    } catch (err) {
      console.error('Error fetching zones:', err);
    }
  };

  useEffect(() => {
    fetchAllOrders(page);
  }, [page, selectedZone, selectedCustomer, selectedStatus, startDate, endDate, activeTab]);

  useEffect(() => {
    fetchZones();
  }, []);

  const uniqueZonesList = useMemo(() => {
    return backendServiceZones.map((name, idx) => ({ _id: idx, zoneName: name }));
  }, [backendServiceZones]);

  const uniqueCustomersList = useMemo(() => {
    return backendCustomerNames;
  }, [backendCustomerNames]);

  const statusesList = useMemo(() => [
    'ORDER_PLACED', 
    'PICKUP_ASSIGNED', 
    'RIDER_ARRIVING', 
    'IN_TRANSIT', 
    'RECEIVED_BY_VENDOR', 
    'PROCESSING', 
    'READY_FOR_DISPATCH', 
    'OUT_FOR_DELIVERY', 
    'DELIVERED', 
    'CANCELLED'
  ], []);

  const filteredOrders = allOrders;

  const flattenedOrders = useMemo(() => {
    const list = [];
    filteredOrders.forEach(order => {
      if (!order.items || order.items.length === 0) {
        list.push({
          ...order,
          uniqueRowId: `${order._id}_none`,
          singleItem: null,
          grossServiceCost: 0
        });
      } else {
        order.items.forEach((item, index) => {
          list.push({
            ...order,
            uniqueRowId: `${order._id}_${item._id || index}`,
            singleItem: item,
            grossServiceCost: (item.quantity || 0) * (item.price || 0)
          });
        });
      }
    });
    return list;
  }, [filteredOrders]);

  const orderColumns = useMemo(() => [
    { 
      header: 'Service Zone', 
      key: 'serviceZone',
      render: (val) => (
        <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
          {val || 'N/A'}
        </span>
      )
    },
    { 
      header: 'Order ID', 
      key: 'orderId',
      render: (val, row) => (
        <button type="button" onClick={() => navigate(`/admin/orders/${encodeURIComponent(row._id)}`)} className="font-bold text-slate-900 text-[11px] tracking-[0.1em] uppercase hover:text-blue-600 hover:underline transition-colors" aria-label={`View order ${val}`}>{val}</button>
      )
    },
    { 
      header: 'Customer Name', 
      key: 'customer',
      render: (val) => (
        <span className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">{val?.displayName || 'Unknown'}</span>
      )
    },
    { 
      header: 'Vendor ID', 
      key: 'vendor',
      render: (val) => (
        <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
          {val?._id || 'N/A'}
        </span>
      )
    },
    { 
      header: 'Vendor Name', 
      key: 'vendor',
      render: (val) => (
        <span className="font-bold text-slate-800 text-[10px] uppercase tracking-tight">
          {val?.shopDetails?.name || val?.displayName || 'N/A'}
        </span>
      )
    },
    { 
      header: 'Order Submitted Timestamp', 
      key: 'createdAt', 
      render: (val) => (
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider tabular-nums">
          {val ? new Date(val).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'}
        </span>
      )
    },
    { 
      header: 'Service Items JSON', 
      key: 'singleItem',
      wrap: true, 
      render: (val, row) => {
        if (!val) return <span className="text-slate-400 font-bold">-</span>;
        return (
          <div className="flex items-start gap-2 max-w-[300px]">
            <span className="font-bold text-[10px] text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded block whitespace-normal break-words">
              {val.name} (Qty: {val.quantity}, Rate: ₹{val.price})
            </span>
            {row.items && row.items.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedOrderItems(row.items);
                  setSelectedOrderIdForItems(row.orderId || row._id.slice(-6).toUpperCase());
                  setItemsModalOpen(true);
                }}
                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 hover:border-blue-300 rounded text-[9px] font-bold uppercase tracking-wider transition-all shrink-0 mt-0.5"
              >
                All
              </button>
            )}
          </div>
        );
      }
    },
    { 
      header: 'Current Order Status', 
      key: 'status', 
      render: (val) => <StatusBadge status={val} /> 
    },
    { 
      header: 'Rider ID', 
      key: 'riderIdPlaceholder', 
      render: () => <span className="text-slate-400 font-bold">-</span> 
    },
    { 
      header: 'Rider Name', 
      key: 'riderNamePlaceholder', 
      render: () => <span className="text-slate-400 font-bold">-</span> 
    },
    { 
      header: 'Rider Contact Number', 
      key: 'riderContactPlaceholder', 
      render: () => <span className="text-slate-400 font-bold">-</span> 
    },
    {
      header: 'Status Timestamp History',
      key: 'statusHistory',
      wrap: true,
      render: (val, row) => {
        const displayHistory = generateStatusHistory(row).map(h => ({
          status: h.status,
          time: h.timestamp ? new Date(h.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'N/A'
        }));
        const jsonStr = JSON.stringify(displayHistory);
        return (
          <div className="max-w-[300px]">
            <span className="font-mono text-[9px] text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded block whitespace-normal break-all">
              {jsonStr}
            </span>
          </div>
        );
      }
    },
    {
      header: 'Status Duration Hours',
      key: 'statusDurations',
      wrap: true,
      render: (val, row) => {
        const history = generateStatusHistory(row);
        const durations = generateStatusDurations(history);
        const jsonStr = JSON.stringify(durations);
        return (
          <div className="max-w-[300px]">
            <span className="font-mono text-[9px] text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded block whitespace-normal break-all">
              {jsonStr}
            </span>
          </div>
        );
      }
    },
    {
      header: 'Order Completed Timestamp',
      key: 'orderCompletedTimestamp',
      render: (val, row) => {
        const completedEntry = generateStatusHistory(row).find(h => (h.status || '').toUpperCase() === 'DELIVERED');
        if (!completedEntry || !completedEntry.timestamp) {
          return <span className="text-slate-400 font-bold">-</span>;
        }
        return (
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider tabular-nums">
            {new Date(completedEntry.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
          </span>
        );
      }
    },
    {
      header: 'Total Turnaround Time (Hrs)',
      key: 'totalTurnaroundTime',
      render: (val, row) => {
        const tat = calculateTotalTurnaroundTime(row);
        if (!tat) return <span className="text-slate-400 font-bold">-</span>;
        return (
          <span className="text-[10px] text-slate-700 font-bold tracking-tight tabular-nums bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
            {tat}
          </span>
        );
      }
    },
    {
      header: 'Cashback Received',
      key: 'ledger',
      align: 'right',
      render: (val) => (
        <span className="font-bold text-slate-900 tabular-nums text-xs">
          ₹{(val?.customerWalletCredit || 0).toLocaleString()}
        </span>
      )
    },
    {
      header: 'Wallet Used',
      key: 'walletAmountDeducted',
      align: 'right',
      render: (val) => (
        <span className="font-bold text-slate-900 tabular-nums text-xs">
          ₹{(val || 0).toLocaleString()}
        </span>
      )
    },
    {
      header: 'Gross Service Cost',
      key: 'grossServiceCost',
      align: 'right',
      render: (val) => (
        <span className="font-bold text-slate-900 tabular-nums text-xs">
          ₹{(val || 0).toLocaleString()}
        </span>
      )
    },
    {
      header: 'Logistics Fee',
      key: 'priceBreakdown',
      align: 'right',
      render: (val, row) => {
        const fee = row.orderType === 'Walk-In' ? (row.deliveryCharge || 0) : (val?.logisticsFee !== undefined ? val.logisticsFee : (row.deliveryCharge || 0));
        return (
          <span className="font-bold text-slate-900 tabular-nums text-xs">
            ₹{fee.toLocaleString()}
          </span>
        );
      }
    },
    {
      header: 'Platform GST Amount',
      key: 'priceBreakdown',
      align: 'right',
      render: (val, row) => {
        const gstPercent = row.tier === 'Heritage' ? 18 : 5;
        const gst = (val?.platformFee || 0) * (gstPercent / 100);
        return (
          <span className="font-bold text-slate-900 tabular-nums text-xs">
            ₹{Math.round(gst).toLocaleString()}
          </span>
        );
      }
    },
    {
      header: 'Vendor GST Amount',
      key: 'priceBreakdown',
      align: 'right',
      render: (val, row) => {
        const gstPercent = row.tier === 'Heritage' ? 18 : 5;
        const vendorGst = ((val?.baseWithArea || 0) + (val?.expressSurcharge || 0)) * (gstPercent / 100);
        return (
          <span className="font-bold text-slate-900 tabular-nums text-xs">
            ₹{Math.round(vendorGst).toLocaleString()}
          </span>
        );
      }
    },
    {
      header: 'Total Customer Payable',
      key: 'totalAmount',
      align: 'right',
      render: (val) => (
        <span className="font-bold text-slate-900 tabular-nums text-xs">
          ₹{(val || 0).toLocaleString()}
        </span>
      )
    },
    {
      header: 'Vendor Payout Share',
      key: 'priceBreakdown',
      align: 'right',
      render: (val, row) => {
        const gstPercent = row.tier === 'Heritage' ? 18 : 5;
        const gross = row.grossServiceCost || 0;
        const vendorGst = gross * (gstPercent / 100);
        const payout = gross + vendorGst;
        return (
          <span className="font-bold text-slate-900 tabular-nums text-xs">
            ₹{Math.round(payout).toLocaleString()}
          </span>
        );
      }
    },
    {
      header: 'Admin Revenue Share',
      key: 'priceBreakdown',
      align: 'right',
      render: (val, row) => {
        const gstPercent = row.tier === 'Heritage' ? 18 : 5;
        const fee = val?.platformFee || 0;
        const platformGst = fee * (gstPercent / 100);
        const revenue = fee + platformGst;
        return (
          <span className="font-bold text-slate-900 tabular-nums text-xs">
            ₹{Math.round(revenue).toLocaleString()}
          </span>
        );
      }
    },
    {
      header: 'Total Payable to GST',
      key: 'priceBreakdown',
      align: 'right',
      render: (val, row) => {
        const gstPercent = row.tier === 'Heritage' ? 18 : 5;
        const platformGst = (val?.platformFee || 0) * (gstPercent / 100);
        const vendorGst = ((val?.baseWithArea || 0) + (val?.expressSurcharge || 0)) * (gstPercent / 100);
        const totalGst = platformGst + vendorGst;
        return (
          <span className="font-bold text-slate-900 tabular-nums text-xs">
            ₹{Math.round(totalGst).toLocaleString()}
          </span>
        );
      }
    },
    {
      header: 'Invoices',
      key: 'actions',
      render: (val, row) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleDownloadCustomerInvoice(row)}
            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 hover:border-blue-300 rounded text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
            title="Download Customer Invoice" aria-label="Download customer invoice"
          >
            <Download size={10} /> Cust Inv
          </button>
          <button
            onClick={() => handleDownloadVendorInvoice(row)}
            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 hover:border-emerald-300 rounded text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
            title="Download Vendor Invoice" aria-label="Download vendor invoice"
          >
            <Download size={10} /> Vend Inv
          </button>
        </div>
      )
    }
  ], [handleDownloadCustomerInvoice, handleDownloadVendorInvoice, navigate]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
      <PageHeader 
        title="" 
        actions={[
          {
            customComponent: (
              <div className="relative">
                <button
                  onClick={() => setShowExportDropdown(!showExportDropdown)}
                  className="px-3 py-1.5 rounded-sm font-bold text-[9px] uppercase tracking-[0.2em] transition-all flex items-center gap-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <FileText size={13} />
                  Export Order Detail
                  <ChevronDown size={12} className={`transition-transform duration-200 ${showExportDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showExportDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowExportDropdown(false)} />
                    <div className="absolute right-0 mt-1.5 w-32 bg-white border border-slate-200 rounded-sm shadow-lg z-50 py-1 text-left">
                      <button
                        onClick={() => {
                          setShowExportDropdown(false);
                          handleExportFile('excel');
                        }}
                        className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                      >
                        Excel
                      </button>
                      <button
                        onClick={() => {
                          setShowExportDropdown(false);
                          handleExportFile('csv');
                        }}
                        className="w-full text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                      >
                        CSV
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          }
        ]}
      />

      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">

        {/* Dropdown Filters Row */}
        <div className="flex justify-between items-center gap-4 flex-wrap bg-white p-3 rounded-md border border-slate-200/60 shadow-sm">
          {/* Left Filters (Date Range only) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200/80 rounded-md px-2.5 py-1.5 text-[9px] font-bold text-slate-800 focus:border-slate-400 focus:ring-0 outline-none cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200/80 rounded-md px-2.5 py-1.5 text-[9px] font-bold text-slate-800 focus:border-slate-400 focus:ring-0 outline-none cursor-pointer"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                className="text-[9px] font-bold uppercase tracking-wider text-rose-600 hover:text-rose-700 px-3 py-1.5 transition-all bg-rose-50 hover:bg-rose-100/50 border border-rose-100 rounded-md"
              >
                Clear
              </button>
            )}
          </div>

          {/* Right Filters (Zone, Customer, Status) */}
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Zone Filter */}
            <div className="relative flex items-center">
              <MultiSelectFilter
                value={selectedZone}
                onChange={(e) => {
                  setSelectedZone(e.target.value);
                  setPage(1);
                }}
                className="appearance-none bg-slate-50 border border-slate-200/80 rounded-md pl-4 pr-10 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-400 focus:ring-0 outline-none cursor-pointer transition-all"
              >
                <option value="">Zone</option>
                {uniqueZonesList.map((z, idx) => (
                  <option key={z._id || idx} value={z.zoneName}>
                    {z.zoneName}
                  </option>
                ))}
              </MultiSelectFilter>
              <ChevronDown size={14} className="absolute right-3 pointer-events-none text-slate-500" />
            </div>

            {/* Customer Filter */}
            <div className="relative flex items-center">
              <MultiSelectFilter
                value={selectedCustomer}
                onChange={(e) => {
                  setSelectedCustomer(e.target.value);
                  setPage(1);
                }}
                className="appearance-none bg-slate-50 border border-slate-200/80 rounded-md pl-4 pr-10 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-400 focus:ring-0 outline-none cursor-pointer transition-all"
              >
                <option value="">Customer</option>
                {uniqueCustomersList.map((name, idx) => (
                  <option key={idx} value={name}>
                    {name}
                  </option>
                ))}
              </MultiSelectFilter>
              <ChevronDown size={14} className="absolute right-3 pointer-events-none text-slate-500" />
            </div>

            {/* Status Filter */}
            <div className="relative flex items-center">
              <MultiSelectFilter
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setPage(1);
                }}
                className="appearance-none bg-slate-50 border border-slate-200/80 rounded-md pl-4 pr-10 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-400 focus:ring-0 outline-none cursor-pointer transition-all"
              >
                <option value="">Status</option>
                {statusesList.map((status, idx) => (
                  <option key={idx} value={status}>
                    {status.replace(/_/g, ' ')}
                  </option>
                ))}
              </MultiSelectFilter>
              <ChevronDown size={14} className="absolute right-3 pointer-events-none text-slate-500" />
            </div>
          </div>
        </div>

        {/* Order List */}
        <div className="w-full">
          <DataGrid 
            showHeader={false}
            columns={orderColumns}
            data={flattenedOrders}
            minWidth="3200px"
            maxHeight="calc(100vh - 280px)"
            loading={loading}
            pagination={{
              page,
              totalPages,
              total: totalOrders
            }}
            onPageChange={(newPage) => setPage(newPage)}
          />
        </div>
      </div>

      {/* Items List Modal */}
      {itemsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setItemsModalOpen(false)} />
          <div className="bg-white rounded-lg p-6 shadow-2xl relative z-10 w-full max-w-lg border border-slate-100 flex flex-col gap-4 text-left">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-800">
                Order Items - {selectedOrderIdForItems}
              </h3>
              <button 
                onClick={() => setItemsModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>
            
            <div className="max-h-[60vh] overflow-y-auto bg-slate-50 p-4 border border-slate-200 rounded text-slate-800 flex flex-col gap-2">
              {selectedOrderItems.map((i, idx) => (
                <div key={idx} className="text-[11px] font-bold text-slate-700 border-b border-slate-200/50 pb-1.5 last:border-0 last:pb-0">
                  {idx + 1}. {i.name} (Qty: {i.quantity}, Rate: ₹{i.price})
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button 
                onClick={() => setItemsModalOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
