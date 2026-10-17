export const socketAuth = callback => {
    const path = window.location.pathname;
    const keys = path.startsWith('/admin') ? ['adminToken', 'token']
        : path.startsWith('/vendor') ? ['vendorToken', 'token']
        : path.startsWith('/supplier') ? ['supplierToken', 'token'] : ['token', 'user_auth_token'];
    callback({ token: keys.map(key => localStorage.getItem(key)).find(Boolean) || '' });
};
