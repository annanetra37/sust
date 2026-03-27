import { useState, useEffect } from 'react';
import api from '../services/api';
import { UserPlus, Trash2, Shield, ToggleLeft, ToggleRight } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [orgUnits, setOrgUnits] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [showPerms, setShowPerms] = useState(null);
  const [invite, setInvite] = useState({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', role: 'CUSTOM' });
  const [perms, setPerms] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([api.getUsers(), api.getOrgUnits()])
      .then(([u, o]) => { setUsers(u); setOrgUnits(o); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      await api.invite(invite);
      setShowInvite(false);
      setInvite({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', role: 'CUSTOM' });
      load();
    } catch (err) {
      alert(err.error || 'Failed');
    }
  };

  const toggleStatus = async (user) => {
    await api.updateUserStatus(user.id, !user.isActive);
    load();
  };

  const deleteUser = async (user) => {
    if (!confirm(`Delete ${user.firstName} ${user.lastName}?`)) return;
    await api.deleteUser(user.id);
    load();
  };

  const openPerms = (user) => {
    setShowPerms(user.id);
    setPerms(orgUnits.map((ou) => {
      const existing = user.permissions?.find((p) => p.orgUnit?.id === ou.id);
      return { orgUnitId: ou.id, name: ou.name, canView: existing?.canView || false, canUpload: existing?.canUpload || false, canDelete: existing?.canDelete || false };
    }));
  };

  const savePerms = async () => {
    await api.updatePermissions(showPerms, perms.filter((p) => p.canView || p.canUpload || p.canDelete));
    setShowPerms(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowInvite(true)}>
          <UserPlus className="w-4 h-4" /> Invite User
        </button>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleInvite} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold">Invite User</h2>
            <div className="grid grid-cols-2 gap-3">
              <input className="input" placeholder="First name *" required value={invite.firstName} onChange={(e) => setInvite({ ...invite, firstName: e.target.value })} />
              <input className="input" placeholder="Last name *" required value={invite.lastName} onChange={(e) => setInvite({ ...invite, lastName: e.target.value })} />
            </div>
            <input type="email" className="input" placeholder="Email *" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            <input className="input" placeholder="Phone" value={invite.phone} onChange={(e) => setInvite({ ...invite, phone: e.target.value })} />
            <input className="input" placeholder="Job title" value={invite.jobTitle} onChange={(e) => setInvite({ ...invite, jobTitle: e.target.value })} />
            <select className="input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              <option value="CUSTOM">Custom</option>
              <option value="ADMIN">Admin</option>
            </select>
            <div className="flex gap-3">
              <button type="button" className="btn-secondary flex-1" onClick={() => setShowInvite(false)}>Cancel</button>
              <button type="submit" className="btn-primary flex-1">Send Invite</button>
            </div>
          </form>
        </div>
      )}

      {/* Permissions Modal */}
      {showPerms && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold">Edit Permissions</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Org Unit</th>
                  <th className="text-center py-2">View</th>
                  <th className="text-center py-2">Upload</th>
                  <th className="text-center py-2">Delete</th>
                </tr>
              </thead>
              <tbody>
                {perms.map((p, i) => (
                  <tr key={p.orgUnitId} className="border-b">
                    <td className="py-2">{p.name}</td>
                    {['canView', 'canUpload', 'canDelete'].map((key) => (
                      <td key={key} className="text-center">
                        <input type="checkbox" checked={p[key]} onChange={(e) => {
                          const next = [...perms];
                          next[i] = { ...next[i], [key]: e.target.checked };
                          setPerms(next);
                        }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setShowPerms(null)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={savePerms}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">User</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Email</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Role</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-gray-400">{u.jobTitle || ''}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button className="text-gray-400 hover:text-brand-600" title="Permissions" onClick={() => openPerms(u)}>
                      <Shield className="w-4 h-4" />
                    </button>
                    <button className="text-gray-400 hover:text-amber-600" title={u.isActive ? 'Deactivate' : 'Activate'} onClick={() => toggleStatus(u)}>
                      {u.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button className="text-gray-400 hover:text-red-600" title="Delete" onClick={() => deleteUser(u)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
