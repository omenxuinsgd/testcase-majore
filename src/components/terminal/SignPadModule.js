"use client";
import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Wifi, 
  RefreshCw, 
  ShieldCheck,
  User,
  MapPin,
  IdCard,
  Send,
  Database,
  Trash2,
  FileText,
  Loader2,
  Search,
  Lock,
  Unlock
} from 'lucide-react';

/**
 * SignPadModule (API INTEGRATED)
 * FIX: Sinkronisasi data tabel dengan SelectBox dan pembersihan state yang teliti.
 */
const SignPadModule = ({ data }) => {
  const [logs, setLogs] = useState([`[SYSTEM] Registration Hub v1.4.5 Online.`]);
  const [isDataSaved, setIsDataSaved] = useState(false);
  const [isApiLoading, setIsApiLoading] = useState(false);
  const [regData, setRegData] = useState({ userId: "", fullName: "", address: "" });
  
  // State untuk data personel
  const [availableUsers, setAvailableUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // Placeholder Signature (SVG Base64)
  const placeholderSign = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSIzMCI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjMwIiBmaWxsPSIjMzMzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZpbGw9IiM2NjYiIGZvbnQtc2l6ZT0iOCIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZHk9Ii4zZW0iIHRleHQtYW5jaG9yPSJtaWRkbGUiPk5PX0lNRzwvdGV4dD48L3N2Zz4=";

  const [userList, setUserList] = useState([]);

  const API_BASE = "http://localhost:5160"; 

  // --- 1. LOAD DAFTAR PERSONEL (INITIAL) ---
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoadingUsers(true);
        const response = await fetch(`${API_BASE}/api/face/data_personal`);
        if (response.ok) {
          const data = await response.json();
          setAvailableUsers(data.sort((a, b) => a.UserID - b.UserID));
          addLog("Database personel disinkronkan.", "success");
        }
      } catch (error) {
        addLog("Gagal mengambil daftar personel.", "error");
      } finally {
        setIsLoadingUsers(false);
      }
    };
    fetchUsers();
  }, []);

  // --- 2. SINKRONISASI TABEL SAAT USER DIPILIH ---
  useEffect(() => {
    if (regData.userId) {
      loadBiometricData(regData.userId);
    } else {
      setUserList([]);
    }
  }, [regData.userId]);

  const loadBiometricData = async (userId) => {
    if (!userId) return;
    setIsApiLoading(true);
    // Bersihkan data lama segera agar UI tidak "stuck"
    setUserList([]); 
    
    try {
      // Menggunakan endpoint biometric sign (asumsi pola yang sama dengan palm/face)
      const res = await fetch(`${API_BASE}/api/palm/signbiometric/${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const formatted = data.map(item => ({
            id: item.UserID || item.userId,
            name: item.Name || item.name,
            address: item.Address || item.address || "-",
            image: `data:image/png;base64,${item.Image || item.image}`,
            date: item.Timestamp || item.timestamp || new Date().toLocaleString()
          }));
          setUserList(formatted);
          addLog(`Sinkronisasi: ${formatted.length} rekaman ditemukan.`, "success");
        }
      }
    } catch (err) {
      console.error("Load failed:", err);
    } finally {
      setIsApiLoading(false);
    }
  };

  // --- 3. EVENT LISTENER UNTUK CAPTURE DARI SIDEBAR ---
  useEffect(() => {
    const handleCaptureComplete = async (event) => {
        const signatureBase64 = event.detail;
        if (!signatureBase64 || !regData.userId) return;

        setIsApiLoading(true);
        addLog("Memproses pendaftaran tanda tangan...", "info");

        try {
            const resBlob = await fetch(signatureBase64);
            const blob = await resBlob.blob();

            const formData = new FormData();
            formData.append("image", blob, "signature.png");
            formData.append("userId", regData.userId);

            const res = await fetch(`${API_BASE}/api/palm/enroll_sign`, {
                method: "POST",
                body: formData
            });

            if (res.ok) {
                addLog(`Tanda tangan ${regData.fullName} berhasil disimpan!`, "success");
                // Refresh data dari server alih-alih reset manual yang menghapus semua
                await loadBiometricData(regData.userId);
                setIsDataSaved(false);
                window.dispatchEvent(new CustomEvent('signpad:data-reset')); 
            } else {
                addLog(`Gagal menyimpan: ${res.status}`, "error");
            }
        } catch (err) {
            addLog(`Error: ${err.message}`, "error");
        } finally {
            setIsApiLoading(false);
        }
    };

    window.addEventListener('signpad:capture-complete', handleCaptureComplete);
    return () => window.removeEventListener('signpad:capture-complete', handleCaptureComplete);
  }, [regData]); 

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('scanner:logs-sync', { detail: logs }));
  }, [logs]);
  

  const addLog = (msg, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '[ERROR]' : type === 'success' ? '[SUCCESS]' : '[INFO]';
    setLogs(p => [`${prefix} ${msg} (${timestamp})`, ...p].slice(0, 100));
  };

  const handleUserSelection = (e) => {
    const selectedId = e.target.value;
    const user = availableUsers.find(u => u.UserID.toString() === selectedId);
    
    // Reset status pendaftaran saat ganti user
    setIsDataSaved(false);
    window.dispatchEvent(new CustomEvent('signpad:data-reset'));

    if (user) {
      setRegData({
        userId: user.UserID.toString(),
        fullName: user.Name,
        address: user.Address || ""
      });
      addLog(`Personel aktif: ${user.Name}`, "info");
    } else {
      setRegData({ userId: "", fullName: "", address: "" });
      setUserList([]);
    }
  };

  const handleRegister = async () => {
    if (!regData.userId || !regData.fullName) {
      addLog("Gagal: Pilih personel terlebih dahulu!", "error");
      return;
    }
    setIsDataSaved(true);
    window.dispatchEvent(new CustomEvent('signpad:data-ready'));
    addLog("Data dikunci. Sila tandatangan di bar sisi.", "success");
  };

  const handleResetAll = () => {
    setRegData({ userId: "", fullName: "", address: "" });
    setIsDataSaved(false);
    setUserList([]);
    window.dispatchEvent(new CustomEvent('signpad:data-reset')); 
    addLog("Sesi direset.", "info");
  };

  const handleDeleteUser = async (id) => {
    if (!confirm("Padam data tandatangan ini?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/palm/del_sign/${id}`, { method: "DELETE" });
      if (res.ok) {
        addLog(`Rekaman [${id}] dipadam.`, "success");
        loadBiometricData(regData.userId);
      }
    } catch (err) {
      addLog("Gagal memadam data.", "error");
    }
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-5 overflow-y-auto custom-scrollbar text-left font-mono">
      <div className="flex flex-col lg:flex-row gap-8 items-start shrink-0">
        <div className="flex-1 border-2 border-[#00ffff]/40 bg-zinc-900/60 p-5 relative rounded-sm flex flex-col shadow-2xl min-h-[160px]">
          <div className="absolute -top-[12px] left-6 bg-white text-black px-4 py-0.5 text-[18px] font-black uppercase z-[50]">Registrasi Data User</div>
          
          <div className="flex flex-col gap-4 py-4">
            <div className="space-y-1">
              <label className="text-[16px] text-white uppercase font-black tracking-widest flex items-center gap-2 ml-1">
                <IdCard size={14} /> Pilih Personel Target
              </label>
              
              <select
                value={regData.userId}
                onChange={handleUserSelection}
                disabled={isDataSaved || isApiLoading || isLoadingUsers}
                className="w-full bg-black border-2 border-[#00ffff]/50 focus:border-[#00ffff] p-3 text-[#00ffff] text-[14px] outline-none rounded-sm transition-all cursor-pointer font-black"
              >
                <option value="">-- PILIH PERSONEL ({availableUsers.length} TERDAFTAR) --</option>
                {availableUsers.map((user) => (
                  <option key={user.UserID} value={user.UserID}>
                    ID: {user.UserID} | {user.Name}
                  </option>
                ))}
              </select>
            </div>

            {regData.userId && (
              <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="p-3 bg-[#00ffff]/5 border border-[#00ffff]/10 rounded-sm">
                  <span className="text-[8px] text-zinc-500 uppercase font-black block mb-1 tracking-widest">Nama Lengkap</span>
                  <span className="text-[12px] text-white font-bold uppercase truncate block">{regData.fullName}</span>
                </div>
                <div className="p-3 bg-[#00ffff]/5 border border-[#00ffff]/10 rounded-sm">
                  <span className="text-[8px] text-zinc-500 uppercase font-black block mb-1 tracking-widest">Alamat</span>
                  <span className="text-[12px] text-zinc-400 italic truncate block">{regData.address || "N/A"}</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-auto pt-3 flex gap-4">
             <button 
                onClick={handleRegister} 
                disabled={!regData.userId || isDataSaved || isApiLoading} 
                className={`flex-1 py-2 font-black text-[16px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,255,255,0.2)] ${regData.userId && !isDataSaved && !isApiLoading ? 'bg-[#00ffff] text-black hover:brightness-110 active:scale-95' : 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed'}`}
             >
                {isApiLoading ? <Loader2 size={14} className="animate-spin" /> : isDataSaved ? <Lock size={14} /> : <Send size={14} />} 
                {isDataSaved ? "WAITING_SIGNATURE" : "Simpan Data"}
             </button>
             <button disabled={isApiLoading} onClick={handleResetAll} className="px-6 py-2 border border-red-500/40 text-red-500 text-[16px] font-black uppercase hover:bg-red-500/10 transition-all active:scale-95">Reset</button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-[300px] mb-2 overflow-hidden font-mono">
        <div className="md:flex-[2.5] border-2 border-[#00ffff]/40 bg-zinc-950 flex flex-col rounded-sm relative overflow-hidden shadow-2xl">
            <div className="flex items-center gap-3 text-[#00ffff] py-2 px-4 uppercase font-black border-b border-[#00ffff]/40 bg-zinc-900/80 shrink-0">
                <Database size={12} />
                <span>Personal Biometric Data</span>
                {isApiLoading && <Loader2 size={12} className="animate-spin ml-2" />}
            </div>
            
            <div className="flex-1 overflow-x-auto custom-scrollbar p-2 bg-black/40">
                 <table className="w-full text-left font-mono text-[14px] border-collapse">
                    <thead>
                        <tr className="text-white border-b border-[#00ffff]/50">
                            <th className="py-2 px-3 uppercase font-black tracking-widest">UserID</th>
                            <th className="py-2 px-3 uppercase font-black tracking-widest">Name</th>
                            <th className="py-2 px-3 uppercase font-black tracking-widest">Address</th>
                            <th className="py-2 px-3 uppercase font-black tracking-widest text-center">Image</th>
                            <th className="py-2 px-3 uppercase font-black tracking-widest">Date</th>
                            <th className="py-2 px-3 uppercase font-black tracking-widest text-right">Option</th>
                        </tr>
                    </thead>
                    <tbody className="text-white">
                        {userList.map((user, idx) => (
                            <tr key={idx} className="border-b border-[#00ffff]/5 hover:bg-[#00ffff]/5 transition-colors group">
                                <td className="py-3 px-3 text-[#00ffff] font-black">{user.id}</td>
                                <td className="py-3 px-3 uppercase font-bold">{user.name}</td>
                                <td className="py-3 px-3 text-zinc-400 max-w-[150px] truncate italic">{user.address}</td>
                                <td className="py-1 px-3">
                                    <div className="flex justify-center">
                                        <div className="p-0.5 border border-white/10 bg-white/5 rounded-sm overflow-hidden">
                                            <img 
                                              src={user.image} 
                                              alt="Signature" 
                                              className="h-10 w-auto min-w-[60px] object-contain bg-white/80 grayscale group-hover:grayscale-0 transition-all" 
                                              onError={(e) => { 
                                                if (e.target.src !== placeholderSign) {
                                                  e.target.src = placeholderSign; 
                                                }
                                              }}
                                            />
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 px-3 text-zinc-500 whitespace-nowrap">{user.date}</td>
                                <td className="py-3 px-3 text-right">
                                    <button onClick={() => handleDeleteUser(user.id)} className="text-rose-500 hover:text-red-400 font-black flex items-center justify-end gap-1 ml-auto">
                                        <Trash2 size={10} /> Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                 </table>
                 {!isApiLoading && userList.length === 0 && (
                   <div className="py-12 text-center text-white uppercase tracking-[0.5em] italic opacity-40">--- No Records Found ---</div>
                 )}
                 {isApiLoading && userList.length === 0 && (
                   <div className="py-12 text-center text-[#00ffff]/40 uppercase tracking-[0.2em] animate-pulse">Menarik Data Brankas...</div>
                 )}
            </div>

            <div className="px-4 py-1.5 bg-zinc-900/40 border-t border-[#00ffff]/10 flex justify-between items-center shrink-0">
               <span className="text-[12px] text-zinc-500 uppercase font-bold flex items-center gap-1"><ShieldCheck size={8}/> Authentication_Active</span>
               {/* <span className="text-[7px] text-[#00ffff]/40 font-black uppercase tracking-widest">Vault_v1.4.5</span> */}
            </div>
        </div>
      </div>
    </div>
  );
};

export default SignPadModule;