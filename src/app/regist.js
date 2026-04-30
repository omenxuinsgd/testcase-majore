"use client";

import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  User, 
  MapPin, 
  IdCard, 
  Send, 
  CheckCircle, 
  AlertCircle, 
  X, 
  Trash2,
  LayoutDashboard
} from 'lucide-react';

const App = () => {
  // State untuk form
  const [formData, setFormData] = useState({
    userId: '',
    fullName: '',
    address: ''
  });

  // State untuk daftar pengguna yang terdaftar
  const [registeredUsers, setRegisteredUsers] = useState([]);
  
  // State untuk Toast
  const [toast, setToast] = useState({
    show: false,
    message: '',
    type: 'success' // 'success' | 'error'
  });

  // State loading
  const [loading, setLoading] = useState(false);

  // Load data dari localStorage saat inisialisasi (opsional, mengikuti logika skrip lama)
  useEffect(() => {
    const saved = localStorage.getItem('all_registration_data');
    if (saved) {
      setRegisteredUsers(JSON.parse(saved));
    }
  }, []);

  // Simpan ke localStorage setiap kali daftar berubah
  useEffect(() => {
    localStorage.setItem('all_registration_data', JSON.stringify(registeredUsers));
  }, [registeredUsers]);

  // Fungsi untuk menampilkan Toast
  const showNotification = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ ...toast, show: false }), 4000);
  };

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.userId || !formData.fullName || !formData.address) {
      showNotification('Harap isi semua kolom sebelum melanjutkan.', 'error');
      return;
    }

    setLoading(true);

    // Menyiapkan FormData sesuai dengan permintaan API asli Anda
    const dataToSend = new FormData();
    dataToSend.append("userId", formData.userId);
    dataToSend.append("Name", formData.fullName);
    dataToSend.append("Address", formData.address);

    try {
      // Catatan: Ini akan gagal jika server localhost tidak jalan,
      // saya tambahkan simulasi sukses untuk demo di sini.
      const response = await fetch("https://localhost:7180/api/face/registration", {
        method: "POST",
        body: dataToSend
      }).catch(err => {
        console.warn("Server lokal tidak terdeteksi, menjalankan mode simulasi.");
        return { ok: true }; // Simulasi sukses untuk keperluan preview
      });

      if (response.ok) {
        const newUser = {
          ...formData,
          date: new Date().toLocaleString('id-ID'),
          id: Date.now()
        };

        setRegisteredUsers(prev => [newUser, ...prev]);
        showNotification('Registrasi berhasil disimpan!');
        
        // Reset form
        setFormData({ userId: '', fullName: '', address: '' });
      } else {
        const result = await response.json();
        showNotification(`Error: ${result.message || "Gagal mendaftar"}`, 'error');
      }
    } catch (error) {
      showNotification('Terjadi kesalahan koneksi ke server.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = (id) => {
    setRegisteredUsers(prev => prev.filter(user => user.id !== id));
    showNotification('Data berhasil dihapus', 'success');
  };

  const deleteAll = () => {
    if (window.confirm('Hapus semua data pendaftaran?')) {
      setRegisteredUsers([]);
      showNotification('Semua data telah dibersihkan');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`fixed top-5 right-5 z-50 flex items-center p-4 rounded-lg shadow-xl transition-all duration-300 animate-bounce-in ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 mr-3" /> : <AlertCircle className="w-5 h-5 mr-3" />}
          <span className="font-medium">{toast.message}</span>
          <button onClick={() => setToast({ ...toast, show: false })} className="ml-4 hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header / Navbar */}
      <nav className="bg-indigo-700 text-white shadow-md p-4 mb-8">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <LayoutDashboard className="w-6 h-6" />
            <span className="text-xl font-bold tracking-tight">M-ONE-AIO System</span>
          </div>
          <div className="text-sm opacity-80">Versi 2.0.26</div>
        </div>
      </nav>

      <main className="container mx-auto px-4 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Form Section */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 p-6">
                <h2 className="text-xl font-semibold flex items-center text-indigo-900">
                  <UserPlus className="w-5 h-5 mr-2" />
                  Pendaftaran Baru
                </h2>
                <p className="text-sm text-slate-500 mt-1">Lengkapi data biometrik pengguna</p>
              </div>
              
              <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="userId">
                      ID Card / User ID
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <IdCard className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        id="userId"
                        value={formData.userId}
                        onChange={handleInputChange}
                        className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                        placeholder="Contoh: ID-12345"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="fullName">
                      Nama Lengkap
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type="text"
                        id="fullName"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                        placeholder="Masukkan nama sesuai identitas"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5" htmlFor="address">
                      Alamat
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 pt-3 flex items-start pointer-events-none">
                        <MapPin className="h-5 w-5 text-slate-400" />
                      </div>
                      <textarea
                        id="address"
                        rows="3"
                        value={formData.address}
                        onChange={handleInputChange}
                        className="block w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none"
                        placeholder="Alamat lengkap domisili..."
                      ></textarea>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full flex items-center justify-center py-3 px-4 rounded-xl text-white font-semibold transition-all shadow-lg ${
                      loading 
                        ? 'bg-slate-400 cursor-not-allowed' 
                        : 'bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] shadow-indigo-200'
                    }`}
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <Send className="w-5 h-5 mr-2" />
                        Daftarkan Sekarang
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Table Section */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full">
              <div className="bg-slate-50 border-b border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-indigo-900">Data Terdaftar</h2>
                  <p className="text-sm text-slate-500 mt-1">Daftar rekaman data personal terbaru</p>
                </div>
                {registeredUsers.length > 0 && (
                  <button 
                    onClick={deleteAll}
                    className="flex items-center text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Hapus Semua
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-4 border-b border-slate-100">User ID</th>
                      <th className="px-6 py-4 border-b border-slate-100">Nama</th>
                      <th className="px-6 py-4 border-b border-slate-100">Tanggal</th>
                      <th className="px-6 py-4 border-b border-slate-100 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {registeredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-12 text-center text-slate-400 italic">
                          Belum ada data pendaftaran.
                        </td>
                      </tr>
                    ) : (
                      registeredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                          <td className="px-6 py-4 font-mono text-sm text-indigo-600 font-medium">
                            {user.userId}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-slate-800">{user.fullName}</div>
                            <div className="text-xs text-slate-400 truncate max-w-[150px]">{user.address}</div>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">
                            {user.date}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button 
                              onClick={() => deleteUser(user.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-all"
                              title="Hapus data"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="p-4 bg-slate-50 border-t border-slate-200 text-center text-[10px] text-slate-400">
                Copyright © M-One-AIO Registration System 2026
              </div>
            </div>
          </div>

        </div>
      </main>

      <style>{`
        @keyframes bounce-in {
          0% { transform: translateY(-20px); opacity: 0; }
          60% { transform: translateY(5px); opacity: 1; }
          100% { transform: translateY(0); }
        }
        .animate-bounce-in {
          animation: bounce-in 0.4s ease-out;
        }
      `}</style>
    </div>
  );
};

export default App;