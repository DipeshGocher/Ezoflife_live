import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import VendorHeader from '../components/VendorHeader';
import VendorBottomNav from '../components/VendorBottomNav';
import socket from '../../../lib/socket';
import { orderApi } from '../../../lib/api';
import useNotificationStore from '../../../shared/stores/notificationStore';
import useVendorOrderStore from '../../../shared/stores/vendorOrderStore';

const VendorLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const currentPath = location.pathname;

    const { incomingRequest, setIncomingRequest, clearIncomingRequest } = useVendorOrderStore();
    const [acceptingId, setAcceptingId] = useState(null);
    const [timeLeft, setTimeLeft] = useState(45);
    const { addNotification } = useNotificationStore();

    const vendorData = JSON.parse(localStorage.getItem('vendorData') || localStorage.getItem('user') || '{}');
    const vendorId = vendorData?._id || vendorData?.id || vendorData?.user?._id || vendorData?.user?.id;

    // Timer logic for incoming request
    useEffect(() => {
        let timer;
        if (incomingRequest) {
            setTimeLeft(45);
            timer = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [incomingRequest]);

    // Handle timer expiration in a separate effect to avoid updates during render
    useEffect(() => {
        if (incomingRequest && timeLeft === 0) {
            clearIncomingRequest();
        }
    }, [timeLeft, incomingRequest, clearIncomingRequest]);

    // Socket Logic
    useEffect(() => {
        if (!vendorId) return;

        const handleNewOrder = async (data) => {
            setIncomingRequest({
                _id: data.orderId,
                orderId: data.displayId,
                items: [{ name: 'New Order Request', quantity: 1 }],
            });

            try {
                const fullDetail = await orderApi.getById(data.orderId);
                setIncomingRequest(fullDetail);
                addNotification('order_available', 'New Order Nearby', `Order ${data.displayId} is available.`, 'vendor');
            } catch (err) {
                console.error('Error fetching full order in layout', err);
            }
        };

        const handleNewNotification = (data) => {
            if (data.role === 'vendor' || data.recipient === vendorId) {
                addNotification(
                    data.notification.type || 'info',
                    data.notification.title,
                    data.notification.message,
                    'vendor'
                );
            }
        };

        socket.emit('join_room', 'vendors_pool');
        socket.emit('join_room', `user_${vendorId}`);

        socket.on('new_order_available', handleNewOrder);
        socket.on('new_notification', handleNewNotification);

        return () => {
            socket.off('new_order_available', handleNewOrder);
            socket.off('new_notification', handleNewNotification);
        };
    }, [vendorId, addNotification, setIncomingRequest]);

    const handleAccept = async (orderId) => {
        try {
            setAcceptingId(orderId);
            await orderApi.vendorAcceptOrder(orderId, vendorId);
            clearIncomingRequest();
            navigate(`/vendor/order/${orderId}`);
        } catch (err) {
            await appDialog.alert('Order already taken or error occurred.');
        } finally {
            setAcceptingId(null);
        }
    };

    const hideNavRoutes = ['/vendor/auth', '/vendor/otp', '/vendor/register', '/vendor/upload-documents', '/vendor/approval-pending'];
    const showNav = !hideNavRoutes.includes(currentPath);

    const hideHeaderRoutes = [
        ...hideNavRoutes,
        '/vendor/cart-details',
        '/vendor/order/', // Hide on order details
        '/vendor/fulfillment',
        '/vendor/reviews',
        '/vendor/material-request/track'
    ];
    const showHeader = !hideHeaderRoutes.some(path => currentPath.startsWith(path));

    return (
        <div className="admin-theme flex flex-col min-h-screen">
            {showHeader && <VendorHeader />}
            
            <main className={`flex-1 pb-24 bg-slate-50/50 ${showHeader ? (['/vendor/walk-in', '/vendor/material-request', '/vendor/labor-request', '/vendor/labor-request/create', '/vendor/material-orders'].includes(currentPath) ? 'pt-16' : 'pt-20') : ''}`}>
                <Outlet />
            </main>

            {showNav && <VendorBottomNav />}

            {/* Global Incoming Request Modal - REMOVED TO PREVENT DUPLICATE BASIC UI */}
        </div>
    );
};

export default VendorLayout;
