import { matchesFilter } from '../utils/filters';
import MultiSelectFilter from '../components/common/MultiSelectFilter';
import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ClipboardList, 
  Check, 
  X, 
  RotateCw,
  MessageSquare,
  AlertTriangle,
  FolderOpen,
  Image as ImageIcon,
  FileText,
  ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { vendorMasterSupplyApi } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';

export default function SupplierProductRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(null);
  const [selectedSupplierName, setSelectedSupplierName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPrice, setSelectedPrice] = useState('');
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  // Feedback Modal State
  const [modalData, setModalData] = useState({
    isOpen: false,
    requestId: null,
    type: null, // 'approved' | 'rejected'
    productName: '',
    wholesaleRate: 0,
    message: '',
    fullRequest: null
  });

  // View Details Modal State
  const [detailProduct, setDetailProduct] = useState(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      // Fetch custom products that are pending approval
      const data = await vendorMasterSupplyApi.getAll({ isTemplate: 'n', approvalStatus: 'Pending' });
      if (Array.isArray(data)) {
        setRequests(data);
      } else {
        setRequests([]);
      }
    } catch (err) {
      console.error('Fetch Requests Error:', err);
      toast.error('Failed to fetch supplier product requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAction = async (id, status, message) => {
    setIsProcessing(id);
    try {
      const approvalStatus = status === 'approved' ? 'Approved' : 'Rejected';
      const activeStatus = status === 'approved' ? 'y' : 'n';

      await vendorMasterSupplyApi.update(id, { 
        approvalStatus, 
        isActive: activeStatus,
        adminMessage: message
      });

      toast.success(`Product request ${status === 'approved' ? 'approved' : 'rejected'} successfully!`);
      setModalData({ isOpen: false, requestId: null, type: null, productName: '', wholesaleRate: 0, message: '', fullRequest: null });
      fetchRequests();
    } catch (err) {
      console.error('Action Error:', err);
      toast.error('Action failed. Try again.');
    } finally {
      setIsProcessing(null);
    }
  };

  // Filter requests based on filters
  const filteredData = useMemo(() => {
    return requests.filter(req => {
      const supplierName = req.supplierFacilityName || req.supplierId || 'Unknown Supplier';
      const matchesSupplier = matchesFilter(selectedSupplierName, supplierName);
      const categoryName = req.categoryId?.mainCategory || 'Other';
      const matchesCategory = matchesFilter(selectedCategory, categoryName);
      const matchesPrice = matchesFilter(selectedPrice, String(req.wholesaleRate));
      
      let matchesDate = true;
      if (req.createdAt) {
        const reqDate = new Date(req.createdAt);
        reqDate.setHours(0, 0, 0, 0);

        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          if (reqDate < start) matchesDate = false;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (reqDate > end) matchesDate = false;
        }
      } else if (startDate || endDate) {
        matchesDate = false;
      }

      return matchesSupplier && matchesCategory && matchesPrice && matchesDate;
    });
  }, [requests, selectedSupplierName, selectedCategory, selectedPrice, startDate, endDate]);

  const uniqueSupplierNames = useMemo(() => {
    const names = requests.map(r => r.supplierFacilityName || r.supplierId || 'Unknown Supplier').filter(Boolean);
    return [...new Set(names)].sort();
  }, [requests]);

  const uniqueCategories = useMemo(() => {
    const categoriesList = requests.map(r => r.categoryId?.mainCategory || 'Other').filter(Boolean);
    return [...new Set(categoriesList)].sort();
  }, [requests]);

  const uniquePrices = useMemo(() => {
    const prices = requests.map(r => r.wholesaleRate).filter(v => v !== undefined && v !== null);
    return [...new Set(prices)].sort((a, b) => a - b);
  }, [requests]);

  const paginatedData = useMemo(() => {
    return filteredData.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  }, [filteredData, page]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;

  useEffect(() => {
    setPage(1); // Reset page on filter changes
  }, [selectedSupplierName, selectedCategory, selectedPrice, startDate, endDate]);

  const handleExportFile = (format) => {
    console.log(`Exporting ${format} for supplier product requests`);
    try {
      const headers = [
        "Supplier Name", "Product Name", "Brand", "Category Name", 
        "Sub Category Name", "Wholesale Price", "Bulk Discount (%)", 
        "Min Bulk Quantity", "GST (%)", "HSN Code", "Pack Size", 
        "MOV Free Delivery", "Delivery Frequency", "Description"
      ];
      
      const rows = filteredData.map(row => [
        row.supplierFacilityName || row.supplierId || 'Unknown Supplier',
        row.materialName || '',
        row.brand || 'Generic',
        row.categoryId?.mainCategory || 'Other',
        row.categoryId?.subCategory || 'General',
        row.wholesaleRate || 0,
        row.bulkDiscount || 0,
        row.bulkThreshold || 0,
        row.gst || 18,
        row.hsnCode || '',
        row.quantity || '',
        row.movFreeDelivery || 0,
        row.deliveryFrequency || '',
        row.description || 'No description provided.'
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
        // Set column width with a minimum of 12 and maximum of 50 characters
        return { wch: Math.min(Math.max(maxLen + 3, 12), 50) };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Product Requests');

      if (format === 'excel') {
        XLSX.writeFile(wb, `Supplier_Product_Requests_${new Date().getTime()}.xlsx`);
      } else if (format === 'csv') {
        XLSX.writeFile(wb, `Supplier_Product_Requests_${new Date().getTime()}.csv`, { bookType: 'csv' });
      }
      toast.success(`${format.toUpperCase()} export downloaded successfully`);
    } catch (err) {
      console.error(`Export ${format} error:`, err);
      toast.error(`Error exporting to ${format}`);
    }
  };

  return (
    <div className="flex flex-col min-h-[100dvh] bg-slate-50/50 pb-20 font-sans">
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
                  Export Product Requests
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
        {/* Table Container */}
        <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
          
          {/* Header Bar with Filters */}
          <div className="px-8 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between bg-white gap-4">
            {/* Date Filters on the Left */}
            <div className="flex items-center gap-2">
              <input 
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all"
              />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">to</span>
              <input 
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all"
              />
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                    setPage(1);
                  }}
                  className="px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-500 hover:bg-rose-600 hover:text-white hover:border-rose-600 rounded-sm transition-all text-[9px] font-black uppercase tracking-wider"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 justify-end text-[10px]">
              {/* Supplier Name Filter */}
              <MultiSelectFilter
                value={selectedSupplierName}
                onChange={e => setSelectedSupplierName(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
              >
                <option value="">All Suppliers</option>
                {uniqueSupplierNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </MultiSelectFilter>

              {/* Category Filter */}
              <MultiSelectFilter
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
              >
                <option value="">All Categories</option>
                {uniqueCategories.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </MultiSelectFilter>

              {/* Price Filter */}
              <MultiSelectFilter
                value={selectedPrice}
                onChange={e => setSelectedPrice(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer"
              >
                <option value="">All Rates</option>
                {uniquePrices.map(price => (
                  <option key={price} value={String(price)}>₹{price}</option>
                ))}
              </MultiSelectFilter>

              {/* Reset Button */}
              {(selectedSupplierName || selectedCategory || selectedPrice || startDate || endDate) && (
                <button
                  onClick={() => {
                    setSelectedSupplierName('');
                    setSelectedCategory('');
                    setSelectedPrice('');
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="px-3 py-1.5 border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-900 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all bg-white cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Table Element */}
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[1250px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="w-[12%] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Supplier Name</th>
                  <th className="w-[12%] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Product Name</th>
                  <th className="w-[10%] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Brand</th>
                  <th className="w-[6%] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Image</th>
                  <th className="w-[10%] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Category Name</th>
                  <th className="w-[10%] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Sub Category Name</th>
                  <th className="w-[8%] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Wholesale Price</th>
                  <th className="w-[8%] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Bulk Rate</th>
                  <th className="w-[8%] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Min Quantity</th>
                  <th className="w-[6%] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">GST</th>
                  <th className="w-[10%] px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-20 text-center">
                      <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Product Requests...</p>
                    </td>
                  </tr>
                ) : filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-32 text-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 mx-auto mb-4">
                        <ClipboardList size={32} />
                      </div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Queue Clear</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">No pending supplier product requests found.</p>
                    </td>
                  </tr>
                ) : paginatedData.map((req) => {
                  const supplierName = req.supplierFacilityName || req.supplierId || 'Unknown Supplier';
                  const mainCategory = req.categoryId?.mainCategory || 'Other';
                  const subCategory = req.categoryId?.subCategory || 'General';
                  const hasImage = req.images && req.images.length > 0;
                  const firstImage = hasImage ? req.images[0] : null;

                  return (
                    <tr key={req._id || req.id} className="hover:bg-slate-50/50 transition-colors group">
                      {/* Supplier Name */}
                      <td className="px-6 py-5">
                        <span className="text-sm font-black text-slate-900 tracking-tight whitespace-nowrap">
                          {supplierName}
                        </span>
                      </td>
                      {/* Product Name */}
                      <td className="px-6 py-5">
                        <span 
                          className="text-xs font-black text-slate-700 tracking-tight cursor-pointer hover:text-primary transition-all uppercase"
                          onClick={() => setDetailProduct(req)}
                        >
                          {req.materialName}
                        </span>
                      </td>
                      {/* Brand */}
                      <td className="px-6 py-5">
                        <span className="text-xs font-bold text-slate-600 uppercase">
                          {req.brand || 'Generic'}
                        </span>
                      </td>
                      {/* Product Image */}
                      <td className="px-6 py-5">
                        {hasImage ? (
                          <img 
                            src={firstImage} 
                            alt={req.materialName} 
                            className="w-10 h-10 rounded-xl border border-slate-200 object-cover cursor-pointer hover:scale-105 transition-transform"
                            onClick={() => setDetailProduct(req)}
                          />
                        ) : (
                          <div 
                            className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 cursor-pointer"
                            onClick={() => setDetailProduct(req)}
                          >
                            <ImageIcon size={16} />
                          </div>
                        )}
                      </td>
                      {/* Category Name */}
                      <td className="px-6 py-5">
                        <span className="text-xs font-bold text-slate-600">
                          {mainCategory}
                        </span>
                      </td>
                      {/* Sub Category Name */}
                      <td className="px-6 py-5">
                        <span className="text-xs font-bold text-slate-600">
                          {subCategory}
                        </span>
                      </td>
                      {/* Wholesale Price */}
                      <td className="px-6 py-5">
                        <span className="text-xs font-black text-slate-700 tabular-nums whitespace-nowrap">
                          ₹{req.wholesaleRate}
                        </span>
                      </td>
                      {/* Bulk Rate */}
                      <td className="px-6 py-5">
                        <span className="text-xs font-black text-indigo-600">
                          {req.bulkDiscount || 0}% Off
                        </span>
                      </td>
                      {/* Min Quantity */}
                      <td className="px-6 py-5">
                        <span className="text-xs font-black text-slate-700 tabular-nums">
                          {req.bulkThreshold || 0} units
                        </span>
                      </td>
                      {/* GST */}
                      <td className="px-6 py-5">
                        <span className="text-xs font-black text-slate-700 tabular-nums">
                          {req.gst || 18}%
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-5">
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          <button
                            onClick={() => setDetailProduct(req)}
                            className="px-3 py-2 rounded-xl bg-slate-55 text-slate-500 text-[10px] font-black uppercase tracking-widest border border-slate-100 hover:bg-slate-100 transition-all cursor-pointer"
                          >
                            Details
                          </button>
                          {req.hasMasterProduct ? (
                            <>
                              <button
                                disabled={isProcessing !== null}
                                onClick={() => setModalData({
                                  isOpen: true,
                                  requestId: req._id || req.id,
                                  type: 'rejected',
                                  productName: req.materialName,
                                  wholesaleRate: req.wholesaleRate,
                                  message: '',
                                  fullRequest: req
                                })}
                                className="px-3.5 py-2 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-600 hover:text-white transition-all shadow-sm cursor-pointer disabled:opacity-50"
                              >
                                Reject
                              </button>
                              <button
                                disabled={isProcessing !== null}
                                onClick={() => setModalData({
                                  isOpen: true,
                                  requestId: req._id || req.id,
                                  type: 'approved',
                                  productName: req.materialName,
                                  wholesaleRate: req.wholesaleRate,
                                  message: '',
                                  fullRequest: req
                                })}
                                className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg active:scale-95 cursor-pointer disabled:opacity-50"
                              >
                                Approve
                              </button>
                            </>
                          ) : (
                            <span className="px-2.5 py-1 text-[8px] font-black text-amber-500 bg-amber-50 rounded uppercase tracking-wider border border-amber-100">
                              setup product/create category
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredData.length > 0 && (
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end transition-colors hover:bg-slate-100/30">
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(p => p - 1)}
                  className="p-1 px-3 border border-slate-200 text-[9px] font-bold uppercase tracking-widest rounded-sm bg-white hover:bg-slate-950 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Prev
                </button>
                <span className="px-4 text-[9px] font-black text-slate-900 tracking-widest tabular-nums bg-slate-200/50 h-6 flex items-center rounded-sm whitespace-nowrap">
                  PG {String(page).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
                </span>
                <button
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(p => p + 1)}
                  className="p-1 px-3 border border-slate-200 text-[9px] font-bold uppercase tracking-widest rounded-sm bg-white hover:bg-slate-950 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation & Feedback Message Input Window (Modal) */}
      <AnimatePresence>
        {modalData.isOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setModalData(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl space-y-5 border border-slate-200"
            >
              <div className="flex justify-between items-center pb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${modalData.type === 'approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    <MessageSquare size={16} />
                  </div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    {modalData.type === 'approved' ? 'Approve Product' : 'Reject Product'}
                  </h3>
                </div>
                <button 
                  onClick={() => setModalData(prev => ({ ...prev, isOpen: false }))} 
                  className="p-1.5 hover:bg-slate-50 rounded-full text-slate-400"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Product Context Info */}
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product Details</p>
                <div className="flex justify-between text-xs font-black text-slate-800">
                  <span className="uppercase">{modalData.productName}</span>
                  <span className="tabular-nums text-slate-900">₹{modalData.wholesaleRate}</span>
                </div>
              </div>

              {/* Feedback Input */}
              <div className="space-y-1.5 text-left">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">
                  Message for Supplier
                </label>
                <textarea 
                  required
                  rows={4}
                  value={modalData.message}
                  onChange={e => setModalData(prev => ({ ...prev, message: e.target.value }))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none resize-none placeholder:text-slate-300"
                  placeholder={modalData.type === 'approved' ? 'Add message (e.g. Your custom product request has been approved and is added to the catalog...)' : 'Reason for rejection...'}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setModalData(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-3.5 border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleAction(modalData.requestId, modalData.type, modalData.message)}
                  disabled={!modalData.message.trim() || isProcessing !== null}
                  className={`flex-1 py-3.5 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${modalData.type === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/10'}`}
                >
                  {isProcessing !== null ? 'Processing...' : modalData.type === 'approved' ? 'Approve' : 'Reject'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Full Product Details Modal */}
      <AnimatePresence>
        {detailProduct && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setDetailProduct(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-3xl p-8 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col"
            >
              <div className="flex justify-between items-start shrink-0 border-b border-slate-100 pb-4">
                <div>
                  <span className="bg-primary/5 text-primary text-[8px] font-black uppercase tracking-[0.2em] px-2.5 py-1 rounded-md border border-primary/10">
                    {detailProduct.skuId || 'PENDING SKU'}
                  </span>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight mt-2 uppercase">{detailProduct.materialName}</h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">By {detailProduct.brand || 'Generic'}</p>
                </div>
                <button 
                  onClick={() => setDetailProduct(null)} 
                  className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="overflow-y-auto space-y-6 flex-1 py-6 pr-1 custom-scrollbar text-xs font-bold text-slate-600">
                {/* Images Carousel/Gallery */}
                {detailProduct.images && detailProduct.images.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Product Images</p>
                    <div className="flex gap-2 overflow-x-auto py-2 pr-1 select-none">
                      {detailProduct.images.map((imgUrl, i) => (
                        <img 
                          key={i} 
                          src={imgUrl} 
                          alt="product" 
                          className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0" 
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-5 rounded-3xl">
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Supplier Code</p>
                    <span className="text-slate-800 font-black">{detailProduct.supplierId || '-'}</span>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Supplier Facility</p>
                    <span className="text-slate-800 font-black uppercase">{detailProduct.supplierFacilityName || '-'}</span>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Category Hierarchy</p>
                    <p className="text-slate-800 text-[11px]">
                      {detailProduct.categoryId?.mainCategory || 'Other'} <span className="text-slate-300 mx-1">→</span> {detailProduct.categoryId?.subCategory || 'General'}
                    </p>
                  </div>
                </div>

                {/* Pricing Columns */}
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Pricing & Taxation</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-slate-100 p-4 rounded-2xl flex flex-col justify-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Wholesale Rate</span>
                      <span className="text-base font-black text-slate-900">₹{detailProduct.wholesaleRate} <span className="text-[9px] text-slate-400 font-bold uppercase">/ {detailProduct.quantity || 'Unit'}</span></span>
                    </div>
                    <div className="border border-slate-100 p-4 rounded-2xl flex flex-col justify-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">GST & HSN</span>
                      <span className="text-sm font-black text-slate-900">{detailProduct.gst || 18}% <span className="text-[9px] text-slate-400 font-bold">({detailProduct.hsnCode || '-'})</span></span>
                    </div>
                    <div className="border border-slate-100 p-4 rounded-2xl col-span-2 flex justify-between items-center">
                      <div>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Bulk Discount</span>
                        <span className="text-sm font-black text-indigo-600">{detailProduct.bulkDiscount || 0}% Off</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Bulk Threshold</span>
                        <span className="text-xs font-black text-slate-800">{detailProduct.bulkThreshold || 0} Units</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Logistics */}
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Logistics & Delivery</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-slate-100 p-4 rounded-2xl flex flex-col justify-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Delivery Frequency</span>
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider">{detailProduct.deliveryFrequency || '-'}</span>
                    </div>
                    <div className="border border-slate-100 p-4 rounded-2xl flex flex-col justify-center">
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">MOV for Free Delivery</span>
                      <span className="text-xs font-black text-slate-800">₹{detailProduct.movFreeDelivery || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">Product Description</p>
                  <div className="bg-slate-50 p-4 rounded-2xl text-[11px] font-medium text-slate-600 leading-relaxed break-words whitespace-pre-line">
                    {detailProduct.description || 'No description provided.'}
                  </div>
                </div>
              </div>

              {/* Action row in details */}
              <div className="flex gap-3 pt-4 border-t border-slate-100 shrink-0">
                {detailProduct.hasMasterProduct ? (
                  <>
                    <button
                      onClick={() => {
                        setDetailProduct(null);
                        setModalData({
                          isOpen: true,
                          requestId: detailProduct._id || detailProduct.id,
                          type: 'rejected',
                          productName: detailProduct.materialName,
                          wholesaleRate: detailProduct.wholesaleRate,
                          message: '',
                          fullRequest: detailProduct
                        });
                      }}
                      className="flex-1 py-3 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-600 hover:text-white transition-all text-center cursor-pointer"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => {
                        setDetailProduct(null);
                        setModalData({
                          isOpen: true,
                          requestId: detailProduct._id || detailProduct.id,
                          type: 'approved',
                          productName: detailProduct.materialName,
                          wholesaleRate: detailProduct.wholesaleRate,
                          message: '',
                          fullRequest: detailProduct
                        });
                      }}
                      className="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all text-center cursor-pointer shadow-lg"
                    >
                      Approve
                    </button>
                  </>
                ) : (
                  <span className="flex-1 py-3 bg-amber-50 text-amber-500 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-100 text-center select-none">
                    setup product/create category
                  </span>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
