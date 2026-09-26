'use strict';

const PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'pos', label: 'POS / New Sale' },
  { key: 'orders', label: 'Orders' },
  { key: 'tables', label: 'Tables' },
  { key: 'products', label: 'Products' },
  { key: 'categories', label: 'Categories' },
  { key: 'customers', label: 'Customers' },
  { key: 'tokens', label: 'Tokens' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'reports', label: 'Reports' },
  { key: 'users', label: 'Users' },
  { key: 'settings', label: 'Settings' },
  { key: 'backup', label: 'Backup & Restore' },
  { key: 'discount', label: 'Give discounts' },
  { key: 'refund', label: 'Cancel / refund orders' },
];

const ROLES = {
  admin: { label: 'Admin', permissions: PERMISSIONS.map((p) => p.key) },
  manager: {
    label: 'Manager',
    permissions: ['dashboard', 'pos', 'orders', 'tables', 'products', 'categories', 'customers', 'tokens', 'inventory', 'reports', 'discount', 'refund'],
  },
  cashier: { label: 'Cashier', permissions: ['pos', 'orders', 'tables', 'customers', 'tokens', 'discount'] },
  kitchen: { label: 'Kitchen', permissions: ['tokens', 'orders'] },
  delivery: { label: 'Delivery', permissions: ['orders', 'customers'] },
};

function effectivePermissions(user) {
  if (!user) return [];
  if (user.role === 'admin') return ROLES.admin.permissions;
  let custom = [];
  try {
    custom = Array.isArray(user.permissions) ? user.permissions : JSON.parse(user.permissions || '[]');
  } catch {
    custom = [];
  }
  if (custom.length) return custom.filter((k) => PERMISSIONS.some((p) => p.key === k));
  return (ROLES[user.role] || ROLES.cashier).permissions;
}

function can(user, perm) {
  if (!perm) return !!user;
  return effectivePermissions(user).includes(perm);
}

module.exports = { PERMISSIONS, ROLES, effectivePermissions, can };
