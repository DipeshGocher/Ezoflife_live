import { filterValues, matchesFilter, matchesUserSearch, vendorRegistrationType } from '../utils/filters';
import MultiSelectFilter from '../components/common/MultiSelectFilter';
import React, { useEffect, useState, useMemo } from 'react';
import { 
  Users as UsersIcon, Mail, Phone, MoreHorizontal, ShieldAlert, UserCheck, 
  Activity, Zap, Search, Filter, Eye, Edit2, Trash2, CheckCircle, XCircle, 
  UserPlus, X, Save, Check, Ban, Clock, Info, RotateCw, ChevronDown, FileText, MapPin,
  AlertTriangle, Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Link, useSearchParams } from 'react-router-dom';
import { adminApi, BASE_URL, serviceApi } from '../../../lib/api';
import PageHeader from '../components/common/PageHeader';
import DataGrid from '../components/tables/DataGrid';
import StatusBadge from '../components/common/StatusBadge';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [usersError, setUsersError] = useState('');
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const typeParam = searchParams.get('type');
  const vendorTypeParam = searchParams.get('vendorType');
  const [activeTab, setActiveTab] = useState(roleParam || 'All');
  const [selectedRoles, setSelectedRoles] = useState('All');
  const [selectedCustomerType, setSelectedCustomerType] = useState(typeParam || 'All');
  const [selectedVendorType, setSelectedVendorType] = useState(vendorTypeParam || 'All');
  const [deleteModalUser, setDeleteModalUser] = useState(null);
  const [deleteRelatedData, setDeleteRelatedData] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (roleParam && ['All', 'Customer', 'Vendor', 'Supplier'].includes(roleParam)) {
      setActiveTab(roleParam);
    } else if (!roleParam) {
      setActiveTab('All');
    }
  }, [roleParam]);

  useEffect(() => {
    if (typeParam && ['individual', 'retail'].includes(typeParam)) {
      setSelectedCustomerType(typeParam);
    } else {
      setSelectedCustomerType('All');
    }
  }, [typeParam]);

  useEffect(() => {
    if (vendorTypeParam && ['All', 'registered', 'unregistered'].includes(vendorTypeParam)) {
      setSelectedVendorType(vendorTypeParam);
    } else {
      setSelectedVendorType('All');
    }
    setPage(1);
  }, [vendorTypeParam]);    
  const [selectedName, setSelectedName] = useState('All');
  const [selectedCity, setSelectedCity] = useState('All');
  const [selectedState, setSelectedState] = useState('All');
  const [selectedPincode, setSelectedPincode] = useState('All');



  const [selectedStatus, setSelectedStatus] = useState('All');
  const [geofences, setGeofences] = useState([]);
  const [selectedGeofence, setSelectedGeofence] = useState('All');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  useEffect(() => { setSearchQuery(searchParams.get('search') || ''); }, [searchParams]);
  const itemsPerPage = 10;
  
  // Modals state
  const [editingUser, setEditingUser] = useState(null);
  const [selectedAddressForModal, setSelectedAddressForModal] = useState(null);
  const [rejectionModal, setRejectionModal] = useState(null); // { userId, serviceId }
  const [rejectionReason, setRejectionReason] = useState('');
  const [customServices, setCustomServices] = useState([]); // Services from 'Service' collection for current editing user
  const [isSaving, setIsSaving] = useState(false);
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  const tabs = ['All', 'Customer', 'Vendor', 'Supplier'];

  const [masterServices, setMasterServices] = useState([]);

  const fetchMasterServices = async () => {
    try {
      const msRes = await fetch(`${BASE_URL}/master-services`);
      const msData = await msRes.json();
      console.log('📦 [ADMIN_DEBUG] Loaded Master Services:', msData.length);
      setMasterServices(Array.isArray(msData) ? msData : []);
    } catch (err) {
      console.error('Fetch master services error:', err);
    }
  };

  const latestFilterRequest = React.useRef(0);
  const fetchUsers = async () => {
    const requestId = ++latestFilterRequest.current;
    setLoading(true);
    try {
      const role = activeTab === 'All' ? null : activeTab;
      const res = await adminApi.getAllUsers(role);
      if (requestId !== latestFilterRequest.current) return;
      if (!Array.isArray(res)) throw new Error('User list is unavailable. Please retry.');
      setUsers(res);
      setUsersError('');
    } catch (err) {
      if (requestId !== latestFilterRequest.current) return;
      setUsers([]);
      setUsersError(err.message || 'Unable to load users. Please retry.');
      console.error('Fetch users error:', err);
    } finally {
      if (requestId === latestFilterRequest.current) setLoading(false);
    }
  };

  const fetchGeofences = async () => {
    try {
      const res = await fetch(`${BASE_URL}/geofence/areas`);
      const data = await res.json();
      setGeofences(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch geofences error:', err);
    }
  };

  useEffect(() => {
    fetchMasterServices();
    fetchGeofences();
  }, []);

  useEffect(() => {
    fetchUsers();
    setPage(1); // Reset page on tab change
    setSelectedName('All');
    setSelectedCity('All');
    setSelectedState('All');
    setSelectedPincode('All');
    setSelectedStatus('All');
    setSelectedGeofence('All');
    if (activeTab !== 'Customer') {
      setSelectedCustomerType('All');
    }
    if (activeTab !== 'Vendor') {
      setSelectedVendorType('All');
    }
  }, [activeTab]);

  useEffect(() => {
    setPage(1); // Reset page on search change
  }, [searchQuery]);

  useEffect(() => {
    // REFRESHED VENDOR SERVICE FETCHER
    const fetchVendorCustomServices = async () => {
        if (editingUser && editingUser.role === 'Vendor') {
            console.log('🔄 [SYNC] Fetching custom services for vendor:', editingUser._id);
            try {
                const res = await serviceApi.getAll({ vendorId: editingUser._id });
                console.log('✨ [SYNC] Custom services retrieved:', res.length);
                setCustomServices(res);
            } catch (err) {
                console.error('🔥 [SYNC] Fetch custom services error:', err);
            }
        } else {
            setCustomServices([]);
        }
    };
    fetchVendorCustomServices();
  }, [editingUser?._id]);

  const getServiceName = (id) => {
    if (!id) return 'Unknown';
    if (!masterServices || masterServices.length === 0) return `Node: ${id.toString().slice(-6).toUpperCase()}`;
    
    const service = masterServices.find(s => 
        (s._id && s._id.toString() === id.toString()) || 
        (s.id && s.id.toString() === id.toString())
    );
    
    return service ? service.name : `Node: ${id.toString().slice(-6).toUpperCase()}`;
  };

  const handleToggleStatus = async (userId) => {
    try {
        await adminApi.toggleUserStatus(userId);
        fetchUsers();
        toast.success('Status updated');
    } catch (err) {
        console.error('Toggle status error:', err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalUser) return;
    try {
        setIsDeleting(true);
        const res = await adminApi.deleteUser(deleteModalUser._id, deleteRelatedData);
        toast.success(res?.message || 'User deleted');
        setDeleteModalUser(null);
        fetchUsers();
    } catch (err) {
        console.error('Delete user error:', err);
        toast.error(err?.message || 'Failed to delete user');
    } finally {
        setIsDeleting(false);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('CRITICAL ACTION: This will delete ALL users (Customers, Vendors, Suppliers). Are you absolutely sure?')) {
        try {
            setLoading(true);
            const response = await fetch(`${BASE_URL}/admin/users-clear-all`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (response.ok) {
                toast.success(result.message);
                fetchUsers();
            } else {
                toast.error(result.message || 'Operation failed');
            }
        } catch (err) {
            console.error('Clear users error:', err);
            toast.error('Failed to clear users');
        } finally {
            setLoading(false);
        }
    }
  };

  const handleUpdateServiceStatus = async (userId, serviceId, status, message = '') => {
    if (status === 'rejected' && !message) {
        setRejectionModal({ userId, serviceId });
        return;
    }

    try {
        await adminApi.updateServiceStatus(userId, serviceId, { status, message });
        toast.success(`Service ${status}`);
        
        // Update local state for immediate UI feedback
        setEditingUser(prev => {
            if (!prev || prev._id !== userId) return prev;
            const updatedServices = prev.shopDetails.services.map(s => 
                s.id === serviceId ? { ...s, status, rejectionReason: message } : s
            );
            return { ...prev, shopDetails: { ...prev.shopDetails, services: updatedServices } };
        });

        // Also update main list
        setUsers(prev => prev.map(u => {
            if (u._id !== userId) return u;
            const updatedServices = u.shopDetails.services.map(s => 
                s.id === serviceId ? { ...s, status, rejectionReason: message } : s
            );
            return { ...u, shopDetails: { ...u.shopDetails, services: updatedServices } };
        }));

        setRejectionModal(null);
        setRejectionReason('');
    } catch (err) {
        toast.error('Failed to update service status');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
        setIsSaving(true);
        await adminApi.updateUserProfile(editingUser._id, editingUser);
        toast.success('Profile updated successfully');
        setEditingUser(null);
        fetchUsers();
    } catch (err) {
        toast.error('Failed to save profile');
    } finally {
        setIsSaving(false);
    }
  };

  const getUserLocationDetails = (u) => {
    let city = u.city || '';
    let state = u.state || '';
    let pincode = u.pincode || '';

    if (u.role === 'Customer') {
      const defAddr = u.addresses?.find(a => a.isDefault) || u.addresses?.[0];
      if (defAddr) {
        city = defAddr.city || city;
        state = defAddr.state || state;
        pincode = defAddr.pincode || pincode;
      }
    } else if (u.role === 'Vendor') {
      city = u.shopDetails?.city || city;
      state = u.shopDetails?.state || state;
      pincode = u.shopDetails?.pincode || pincode;
    } else if (u.role === 'Supplier') {
      city = u.supplierDetails?.city || city;
      state = u.supplierDetails?.state || state;
      pincode = u.supplierDetails?.pincode || pincode;
    }
    return { 
      city: city.trim(), 
      state: state.trim(), 
      pincode: pincode.toString().trim() 
    };
  };

  const uniqueNames = useMemo(() => {
    const names = users.map(u => u.displayName).filter(Boolean);
    return ['All', ...new Set(names)].sort();
  }, [users]);

  const uniqueCities = useMemo(() => {
    const cities = users.map(u => getUserLocationDetails(u).city).filter(Boolean);
    return ['All', ...new Set(cities)].sort();
  }, [users]);

  const uniqueStates = useMemo(() => {
    const states = users.map(u => getUserLocationDetails(u).state).filter(Boolean);
    return ['All', ...new Set(states)].sort();
  }, [users]);

  const uniquePincodes = useMemo(() => {
    const pincodes = users.map(u => getUserLocationDetails(u).pincode).filter(Boolean);
    return ['All', ...new Set(pincodes)].sort();
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchName = matchesFilter(selectedName, u.displayName);
      const loc = getUserLocationDetails(u);
      const matchCity = matchesFilter(selectedCity, loc.city);
      const matchState = matchesFilter(selectedState, loc.state);
      const matchPincode = matchesFilter(selectedPincode, loc.pincode);
      
      let matchStatus = true;
      if (selectedStatus !== 'All') {
        const userStatusText = u.status === 'approved' ? 'Active' : u.status === 'rejected' ? 'Blocked' : 'Pending';
        matchStatus = matchesFilter(selectedStatus, userStatusText);
      }

      const matchGeofence = !filterValues(selectedGeofence).length || geofences.some(g =>
        matchesFilter(selectedGeofence, g.areaName || g.name) && g.pincodes?.map(String).includes(loc.pincode));

      let matchCustomerType = true;
      if (u.role === 'Customer' && selectedCustomerType !== 'All') {
        matchCustomerType = matchesFilter(selectedCustomerType, u.customerType);
      }

      let matchVendorType = true;
      if (u.role === 'Vendor' && selectedVendorType !== 'All') {
        matchVendorType = matchesFilter(selectedVendorType, vendorRegistrationType(u));
      }
      
      return matchesUserSearch(u, searchQuery) && matchesFilter(selectedRoles, u.role) && matchName && matchCity && matchState && matchPincode && matchStatus && matchGeofence && matchCustomerType && matchVendorType;
    });
  }, [users, searchQuery, selectedRoles, selectedName, selectedCity, selectedState, selectedPincode, selectedStatus, selectedGeofence, geofences, selectedCustomerType, selectedVendorType]);

  const paginatedUsers = useMemo(() => {
    return filteredUsers.slice((page - 1) * itemsPerPage, page * itemsPerPage);
  }, [filteredUsers, page]);

  const columns = useMemo(() => {
    const baseCols = [
      { 
        header: 'Name', 
        key: 'displayName',
        render: (val, row) => {
          const displayVal = (row.role === 'Vendor' && row.ownerName) ? row.ownerName : (val || 'Unnamed User');
          return (
            <span className="font-black text-slate-900 text-[11px] uppercase tracking-tight">
              {displayVal}
            </span>
          );
        }
      },
      {
        header: 'Email Address',
        key: 'email',
        render: (val) => (
          <span className="text-[10px] text-slate-500 font-bold tracking-tight">
            {val || 'N/A'}
          </span>
        )
      }
    ];

    if (activeTab === 'Vendor') {
      baseCols.push({
        header: 'Facility Name',
        key: 'facilityName',
        render: (val, row) => (
          <span className="text-[10px] text-slate-900 font-bold uppercase tracking-tight">
            {row.facilityName || 'N/A'}
          </span>
        )
      });
    }

    baseCols.push({
      header: 'Contact Number',
      key: 'phone',
      render: (val) => (
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider tabular-nums">
          {val || 'N/A'}
        </span>
      )
    });

    if (activeTab !== 'Vendor') {
      baseCols.push({
        header: 'Role',
        key: 'role',
        render: (val, row) => (
          <span className="text-[10px] text-slate-900 font-black uppercase tracking-widest bg-slate-100 border border-slate-200 px-2.5 py-1 rounded">
            {val || 'Customer'}
          </span>
        )
      });
    }

    if (activeTab !== 'Supplier') {
      baseCols.push({
        header: 'Type',
        key: 'customerType',
        render: (val, row) => {
          if (row.role === 'Vendor') {
            return (
              <span className="px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                {row.businessType || 'N/A'}
              </span>
            );
          }
          if (row.role !== 'Customer') {
            return <span className="text-[10px] text-slate-400 font-bold uppercase">N/A</span>;
          }
          const isBusiness = val === 'retail';
          return (
            <span className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider ${isBusiness ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
              {isBusiness ? 'Business' : 'Individual'}
            </span>
          );
        }
      });
    }

    if (activeTab === 'Supplier') {
      baseCols.push(
        {
          header: 'Type',
          key: 'supplierDetails',
          render: (val) => (
            <span className="px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
              {val?.entityType || 'N/A'}
            </span>
          )
        },
        {
          header: 'Designation',
          key: 'supplierDetails',
          render: (val) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider">
              {val?.designation || 'N/A'}
            </span>
          )
        },
        {
          header: 'GST Number',
          key: 'supplierDetails',
          render: (val) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider tabular-nums">
              {val?.gst || 'N/A'}
            </span>
          )
        },
        {
          header: 'Business PAN',
          key: 'supplierDetails',
          render: (val) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider tabular-nums">
              {val?.panNumber || 'N/A'}
            </span>
          )
        },
        {
          header: 'Aadhaar Number',
          key: 'supplierDetails',
          render: (val) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider tabular-nums">
              {val?.aadhaarNumber || 'N/A'}
            </span>
          )
        },
        {
          header: 'Bank Name',
          key: 'bankDetails',
          render: (val) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wide">
              {val?.bankName || 'N/A'}
            </span>
          )
        },
        {
          header: 'Account Number',
          key: 'bankDetails',
          render: (val) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider tabular-nums">
              {val?.accountNumber || 'N/A'}
            </span>
          )
        },
        {
          header: 'Bank IFSC Code',
          key: 'bankDetails',
          render: (val) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider tabular-nums">
              {val?.ifscCode || 'N/A'}
            </span>
          )
        },
        {
          header: 'Category',
          key: 'supplierDetails',
          render: (val) => {
            const categories = val?.supplyCategories || [];
            if (categories.length === 0) return <span className="text-[10px] text-slate-400 font-bold uppercase">N/A</span>;
            return (
              <div className="flex flex-wrap gap-1 max-w-[200px]">
                {categories.map((cat, index) => (
                  <span 
                    key={index} 
                    className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            );
          }
        }
      );
    }

    if (activeTab === 'Customer' && filterValues(selectedCustomerType).length === 1 && matchesFilter(selectedCustomerType, 'retail')) {
      baseCols.push(
        {
          header: 'Business Name',
          key: 'businessName',
          render: (val, row) => {
            if (row.role !== 'Customer' || row.customerType !== 'retail') {
              return <span className="text-[10px] text-slate-400 font-bold uppercase">N/A</span>;
            }
            return (
              <span className="text-[10px] text-slate-900 font-black uppercase tracking-tight truncate max-w-[150px]" title={val}>
                {val || 'N/A'}
              </span>
            );
          }
        },
        {
          header: 'GST Number',
          key: 'gstNumber',
          render: (val, row) => {
            if (row.role !== 'Customer' || row.customerType !== 'retail') {
              return <span className="text-[10px] text-slate-400 font-bold uppercase">N/A</span>;
            }
            return (
              <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider tabular-nums">
                {val || 'N/A'}
              </span>
            );
          }
        },
        {
          header: 'Business Address',
          key: 'businessAddress',
          render: (val, row) => {
            if (row.role !== 'Customer' || row.customerType !== 'retail') {
              return <span className="text-[10px] text-slate-400 font-bold uppercase">N/A</span>;
            }
            return (
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide truncate max-w-[200px]" title={val}>
                {val || 'N/A'}
              </span>
            );
          }
        }
      );
    }


    if (activeTab === 'Vendor' && filterValues(selectedVendorType).length === 1 && matchesFilter(selectedVendorType, 'registered')) {
      baseCols.push(
        {
          header: 'PAN Card Number',
          key: 'panNumber',
          render: (val, row) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider tabular-nums">
              {row.panNumber || 'N/A'}
            </span>
          )
        },
        {
          header: 'GST Number',
          key: 'gstNumber',
          render: (val, row) => {
            const gstVal = row.gstNumber || row.shopDetails?.gst;
            return (
              <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider tabular-nums">
                {gstVal || 'N/A'}
              </span>
            );
          }
        }
      );
    }

    if (activeTab === 'Vendor' && filterValues(selectedVendorType).length === 1 && matchesFilter(selectedVendorType, 'unregistered')) {
      baseCols.push(
        {
          header: 'Aadhaar Number',
          key: 'aadharNumber',
          render: (val, row) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider tabular-nums">
              {row.aadharNumber || 'N/A'}
            </span>
          )
        }
      );
    }

    if (activeTab === 'Vendor') {
      baseCols.push(
        {
          header: 'Bank Name',
          key: 'bankDetails',
          render: (val) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wide">
              {val?.bankName || 'N/A'}
            </span>
          )
        },
        {
          header: 'Account Number',
          key: 'bankDetails',
          render: (val) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider tabular-nums">
              {val?.accountNumber || 'N/A'}
            </span>
          )
        },
        {
          header: 'Bank IFSC Code',
          key: 'bankDetails',
          render: (val) => (
            <span className="text-[10px] text-slate-600 font-bold uppercase tracking-wider tabular-nums">
              {val?.ifscCode || 'N/A'}
            </span>
          )
        }
      );
    }

    if (activeTab === 'Customer' && filterValues(selectedCustomerType).length === 1 && matchesFilter(selectedCustomerType, 'individual')) {
      baseCols.push({
        header: 'Location',
        key: 'addresses',
        render: (val, row) => {
          const addresses = row.addresses || [];
          if (addresses.length === 0) {
            if (row.address) {
              return (
                <button
                  onClick={() => setSelectedAddressForModal({ type: 'Home', address: row.address })}
                  className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all cursor-pointer"
                >
                  Home
                </button>
              );
            }
            return <span className="text-[10px] text-slate-400 font-bold uppercase">No Address Set</span>;
          }
          return (
            <div className="flex flex-wrap gap-1 max-w-[200px]">
              {addresses.map((addr, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedAddressForModal(addr)}
                  className="px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-900 hover:text-white hover:border-blue-900 transition-all cursor-pointer shadow-sm"
                >
                  {addr.type || 'Home'}
                </button>
              ))}
            </div>
          );
        }
      });
    } else if (activeTab === 'Vendor' || activeTab === 'Supplier') {
      baseCols.push({
        header: 'Location',
        key: 'address',
        render: (val, row) => {
          const isSupplier = row.role === 'Supplier';
          const addressVal = isSupplier 
            ? (row.supplierDetails?.address || row.address || val)
            : (row.shopDetails?.address || row.address || val);
            
          if (!addressVal) {
            return <span className="text-[10px] text-slate-400 font-bold uppercase">No Address Set</span>;
          }
          
          const cityVal = isSupplier ? (row.supplierDetails?.city || row.city) : (row.shopDetails?.city || row.city);
          const stateVal = isSupplier ? (row.supplierDetails?.state || row.state) : (row.shopDetails?.state || row.state);
          const pincodeVal = isSupplier ? (row.supplierDetails?.pincode || row.pincode) : (row.shopDetails?.pincode || row.pincode);

          return (
            <button
              onClick={() => setSelectedAddressForModal({
                type: 'Default',
                address: addressVal,
                city: cityVal,
                state: stateVal,
                pincode: pincodeVal,
                location: row.location
              })}
              className="px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-900 hover:text-white hover:border-blue-900 transition-all cursor-pointer shadow-sm"
            >
              Default
            </button>
          );
        }
      });
    } else {
      baseCols.push({
        header: 'Location',
        key: 'address',
        render: (val) => (
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide truncate max-w-[200px]" title={val}>
            {val || 'No Address Set'}
          </span>
        )
      });
    }

    baseCols.push(
      { 
        header: 'Registration', 
        key: 'createdAt',
        render: (val) => (
          <span className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">
            {new Date(val).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )
      },
      { 
        header: 'Status', 
        key: 'status', 
        render: (val) => <StatusBadge status={val === 'approved' ? 'Active' : val === 'rejected' ? 'Blocked' : 'Pending'} /> 
      },
      { 
        header: 'Actions', 
        key: 'actions', 
        align: 'right',
        render: (_, row) => (
          <div className="flex items-center justify-end gap-2">
            <Link to={`/admin/users/${row._id}/history`} aria-label={`View history for ${row.displayName || row.phone}`} title="Order and support history" className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-900 hover:text-white"><Clock size={14} /></Link>
            <button 
              onClick={() => setEditingUser(JSON.parse(JSON.stringify(row)))} // Deep clone for editing
              title="Edit Full Profile" 
              className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all shadow-sm"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => { setDeleteRelatedData(false); setDeleteModalUser(row); }}
              title="Delete User"
              className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all shadow-sm"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      }
    );

    return baseCols;
  }, [selectedCustomerType, activeTab, selectedVendorType]);

  const handleExportFile = (format) => {
    try {
      const headers = [
        "Name", "Contact Number", "Role", "Type", "Business Name", "GST Number", "Business Address", "Location", "Registration Date", "Status"
      ];
      
      const rows = filteredUsers.map(u => [
        u.displayName || 'Unnamed User',
        u.phone || 'N/A',
        u.role || 'Customer',
        u.role === 'Customer' ? (u.customerType === 'retail' ? 'Business' : 'Individual') : 'N/A',
        (u.role === 'Customer' && u.customerType === 'retail') ? (u.businessName || 'N/A') : 'N/A',
        (u.role === 'Customer' && u.customerType === 'retail') ? (u.gstNumber || 'N/A') : 'N/A',
        (u.role === 'Customer' && u.customerType === 'retail') ? (u.businessAddress || 'N/A') : 'N/A',
        u.address || 'No Address Set',
        new Date(u.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        u.status === 'approved' ? 'Active' : u.status === 'rejected' ? 'Blocked' : 'Pending'
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
        return { wch: Math.min(Math.max(maxLen + 3, 12), 50) };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Users");

      if (format === 'excel') {
        XLSX.writeFile(wb, `${activeTab}_Users_Export_${new Date().getTime()}.xlsx`);
      } else if (format === 'csv') {
        XLSX.writeFile(wb, `${activeTab}_Users_Export_${new Date().getTime()}.csv`, { bookType: 'csv' });
      }
      toast.success(`${format.toUpperCase()} export downloaded successfully`);
    } catch (err) {
      console.error(`Export ${format} error:`, err);
      toast.error(`Error exporting to ${format}`);
    }
  };

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
                  Export Users List
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
        <div className="flex items-center"><input type="search" aria-label="Search users" placeholder="Search by name, phone or email"
            value={searchQuery} onChange={event => setSearchQuery(event.target.value)}
            className="w-full sm:w-80 px-3 py-2 bg-slate-50 border border-slate-200 rounded-sm text-xs outline-none focus:border-slate-400" /></div>
        {usersError && <div role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{usersError} <button type="button" onClick={fetchUsers} className="ml-3 underline">Retry user list</button></div>}
        <DataGrid 
          title=""
          showTotalEntities={false}
          leftContent={null}
          columns={columns}
          data={paginatedUsers}
          loading={loading}
          showSearch={false}
          showFilter={false}
          actions={
            <div className="flex items-center gap-3 justify-end">
              {/* Geofences Filter */}
              <MultiSelectFilter value={selectedGeofence} onChange={event => { setSelectedGeofence(event.target.value); setPage(1); }}
                  className="w-[160px] bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 outline-none cursor-pointer transition-all">
                  <option value="All">Geofences</option>
                  {[...new Set(geofences.map(g => g.areaName || g.name).filter(Boolean))].map(item => <option key={item} value={item}>{item}</option>)}
              </MultiSelectFilter>

              {/* Role Filter */}
              {!roleParam && (
                  <div className="relative flex items-center w-[160px]">
                      <MultiSelectFilter
                          value={selectedRoles}
                          onChange={(e) => {
                              const val = e.target.value;
                              setSelectedRoles(val);
                              setActiveTab(Array.isArray(val) && val.length === 1 ? val[0] : 'All');
                              setPage(1);
                          }}
                          className="w-full appearance-none bg-slate-50 border border-slate-200/80 rounded-sm pl-4 pr-10 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all"
                      >
                          {tabs.map(tab => (
                              <option key={tab} value={tab}>{tab === 'All' ? 'Role' : `${tab}s`}</option>
                          ))}
                      </MultiSelectFilter>
                  </div>
              )}

              {/* Customer Type Filter (Visible only when on Customer Tab) */}
              {activeTab === 'Customer' && !typeParam && (
                  <div className="relative flex items-center w-[160px]">
                      <MultiSelectFilter
                          value={selectedCustomerType}
                          onChange={(e) => {
                              const val = e.target.value;
                              setSelectedCustomerType(val);
                              setPage(1);
                          }}
                          className="w-full appearance-none bg-slate-50 border border-slate-200/80 rounded-sm pl-4 pr-10 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all"
                      >
                          <option value="All">Customers</option>
                          <option value="individual">Individual</option>
                          <option value="retail">Business</option>
                      </MultiSelectFilter>
                  </div>
              )}

              {/* Vendor Type Filter (Visible only when on Vendor Tab) */}
              {activeTab === 'Vendor' && !vendorTypeParam && (
                  <div className="relative flex items-center w-[160px]">
                      <MultiSelectFilter
                          value={selectedVendorType}
                          onChange={(e) => {
                              const val = e.target.value;
                              setSelectedVendorType(val);
                              setPage(1);
                          }}
                          className="w-full appearance-none bg-slate-50 border border-slate-200/80 rounded-sm pl-4 pr-10 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all"
                      >
                          <option value="All">Vendors</option>
                          <option value="registered">Registered</option>
                          <option value="unregistered">Unregistered</option>
                      </MultiSelectFilter>
                  </div>
              )}

              {/* Names Filter */}
              <MultiSelectFilter value={selectedName} onChange={event => { setSelectedName(event.target.value); setPage(1); }}
                  className="w-[160px] bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 outline-none cursor-pointer transition-all">
                  <option value="All">Names</option>
                  {uniqueNames.filter(name => name !== 'All').map(item => <option key={item} value={item}>{item}</option>)}
              </MultiSelectFilter>

              {/* Cities Filter */}
              <MultiSelectFilter value={selectedCity} onChange={event => { setSelectedCity(event.target.value); setPage(1); }}
                  className="w-[160px] bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 outline-none cursor-pointer transition-all">
                  <option value="All">Cities</option>
                  {uniqueCities.filter(city => city !== 'All').map(item => <option key={item} value={item}>{item}</option>)}
              </MultiSelectFilter>

              {/* States Filter */}
              <MultiSelectFilter value={selectedState} onChange={event => { setSelectedState(event.target.value); setPage(1); }}
                  className="w-[160px] bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 outline-none cursor-pointer transition-all">
                  <option value="All">States</option>
                  {uniqueStates.filter(state => state !== 'All').map(item => <option key={item} value={item}>{item}</option>)}
              </MultiSelectFilter>

              {/* Pincodes Filter */}
              <MultiSelectFilter value={selectedPincode} onChange={event => { setSelectedPincode(event.target.value); setPage(1); }}
                  className="w-[160px] bg-slate-50 border border-slate-200/80 rounded-sm px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 outline-none cursor-pointer transition-all">
                  <option value="All">Pincodes</option>
                  {uniquePincodes.filter(pin => pin !== 'All').map(item => <option key={item} value={item}>{item}</option>)}
              </MultiSelectFilter>

              {/* Status Filter */}
              <div className="relative flex items-center w-[130px]">
                  <MultiSelectFilter
                      value={selectedStatus}
                      onChange={(e) => {
                          setSelectedStatus(e.target.value);
                          setPage(1);
                      }}
                      className="w-full appearance-none bg-slate-50 border border-slate-200/80 rounded-sm pl-4 pr-10 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-800 hover:bg-slate-100/50 focus:border-slate-300 outline-none cursor-pointer transition-all"
                  >
                      <option value="All">Statuses</option>
                      <option value="Active">Active</option>
                      <option value="Blocked">Blocked</option>
                      {activeTab !== 'Customer' && <option value="Pending">Pending</option>}
                  </MultiSelectFilter>
              </div>
            </div>
          }
          pagination={{
            page,
            totalPages: Math.ceil(filteredUsers.length / itemsPerPage) || 1,
            total: filteredUsers.length
          }}
          onPageChange={setPage}
        />
      </div>

      {/* Edit User Modal */}
      <AnimatePresence>
        {editingUser && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setEditingUser(null)}
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                />
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col overflow-hidden"
                >
                    <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-900/20">
                                <Edit2 size={24} />
                            </div>
                            <div className="flex flex-col">
                                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Edit Partner Profile</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Role: {editingUser.role} · ID: {editingUser._id}</p>
                            </div>
                        </div>
                        <button onClick={() => setEditingUser(null)} className="p-3 hover:bg-white rounded-full transition-colors border border-slate-200 shadow-sm">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-10 space-y-12">
                        {/* Basic Information */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-3">
                                <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs">01</span>
                                <h4 className="font-black text-sm uppercase tracking-widest text-slate-900">Personal & Business Details</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {editingUser.role === 'Vendor' && !['Pvt Ltd', 'Franchise'].includes(editingUser.businessType) ? (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Owner Full Name</label>
                                            <input 
                                                value={editingUser.ownerName || ''} 
                                                onChange={(e) => setEditingUser({...editingUser, ownerName: e.target.value})}
                                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Facility Name</label>
                                            <input 
                                                value={editingUser.facilityName || ''} 
                                                onChange={(e) => setEditingUser({...editingUser, facilityName: e.target.value})}
                                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Business Entity Type</label>
                                            <select
                                                value={editingUser.businessType || ''}
                                                onChange={(e) => setEditingUser({...editingUser, businessType: e.target.value})}
                                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all"
                                            >
                                                <option value="">Select business entity type</option>
                                                <option value="Proprietorship">Proprietorship</option>
                                                <option value="Partnership">Partnership</option>
                                                <option value="Pvt Ltd">Pvt Ltd</option>
                                                <option value="Franchise">Franchise</option>
                                                <option value="Unregistered/Local">Unregistered/Local</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                                            <input 
                                                disabled
                                                value={editingUser.phone || ''} 
                                                className="w-full p-4 bg-slate-100 border border-slate-100 rounded-2xl text-xs font-bold text-slate-400 cursor-not-allowed" 
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Aadhaar Number</label>
                                            <input 
                                                value={editingUser.aadharNumber || ''} 
                                                onChange={(e) => setEditingUser({...editingUser, aadharNumber: e.target.value})}
                                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Address</label>
                                            <input 
                                                value={editingUser.address || ''} 
                                                onChange={(e) => setEditingUser({...editingUser, address: e.target.value})}
                                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                                            <input 
                                                value={editingUser.displayName || ''} 
                                                onChange={(e) => setEditingUser({...editingUser, displayName: e.target.value})}
                                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                                            <input 
                                                disabled
                                                value={editingUser.phone || ''} 
                                                className="w-full p-4 bg-slate-100 border border-slate-100 rounded-2xl text-xs font-bold text-slate-400 cursor-not-allowed" 
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                                            <input 
                                                value={editingUser.email || ''} 
                                                onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                            />
                                        </div>
                                        {!(editingUser.role === 'Customer' && editingUser.customerType === 'individual') && (
                                            <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Address</label>
                                                <input 
                                                    value={editingUser.address || ''} 
                                                    onChange={(e) => setEditingUser({...editingUser, address: e.target.value})}
                                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                                />
                                            </div>
                                        )}
                                        {(editingUser.role === 'Vendor' || editingUser.role === 'Supplier') && (
                                            <>
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Shop/Business Name</label>
                                                    <input 
                                                        value={editingUser.role === 'Vendor' ? (editingUser.shopDetails?.name || '') : (editingUser.supplierDetails?.businessName || '')} 
                                                        onChange={(e) => {
                                                            if(editingUser.role === 'Vendor') {
                                                                setEditingUser({...editingUser, shopDetails: {...editingUser.shopDetails, name: e.target.value}});
                                                            } else {
                                                                setEditingUser({...editingUser, supplierDetails: {...editingUser.supplierDetails, businessName: e.target.value}});
                                                            }
                                                        }}
                                                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">GST Number</label>
                                                    <input 
                                                        value={editingUser.role === 'Vendor' ? (editingUser.shopDetails?.gst || '') : (editingUser.supplierDetails?.gst || '')} 
                                                        onChange={(e) => {
                                                            if(editingUser.role === 'Vendor') {
                                                                setEditingUser({...editingUser, shopDetails: {...editingUser.shopDetails, gst: e.target.value}});
                                                            } else {
                                                                setEditingUser({...editingUser, supplierDetails: {...editingUser.supplierDetails, gst: e.target.value}});
                                                            }
                                                        }}
                                                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                                    />
                                                </div>
                                            </>
                                        )}
                                        {editingUser.role === 'Customer' && (
                                            <>
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Customer Type</label>
                                                    <input 
                                                        value={editingUser.customerType === 'retail' ? 'Business (Retail)' : 'Individual'} 
                                                        disabled
                                                        className="w-full p-4 bg-slate-100 border border-slate-200 text-slate-500 rounded-2xl text-xs font-bold outline-none cursor-not-allowed" 
                                                    />
                                                </div>
                                                {editingUser.customerType === 'individual' && (
                                                    <>
                                                        {(!editingUser.addresses || editingUser.addresses.length === 0) ? (
                                                            <div className="space-y-1.5 md:col-span-2">
                                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Address 01 (Home)</label>
                                                                <input 
                                                                    value={editingUser.address || ''} 
                                                                    onChange={(e) => setEditingUser({...editingUser, address: e.target.value})}
                                                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                                                />
                                                            </div>
                                                        ) : (
                                                            editingUser.addresses.map((addr, idx) => (
                                                                <div key={idx} className="space-y-1.5 md:col-span-2">
                                                                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                                                        Address 0{idx + 1} ({addr.type || 'Home'})
                                                                    </label>
                                                                    <input 
                                                                        value={addr.address || ''} 
                                                                        onChange={(e) => {
                                                                            const updatedAddresses = [...(editingUser.addresses || [])];
                                                                            updatedAddresses[idx] = { ...addr, address: e.target.value };
                                                                            setEditingUser({ ...editingUser, addresses: updatedAddresses });
                                                                        }}
                                                                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                                                    />
                                                                </div>
                                                            ))
                                                        )}
                                                    </>
                                                )}
                                                {editingUser.customerType === 'retail' && (
                                                    <>
                                                        <div className="space-y-1.5">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Business Name</label>
                                                            <input 
                                                                value={editingUser.businessName || ''} 
                                                                onChange={(e) => setEditingUser({...editingUser, businessName: e.target.value})}
                                                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                                                />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">GST Number</label>
                                                            <input 
                                                                value={editingUser.gstNumber || ''} 
                                                                onChange={(e) => setEditingUser({...editingUser, gstNumber: e.target.value.toUpperCase()})}
                                                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                                            />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Business Address</label>
                                                            <input 
                                                                value={editingUser.businessAddress || ''} 
                                                                onChange={(e) => setEditingUser({...editingUser, businessAddress: e.target.value})}
                                                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                                            />
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </section>

                        {/* Services Auditing (ONLY FOR REGISTERED VENDORS) */}
                        {editingUser.role === 'Vendor' && ['Pvt Ltd', 'Franchise'].includes(editingUser.businessType) && (
                            <section className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-xs">02</span>
                                        <h4 className="font-black text-sm uppercase tracking-widest text-slate-900">Service Nodes & Pricing Approval</h4>
                                        <button 
                                            onClick={() => {
                                                console.log('🔄 Manual Sync Triggered');
                                                const fetchVendorCustomServices = async () => {
                                                    if (editingUser && editingUser.role === 'Vendor') {
                                                        try {
                                                            const res = await serviceApi.getAll({ vendorId: editingUser._id });
                                                            setCustomServices(res);
                                                            toast.success('Services synchronized');
                                                        } catch (err) {
                                                            console.error('Fetch error:', err);
                                                        }
                                                    }
                                                };
                                                fetchVendorCustomServices();
                                            }}
                                            className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-slate-900 transition-all active:rotate-180 duration-500"
                                            title="Sync Services"
                                        >
                                            <RotateCw size={12} />
                                        </button>
                                    </div>
                                    <span className="px-3 py-1 bg-slate-100 text-[9px] font-black text-slate-500 rounded-full uppercase tracking-widest">
                                        {(editingUser.shopDetails?.services?.length || 0) + customServices.length} Nodes Found
                                    </span>
                                </div>

                                <div className="bg-slate-50 border border-slate-100 rounded-3xl overflow-hidden">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-200/50 border-b border-slate-200">
                                                <th className="p-5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Type</th>
                                                <th className="p-5 text-[9px] font-black text-slate-500 uppercase tracking-widest">Service Node</th>
                                                <th className="p-5 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Vendor Rate</th>
                                                <th className="p-5 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Current Status</th>
                                                <th className="p-5 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Moderation</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200/50">
                                            {/* 1. Master Services from ShopDetails */}
                                            {editingUser.shopDetails?.services?.map((svc, idx) => (
                                                <tr key={`master-${idx}`} className="hover:bg-white/50 transition-colors">
                                                    <td className="p-5">
                                                        <span className="px-2 py-0.5 bg-slate-900 text-white rounded text-[7px] font-black uppercase tracking-widest">Master</span>
                                                    </td>
                                                    <td className="p-5">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{getServiceName(svc.id)}</span>
                                                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">ID: {svc.id?.slice(-6).toUpperCase()}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-5 text-center text-xs font-black text-slate-900 tabular-nums">₹{svc.vendorRate}</td>
                                                    <td className="p-5 text-center">
                                                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${svc.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : svc.status === 'rejected' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                                                            {svc.status || 'pending'}
                                                        </span>
                                                    </td>
                                                    <td className="p-5 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {svc.status !== 'approved' && (
                                                                <button 
                                                                    onClick={() => handleUpdateServiceStatus(editingUser._id, svc.id, 'approved')}
                                                                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all bg-white border border-slate-200 text-slate-300 hover:text-emerald-500 hover:border-emerald-200 hover:bg-emerald-50"
                                                                >
                                                                    <Check size={14} />
                                                                </button>
                                                            )}
                                                            {svc.status !== 'rejected' && (
                                                                <button 
                                                                    onClick={() => handleUpdateServiceStatus(editingUser._id, svc.id, 'rejected')}
                                                                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all bg-white border border-slate-200 text-slate-300 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50"
                                                                >
                                                                    <Ban size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {/* 2. Custom Services from Collection */}
                                            {customServices.map((svc, idx) => (
                                                <tr key={`custom-${idx}`} className="hover:bg-white/50 transition-colors">
                                                    <td className="p-5">
                                                        <span className="px-2 py-0.5 bg-indigo-500 text-white rounded text-[7px] font-black uppercase tracking-widest">Custom</span>
                                                    </td>
                                                    <td className="p-5">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{svc.name}</span>
                                                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">CATEGORY: {svc.category}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-5 text-center text-xs font-black text-slate-900 tabular-nums">₹{svc.basePrice}</td>
                                                    <td className="p-5 text-center">
                                                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${svc.approvalStatus === 'Approved' ? 'bg-emerald-50 text-emerald-600' : svc.approvalStatus === 'Rejected' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                                                            {svc.approvalStatus || 'Pending'}
                                                        </span>
                                                    </td>
                                                    <td className="p-5 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {svc.approvalStatus !== 'Approved' && (
                                                                <button 
                                                                    onClick={() => handleUpdateServiceStatus(editingUser._id, svc._id, 'approved')}
                                                                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all bg-white border border-slate-200 text-slate-300 hover:text-emerald-500 hover:border-emerald-200 hover:bg-emerald-50"
                                                                >
                                                                    <Check size={14} />
                                                                </button>
                                                            )}
                                                            {svc.approvalStatus !== 'Rejected' && (
                                                                <button 
                                                                    onClick={() => handleUpdateServiceStatus(editingUser._id, svc._id, 'rejected')}
                                                                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all bg-white border border-slate-200 text-slate-300 hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50"
                                                                >
                                                                    <Ban size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {(!editingUser.shopDetails?.services?.length && !customServices.length) && (
                                                <tr>
                                                    <td colSpan={5} className="p-10 text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">No service nodes configured for this vendor</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}

                        {!(editingUser.role === 'Customer' && editingUser.customerType === 'individual') && (
                            <section className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-black text-xs">
                                        {editingUser.role === 'Vendor' && ['Pvt Ltd', 'Franchise'].includes(editingUser.businessType) ? '03' : '02'}
                                    </span>
                                    <h4 className="font-black text-sm uppercase tracking-widest text-slate-900">Settlement & Bank Configuration</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Account Holder</label>
                                        <input 
                                            value={editingUser.bankDetails?.accountHolder || ''} 
                                            onChange={(e) => setEditingUser({...editingUser, bankDetails: {...editingUser.bankDetails, accountHolder: e.target.value}})}
                                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Bank Name</label>
                                        <input 
                                            value={editingUser.bankDetails?.bankName || ''} 
                                            onChange={(e) => setEditingUser({...editingUser, bankDetails: {...editingUser.bankDetails, bankName: e.target.value}})}
                                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Account Number</label>
                                        <input 
                                            value={editingUser.bankDetails?.accountNumber || ''} 
                                            onChange={(e) => setEditingUser({...editingUser, bankDetails: {...editingUser.bankDetails, accountNumber: e.target.value}})}
                                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Bank IFSC Code</label>
                                        <input 
                                            value={editingUser.bankDetails?.ifscCode || ''} 
                                            onChange={(e) => setEditingUser({...editingUser, bankDetails: {...editingUser.bankDetails, ifscCode: e.target.value.toUpperCase()}})}
                                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-slate-900 transition-all" 
                                        />
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>

                    <div className="p-8 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    const nextStatus = editingUser.status === 'rejected' ? 'approved' : 'rejected';
                                    setEditingUser({ ...editingUser, status: nextStatus });
                                    toast.success(nextStatus === 'rejected' ? 'Status set to Blocked' : 'Status set to Active');
                                }}
                                className={`px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] transition-all flex items-center gap-2 shadow-sm ${
                                    editingUser.status === 'rejected'
                                        ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100/80 border border-emerald-200/80'
                                        : 'bg-rose-50 text-rose-600 hover:bg-rose-100/80 border border-rose-200/80'
                                }`}
                            >
                                {editingUser.status === 'rejected' ? <CheckCircle size={14} /> : <Ban size={14} />}
                                {editingUser.status === 'rejected' ? 'Unblock Partner' : 'Block Partner'}
                            </button>
                        </div>
                        <div className="flex gap-4">
                            <button 
                                onClick={() => setEditingUser(null)}
                                className="px-10 py-4 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-white transition-all"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveProfile}
                                disabled={isSaving}
                                className="px-12 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/20 flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isSaving ? <RotateCw size={14} className="animate-spin" /> : <Save size={14} />}
                                {isSaving ? 'Synchronizing...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>



      {/* Custom Rejection Modal */}
      <AnimatePresence>
        {rejectionModal && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={() => setRejectionModal(null)}
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                />
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden"
                >
                    <div className="p-8 bg-rose-600 text-white flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                                <Ban size={24} />
                            </div>
                            <h3 className="text-xl font-black uppercase tracking-tighter">Service Rejection</h3>
                        </div>
                        <button onClick={() => setRejectionModal(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-10 space-y-6">
                        <div className="space-y-2">
                             <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Rejection Reason</label>
                             <textarea 
                                autoFocus
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="PLEASE EXPLAIN WHY THIS SERVICE IS BEING REJECTED..."
                                className="w-full h-32 p-5 bg-slate-50 border border-slate-100 rounded-3xl text-xs font-bold outline-none focus:border-rose-500 transition-all resize-none uppercase tracking-wider"
                             />
                        </div>
                        
                        <div className="flex items-start gap-3 p-4 bg-rose-50 rounded-2xl border border-rose-100">
                             <ShieldAlert size={16} className="text-rose-500 mt-1 shrink-0" />
                             <p className="text-[9px] text-rose-600 font-bold leading-relaxed uppercase tracking-widest">
                                This message will be sent directly to the vendor. Clear communication helps partners resolve issues faster.
                             </p>
                        </div>
                    </div>

                    <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                        <button 
                            onClick={() => setRejectionModal(null)}
                            className="flex-1 py-4 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-white transition-all"
                        >
                            Dismiss
                        </button>
                        <button 
                            onClick={() => handleUpdateServiceStatus(rejectionModal.userId, rejectionModal.serviceId, 'rejected', rejectionReason)}
                            disabled={!rejectionReason.trim()}
                            className="flex-[2] py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-rose-600/20 active:scale-95 transition-all disabled:opacity-50"
                        >
                            Confirm Rejection
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Address Details Modal */}
      <AnimatePresence>
        {selectedAddressForModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => setSelectedAddressForModal(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col overflow-hidden border border-slate-100"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                    <MapPin size={18} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Address Details</span>
                    <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{selectedAddressForModal.type || 'Home'}</span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedAddressForModal(null)} 
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors border border-slate-200 shadow-sm bg-white"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 text-left">
                <div className="space-y-1">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Full Address</span>
                  <span className="text-xs font-bold text-slate-800 block leading-relaxed uppercase">{selectedAddressForModal.address}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">City</span>
                    <span className="text-xs font-bold text-slate-800 block uppercase">{selectedAddressForModal.city || 'N/A'}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">State</span>
                    <span className="text-xs font-bold text-slate-800 block uppercase">
                      {(() => {
                        if (selectedAddressForModal.state) return selectedAddressForModal.state;
                        const addrText = selectedAddressForModal.address || '';
                        const statesList = [
                          'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
                          'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
                          'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
                          'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
                          'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
                          'Delhi', 'Jammu & Kashmir', 'Jammu and Kashmir', 'Ladakh', 'Puducherry'
                        ];
                        const matched = statesList.find(s => addrText.toLowerCase().includes(s.toLowerCase()));
                        return matched || 'N/A';
                      })()}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Pincode</span>
                    <span className="text-xs font-bold text-slate-800 block tracking-wider tabular-nums">{selectedAddressForModal.pincode || 'N/A'}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">Coordinates</span>
                    <span className="text-xs font-bold text-slate-800 block tracking-tight tabular-nums">
                      {selectedAddressForModal.location?.lat ? `${selectedAddressForModal.location.lat.toFixed(4)}, ${selectedAddressForModal.location.lng.toFixed(4)}` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button
                  onClick={() => setSelectedAddressForModal(null)}
                  className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-[9px] uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all shadow-md shadow-slate-900/10"
                >
                  Close Window
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete User - cascade option */}
      <AnimatePresence>
        {deleteModalUser && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setDeleteModalUser(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col overflow-hidden border border-slate-100"
            >
              <div className="p-6 border-b border-slate-100 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={16} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-[0.2em] leading-none mb-2">
                    Delete User
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">
                    {deleteModalUser.displayName || deleteModalUser.ownerName || deleteModalUser.shopDetails?.name || 'Unnamed User'}
                    {' · '}{deleteModalUser.role}{' · '}{deleteModalUser.phone}
                  </p>
                </div>
              </div>

              <div className="p-6 space-y-3">
                <button
                  type="button"
                  onClick={() => setDeleteRelatedData(false)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${!deleteRelatedData ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-900 mb-1">Preserve history</p>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug">
                    Deletes the account but keeps past orders and payments, relabelled as Ex-{deleteModalUser.role}.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteRelatedData(true)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${deleteRelatedData ? 'border-rose-600 bg-rose-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 mb-1">Delete everything</p>
                  <p className="text-[11px] text-slate-500 font-medium leading-snug">
                    Permanently purges the account and all related records. This cannot be undone.
                  </p>
                </button>
              </div>

              <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteModalUser(null)}
                  className="p-1 px-4 h-8 border border-slate-200 text-[9px] font-bold uppercase tracking-widest rounded-sm bg-white hover:bg-slate-100 disabled:opacity-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className={`p-1 px-4 h-8 text-[9px] font-bold uppercase tracking-widest rounded-sm text-white flex items-center gap-2 disabled:opacity-50 transition-all ${deleteRelatedData ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-950'}`}
                >
                  {isDeleting && <Loader2 size={12} className="animate-spin" />}
                  {isDeleting ? 'Deleting' : deleteRelatedData ? 'Purge Everything' : 'Delete User'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


