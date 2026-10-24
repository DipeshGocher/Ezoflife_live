import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    ShoppingBag,
    Users,
    Store,
    Truck,
    Monitor,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ShieldCheck,
    UserCircle,
    CreditCard,
    FileText,
    Package,
    Tags,
    Star,
    HelpCircle,
    Home,
    Bike,
    ShieldAlert,
    Layers,
    MessageSquare,
    Handshake,
    Bell,
    Briefcase,
    ClipboardList,
    Factory,
    Rocket,
    MapPin,
    Share2,
    Search,
    X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { adminApi } from '../../../../lib/api';

const navItems = [
    {
        group: 'Operations', items: [
            { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
            { 
                icon: Users, 
                label: 'User Management', 
                path: '/admin/users',
                subItems: [
                    { 
                        label: 'Customer Management', 
                        path: '/admin/users?role=Customer',
                        subItems: [
                            { label: 'Individual Customers', path: '/admin/users?role=Customer&type=individual' },
                            { label: 'Business Customers', path: '/admin/users?role=Customer&type=retail' }
                        ]
                    },
                    { 
                        label: 'Vendor Management', 
                        path: '/admin/users?role=Vendor',
                        subItems: [
                            { label: 'Registered Vendors', path: '/admin/users?role=Vendor&vendorType=registered' },
                            { label: 'Unregistered Vendors', path: '/admin/users?role=Vendor&vendorType=unregistered' }
                        ]
                    },
                    { label: 'Supplier Management', path: '/admin/users?role=Supplier' }
                ]
            },
            { icon: UserCircle, label: 'User Role', path: '/admin/users/roles' },
            { 
                icon: ShieldCheck, 
                label: 'Registration Approval', 
                path: '/admin/vendors/approvals',
                subItems: [
                    { label: 'Vendor Registration Request', path: '/admin/vendors/approvals' },
                    { label: 'Supplier Registration Request', path: '/admin/supplier-requests' },
                ]
            },
            { icon: ClipboardList, label: 'Vendor Service Request', path: '/admin/vendor-service-requests' },
            { icon: ClipboardList, label: 'Supplier Product Request', path: '/admin/supplier-product-requests' },
            { 
                icon: ShoppingBag, 
                label: 'Orders', 
                path: '/admin/orders',
                subItems: [
                    { label: 'Active Orders', path: '/admin/orders?tab=Active' },
                    { label: 'Completed Orders', path: '/admin/orders?tab=Completed' }
                ]
            },

            { 
                icon: Layers, 
                label: 'Services & Pricing', 
                path: '/admin/services',
                subItems: [
                    { label: 'Category Management', path: '/admin/categories' },
                    { label: 'Geofence Management', path: '/admin/geofencing' },
                    { label: 'Master Services', path: '/admin/master-services' },
                    { label: 'Service Geofence', path: '/admin/geofence-table' },
                    { label: 'Master Pricing Table', path: '/admin/master-pricing' },
                ]
            },
            { 
                icon: Factory, 
                label: 'Vendor Supply Pricing', 
                path: '/admin/vendor-supply-pricing/categories',
                subItems: [
                    { label: 'Category Management', path: '/admin/vendor-supply-pricing/categories' },
                    { label: 'Product Table', path: '/admin/vendor-supply-pricing/products' },
                    { label: 'Supplier Service Zone', path: '/admin/vendor-supply-pricing/zones' },
                    { label: 'Master Supplies Table', path: '/admin/vendor-supply-pricing/supplies' }
                ]
            },


            { 
                icon: MessageSquare, 
                label: 'Support Tickets', 
                path: '/admin/help-desk',
                subItems: [
                    { label: 'Customer Issues', path: '/admin/help-desk?activeTab=Customer' },
                    { label: 'Vendor Issues', path: '/admin/help-desk?activeTab=Vendor' },
                    { label: 'Supplier Issue', path: '/admin/help-desk?activeTab=Supplier' },
                    { label: 'Missing Item Dispute', path: '/admin/dispute-center' },
                ]
            },

            { 
                icon: Bell, 
                label: 'Notifications', 
                path: '/admin/notifications',
                subItems: [
                    { label: 'Offers', path: '/admin/notifications?type=offers' },
                    { label: 'Maintenance alert', path: '/admin/notifications?type=maintenance' },
                    { label: 'Payment reminder', path: '/admin/notifications?type=payment' },
                ]
            },
            { icon: HelpCircle, label: 'FAQ Manager', path: '/admin/faqs' },
            { icon: ShieldAlert, label: 'Privacy Policy', path: '/admin/privacy-policy' },
            { icon: FileText, label: 'Terms & Conditions', path: '/admin/terms-conditions' },
            { icon: Rocket, label: 'Splash Ads', path: '/admin/ads' },
            { icon: MessageSquare, label: 'Advertise', path: '/admin/advertise' },
            { icon: Share2, label: 'Referral Settings', path: '/admin/referral-settings' },
            { 
                icon: Tags, 
                label: 'Promotions', 
                path: '/admin/promotions',
                subItems: [
                    { label: 'Vendor Promotion', path: '/admin/promotions' },
                    { label: 'Create Promotion', path: '/admin/create-promotion' },
                    { label: 'Promotion Table', path: '/admin/promotion-table' },
                    { label: 'Geofence Promotion', path: '/admin/geofence-promotion' }
                ]
            },
            { icon: Handshake, label: 'Partnerships', path: '/admin/partnerships' },
            { icon: Star, label: 'Customer Feedback', path: '/admin/feedback' },
        ]
    },
    {
        group: 'Network', items: [
            { 
                icon: Briefcase, 
                label: 'Career Center', 
                path: '/admin/careers/admin-posts',
                subItems: [
                    { label: 'Admin Posts', path: '/admin/careers/admin-posts' },
                    { label: 'Vendor Posts', path: '/admin/careers/vendor-posts' },
                    { label: 'Supplier Posts', path: '/admin/careers/supplier-posts' },
                    { label: 'Role Details', path: '/admin/careers/role-details' },
                ]
            },
        ]
    },

    {
        group: 'Settings', items: [
            { icon: Settings, label: 'Settings', path: '/admin/settings' },
            { icon: FileText, label: 'Invoice Design', path: '/admin/invoice-settings' },
            { icon: ShieldCheck, label: 'Audit History', path: '/admin/audit-history' },
        ]
    }
];

export default function Sidebar({ isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [expandedMenu, setExpandedMenu] = useState(null);
    const [expandedSubMenus, setExpandedSubMenus] = useState({});
    const [adminPermissions, setAdminPermissions] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sidebarCounts, setSidebarCounts] = useState({});

    useEffect(() => {
        try {
            const adminDataStr = localStorage.getItem('adminData');
            if (adminDataStr) {
                const adminData = JSON.parse(adminDataStr);
                if (adminData && (adminData.email === 'admin@ezoflife.com' || !adminData.adminRole)) {
                    setAdminPermissions(null);
                } else if (adminData && adminData.adminPermissions) {
                    setAdminPermissions(adminData.adminPermissions);
                }
            }
        } catch (e) {
            console.error('Error loading admin permissions:', e);
        }
    }, []);

    // Fetch pending count badges for admin attention
    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const res = await adminApi.getSidebarCounts();
                if (res && typeof res === 'object') {
                    setSidebarCounts(res);
                }
            } catch (e) {
                console.error('Error fetching sidebar counts:', e);
            }
        };
        fetchCounts();
        const interval = setInterval(fetchCounts, 15000);
        return () => clearInterval(interval);
    }, []);

    const getBadgeCount = (label) => {
        switch (label) {
            case 'Registration Approval':
                return sidebarCounts.registrationTotal || 0;
            case 'Vendor Registration Request':
                return sidebarCounts.vendorRegistrations || 0;
            case 'Supplier Registration Request':
                return sidebarCounts.supplierRegistrations || 0;
            case 'Vendor Service Request':
                return sidebarCounts.vendorServices || 0;
            case 'Supplier Product Request':
                return sidebarCounts.supplierProducts || 0;
            case 'Support Tickets':
                return sidebarCounts.supportTickets || 0;
            case 'Missing Item Dispute':
                return sidebarCounts.disputes || 0;
            default:
                return 0;
        }
    };

    // Filter navItems based on admin permissions
    const filteredNavItems = useMemo(() => {
        return navItems.map(group => {
            const filteredItems = group.items.filter(item => {
                if (!adminPermissions) return true;
                return adminPermissions.some(perm => 
                    perm.trim().toLowerCase() === ({ 'Audit History': 'Settings' }[item.label] || item.label).trim().toLowerCase()
                );
            });
            return { ...group, items: filteredItems };
        }).filter(group => group.items.length > 0);
    }, [adminPermissions]);

    // Filter navItems based on sidebar search input
    const searchFilteredNavItems = useMemo(() => {
        if (!searchTerm.trim()) return filteredNavItems;

        const query = searchTerm.trim().toLowerCase();
        return filteredNavItems.map(group => {
            const matchingItems = group.items.filter(item => {
                const itemMatches = item.label.toLowerCase().includes(query);
                const subItemMatches = item.subItems && item.subItems.some(sub => {
                    const subMatches = sub.label.toLowerCase().includes(query);
                    const nestedMatches = sub.subItems && sub.subItems.some(n => n.label.toLowerCase().includes(query));
                    return subMatches || nestedMatches;
                });
                return itemMatches || subItemMatches;
            });
            return { ...group, items: matchingItems };
        }).filter(group => group.items.length > 0);
    }, [filteredNavItems, searchTerm]);

    useEffect(() => {
        if (searchTerm.trim()) {
            const firstWithSub = searchFilteredNavItems.flatMap(g => g.items).find(i => i.subItems && i.subItems.length > 0);
            if (firstWithSub) {
                setExpandedMenu(firstWithSub.label);
            }
        }
    }, [searchTerm, searchFilteredNavItems]);

    useEffect(() => {
        // Auto-expand menu item if a sub-item is active
        const currentPath = location.pathname;
        const matchingItem = filteredNavItems.flatMap(g => g.items).find(item => 
            item.subItems && item.subItems.some(sub => {
                const subPathOnly = sub.path.split('?')[0];
                return currentPath === subPathOnly;
            })
        );
        if (matchingItem && !searchTerm.trim()) {
            setExpandedMenu(matchingItem.label);
        }
        
        const fullPath = location.pathname + location.search;
        if (fullPath.includes('role=Customer')) {
            setExpandedSubMenus(prev => ({ ...prev, 'Customer Management': true }));
        }
        if (fullPath.includes('role=Vendor')) {
            setExpandedSubMenus(prev => ({ ...prev, 'Vendor Management': true }));
        }
    }, [location.pathname, location.search, filteredNavItems, searchTerm]);

    return (
        <>
            {/* Mobile Overlay */}
            <AnimatePresence>
                {isMobileOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsMobileOpen(false)}
                        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[55] lg:hidden"
                    />
                )}
            </AnimatePresence>

            <aside 
                className={`fixed left-0 top-0 h-full bg-white border-r border-slate-200 z-[60] flex flex-col transition-all duration-300 
                    ${isCollapsed ? "w-20" : "w-64"} 
                    ${isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                `}
            >
                {/* Header / Brand */}
                <div className="h-14 flex items-center justify-between px-6 border-b border-slate-100 shrink-0">
                    {!isCollapsed ? (
                        <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 bg-slate-900 rounded-sm flex items-center justify-center">
                                <span className="text-white font-bold text-sm">E</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-bold text-[13px] tracking-tight text-slate-900 leading-none uppercase">SPINZYT</span>
                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">Admin Panel</span>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full flex justify-center">
                            <div className="w-7 h-7 bg-slate-900 rounded-sm flex items-center justify-center">
                                <span className="text-white font-bold text-sm">E</span>
                            </div>
                        </div>
                    )}

                    {/* Mobile Close Button */}
                    <button 
                        onClick={() => setIsMobileOpen(false)}
                        className="lg:hidden w-8 h-8 flex items-center justify-center rounded-sm hover:bg-slate-50 text-slate-400"
                    >
                        <ChevronLeft size={18} />
                    </button>
                </div>

                {/* Sidebar Search Bar */}
                {(!isCollapsed || isMobileOpen) && (
                    <div className="px-3 pt-3 pb-2 border-b border-slate-100 bg-slate-50/50 shrink-0">
                        <div className="relative flex items-center">
                            <Search size={13} className="absolute left-2.5 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search menu section..."
                                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-sm text-[10px] font-bold text-slate-800 focus:border-slate-900 transition-all outline-none"
                            />
                            {searchTerm && (
                                <button 
                                    type="button" 
                                    onClick={() => setSearchTerm('')} 
                                    className="absolute right-2 text-slate-400 hover:text-slate-900 p-0.5"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Navigation Selection Engine */}
                <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto no-scrollbar">
                    {searchFilteredNavItems.map((group) => (
                        <div key={group.group} className="space-y-1.5">
                            {(!isCollapsed || isMobileOpen) && (
                                <div className="px-3 mb-1">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] leading-none">
                                        {group.group}
                                    </span>
                                </div>
                            )}
                            {group.items.map((item) => {
                                const isActive = location.pathname === item.path || (item.subItems && item.subItems.some(sub => location.pathname === sub.path.split('?')[0]));
                                const isExpanded = expandedMenu === item.label;
                                const hasSubItems = item.subItems && item.subItems.length > 0;
                                const badgeCount = getBadgeCount(item.label);

                                return (
                                    <div key={item.label}>
                                        <button
                                            onClick={() => {
                                                if (hasSubItems) {
                                                    setExpandedMenu(isExpanded ? null : item.label);
                                                } else {
                                                    navigate(item.path);
                                                    setIsMobileOpen(false);
                                                }
                                            }}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-sm transition-all duration-200 group relative ${
                                                isActive 
                                                  ? "bg-slate-900 text-white shadow-slate-200" 
                                                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                            }`}
                                        >
                                            <div className="relative shrink-0 flex items-center">
                                                <item.icon size={16} className={`${isActive ? "text-white" : "group-hover:text-slate-900 transition-colors"}`} />
                                                {(isCollapsed && !isMobileOpen) && badgeCount > 0 && (
                                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white animate-pulse" />
                                                )}
                                            </div>
                                            {(!isCollapsed || isMobileOpen) && (
                                                <>
                                                    <span className={`font-bold text-[10px] uppercase tracking-[0.05em] flex-1 text-left whitespace-nowrap overflow-hidden transition-all ${
                                                        isActive ? "opacity-100" : "opacity-80 group-hover:opacity-100"
                                                    }`}>
                                                        {item.label}
                                                    </span>
                                                    
                                                    {/* Numerical Badge for Attention */}
                                                    {badgeCount > 0 && (
                                                        <span className={`px-1.5 py-0.5 rounded-full text-[8.5px] font-black leading-none shrink-0 ${
                                                            isActive ? "bg-rose-500 text-white" : "bg-rose-500 text-white shadow-sm"
                                                        }`}>
                                                            {badgeCount}
                                                        </span>
                                                    )}

                                                    {hasSubItems && (
                                                        <ChevronDown 
                                                            size={12} 
                                                            className={`transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} 
                                                        />
                                                    )}
                                                </>
                                            )}
                                        </button>

                                        {/* Sub Items Rendering */}
                                        <AnimatePresence>
                                            {hasSubItems && isExpanded && (!isCollapsed || isMobileOpen) && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden bg-slate-50/50 rounded-sm mt-1 ml-4 border-l border-slate-200"
                                                >
                                                    {item.subItems.map((sub) => {
                                                        const hasNestedItems = sub.subItems && sub.subItems.length > 0;
                                                        const isSubActive = location.pathname + location.search === sub.path || (hasNestedItems && sub.subItems.some(nested => location.pathname + location.search === nested.path));
                                                        const subBadgeCount = getBadgeCount(sub.label);
                                                        
                                                        if (hasNestedItems) {
                                                            const isSubMenuExpanded = !!expandedSubMenus[sub.label];
                                                            return (
                                                                <div key={sub.label} className="flex flex-col">
                                                                    <button
                                                                        onClick={() => {
                                                                            setExpandedSubMenus(prev => ({
                                                                                ...prev,
                                                                                [sub.label]: !prev[sub.label]
                                                                            }));
                                                                        }}
                                                                        className={`w-full flex items-center justify-between px-4 py-2 text-[9px] font-bold uppercase tracking-wider transition-all ${
                                                                            isSubActive ? "text-slate-900 bg-slate-100/30" : "text-slate-400 hover:text-slate-900 hover:bg-slate-100/10"
                                                                        }`}
                                                                    >
                                                                        <span>{sub.label}</span>
                                                                        <ChevronDown 
                                                                            size={10} 
                                                                            className={`transition-transform duration-300 ${isSubMenuExpanded ? "rotate-180" : ""}`} 
                                                                        />
                                                                    </button>
                                                                    <AnimatePresence>
                                                                        {isSubMenuExpanded && (
                                                                            <motion.div
                                                                                initial={{ height: 0, opacity: 0 }}
                                                                                animate={{ height: "auto", opacity: 1 }}
                                                                                exit={{ height: 0, opacity: 0 }}
                                                                                className="overflow-hidden bg-slate-100/30 rounded-sm mt-0.5 ml-3 border-l border-slate-300"
                                                                            >
                                                                                {sub.subItems.map((nested) => {
                                                                                    const isNestedActive = location.pathname + location.search === nested.path;
                                                                                    return (
                                                                                        <button
                                                                                            key={nested.label}
                                                                                            onClick={() => {
                                                                                                navigate(nested.path);
                                                                                                setIsMobileOpen(false);
                                                                                            }}
                                                                                            className={`w-full text-left px-4 py-1.5 text-[8.5px] font-bold uppercase tracking-wider transition-all ${
                                                                                                isNestedActive ? "text-slate-900 bg-slate-200/50" : "text-slate-400 hover:text-slate-900 hover:bg-slate-200/20"
                                                                                            }`}
                                                                                        >
                                                                                            {nested.label}
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <button
                                                                key={sub.label}
                                                                onClick={() => {
                                                                    navigate(sub.path);
                                                                    setIsMobileOpen(false);
                                                                }}
                                                                className={`w-full flex items-center justify-between text-left px-4 py-2 text-[9px] font-bold uppercase tracking-wider transition-all ${
                                                                    isSubActive ? "text-slate-900 bg-slate-100/50" : "text-slate-400 hover:text-slate-900 hover:bg-slate-100/30"
                                                                }`}
                                                            >
                                                                <span>{sub.label}</span>
                                                                {subBadgeCount > 0 && (
                                                                    <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black leading-none bg-rose-500 text-white shrink-0 ml-2">
                                                                        {subBadgeCount}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </nav>

                {/* Tactical Footer */}
                <div className="p-3 border-t border-slate-100 bg-slate-50/50 shrink-0">
                    <button
                        onClick={() => {
                            localStorage.clear();
                            navigate('/user/auth');
                            setIsMobileOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-slate-400 hover:bg-red-50 hover:text-red-600 transition-all group ${(isCollapsed && !isMobileOpen) && "justify-center"}`}
                    >
                        <LogOut size={16} />
                        {(!isCollapsed || isMobileOpen) && <span className="font-bold text-[10px] uppercase tracking-[0.2em]">Logout</span>}
                    </button>
                </div>

                {/* Collapse Trigger (Floating) - Desktop Only */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute -right-3 top-20 w-6 h-6 bg-slate-900 text-white rounded-full hidden lg:flex items-center justify-center border-2 border-white z-50 hover:scale-110 transition-all"
                >
                    {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </aside>
        </>
    );
}
