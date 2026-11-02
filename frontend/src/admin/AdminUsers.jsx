import { useEffect, useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null)
  const [amount, setAmount] = useState(0)
  const [type, setType] = useState('add')
  const token = localStorage.getItem('adminToken')

  const load = () => {
    fetch(`${API_BASE}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => {})
  }

  useEffect(load, [token])

  const adjust = async () => {
    await fetch(`${API_BASE}/api/admin/users/${modal.id}/adjust-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: Number(amount), type }),
    })
    setModal(null)
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Users</h1>
      <table className="w-full text-sm">
        <thead className="bg-gray-800">
          <tr>
            <th className="p-2 text-left">ID</th>
            <th className="p-2 text-left">Telegram ID</th>
            <th className="p-2 text-left">Name</th>
            <th className="p-2 text-left">Balance</th>
            <th className="p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-gray-700 hover:bg-gray-800">
              <td className="p-2">{u.id}</td>
              <td className="p-2">{u.telegram_id}</td>
              <td className="p-2">{u.first_name}</td>
              <td className="p-2">{u.wallet_balance}</td>
              <td className="p-2">
                <button
                  onClick={() => setModal(u)}
                  className="bg-blue-600 px-2 py-1 rounded text-xs"
                >
                  Adjust
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <div className="bg-gray-800 p-4 rounded w-80 space-y-2">
            <h3 className="font-bold">Adjust Balance: {modal.first_name}</h3>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-gray-700 p-2 rounded"
            >
              <option value="add">Add</option>
              <option value="subtract">Subtract</option>
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-700 p-2 rounded"
            />
            <div className="flex gap-2">
              <button onClick={adjust} className="flex-1 bg-green-600 py-1 rounded">Save</button>
              <button onClick={() => setModal(null)} className="flex-1 bg-gray-600 py-1 rounded">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
