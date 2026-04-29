"use client";

import React, { useState, useEffect } from 'react';

const UserSelectBox = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState("");

  const baseUrl = "http://localhost:5160";

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        // Menggunakan endpoint data_personal sesuai scripts_match.js
        const response = await fetch(`${baseUrl}/api/face/data_personal`);
        if (response.ok) {
          const data = await response.json();
          // Sortir berdasarkan ID agar urut
          const sortedData = data.sort((a, b) => a.UserID - b.UserID);
          setUsers(sortedData);
        }
      } catch (error) {
        console.error("Gagal mengambil data user:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  return (
    <div className="flex flex-col gap-2 w-full max-w-xs p-4">
      <label className="text-sm font-semibold text-gray-700">
        Pilih Personel ({users.length} terdaftar)
      </label>
      
      <select
        value={selectedUser}
        onChange={(e) => setSelectedUser(e.target.value)}
        disabled={loading}
        className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
      >
        <option value="">-- Pilih Nama --</option>
        {users.map((user) => (
          <option key={user.UserID} value={user.UserID}>
            {user.UserID} - {user.Name}
          </option>
        ))}
      </select>

      {selectedUser && (
        <p className="mt-2 text-xs text-gray-500">
          ID terpilih: <span className="font-mono font-bold">{selectedUser}</span>
        </p>
      )}
    </div>
  );
};

export default UserSelectBox;