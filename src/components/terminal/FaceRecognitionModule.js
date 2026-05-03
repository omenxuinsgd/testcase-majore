"use client";
import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, 
  Activity, 
  Terminal as TerminalIcon,
  Scan,
  Database,
  Loader2,
  User,
  Zap,
  Power,
  Save,
  Search,
  Trash2,
  Eye,
  ShieldCheck,
  UserCheck,
  Video,
  CheckCircle,
  Dna,
  ShieldAlert
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

/**
 * FaceRecognitionModule
 * Modul Pengenalan Wajah dengan sistem pemilihan personel berbasis SelectBox.
 * PERBAIKAN: SelectBox kini hanya muncul di tab Pendaftaran (Enrollment).
 */
const FaceRecognitionModule = ({ activeTab }) => {
  const baseUrl = "http://localhost:5160";
  
  // State dasar sistem
  const [logs, setLogs] = useState([`[SYSTEM] Face Recognition Engine v3.2 Online.`]);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [biometricRecords, setBiometricRecords] = useState([]);
  const [faceAttributes, setFaceAttributes] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [statusMsg, setStatusMsg] = useState("Standby");

  // State untuk data personel
  const [availableUsers, setAvailableUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [userData, setUserData] = useState({ userId: "", name: "" });
  
  // Refs untuk canvas dan polling kamera
  const pollingRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const resultCanvasRef = useRef(null);
  
  const isConnectedRef = useRef(false);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // Inisialisasi: Ambil daftar personel dari database
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoadingUsers(true);
        const response = await fetch(`${baseUrl}/api/face/data_personal`);
        if (response.ok) {
          const data = await response.json();
          const sortedData = data.sort((a, b) => a.UserID - b.UserID);
          setAvailableUsers(sortedData);
          addLog("Database personel berhasil disinkronkan.", "success");
        }
      } catch (error) {
        addLog("Gagal mengambil daftar personel dari server.", "error");
      } finally {
        setIsLoadingUsers(false);
      }
    };

    fetchUsers();
    return () => stopCamera();
  }, []);

  // Sinkronisasi data saat user dipilih
  useEffect(() => {
    if (activeTab === 'face_enrollment' || activeTab === 'face_verification') {
      // Reset hasil matching saat pindah tab agar tidak membingungkan
      setMatchResult(null);
      setFaceAttributes(null);
    }
    
    if (userData.userId) {
      loadBiometricData(userData.userId);
    } else {
      setBiometricRecords([]);
    }
  }, [activeTab, userData.userId]);

  const addLog = (message, type = "info") => {
    const time = new Date().toLocaleTimeString();
    const prefix = type === "error" ? "[ERROR]" : type === "success" ? "[SUCCESS]" : "[INFO]";
    
    setLogs(prev => {
      const newEntry = `${prefix} ${message} (${time})`;
      // Cek apakah pesan terakhir sama persis untuk menghindari duplikasi visual
      if (prev.length > 0 && prev[0] === newEntry) return prev;
      return [newEntry, ...prev].slice(0, 50);
    });
  };

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('scanner:logs-sync', { detail: logs }));
  }, [logs]);

  const handleUserSelection = (e) => {
    const selectedId = e.target.value;
    const user = availableUsers.find(u => u.UserID.toString() === selectedId);
    
    // Reset hasil matching/atribut setiap kali ganti user agar data lama hilang
    setMatchResult(null);
    setFaceAttributes(null);

    if (user) {
      setUserData({ userId: user.UserID, name: user.Name });
      addLog(`Personel terpilih: ${user.Name} (ID: ${user.UserID})`);
    } else {
      setUserData({ userId: "", name: "" });
      setBiometricRecords([]);
    }
  };

  const drawImageToCanvas = (url, canvas) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (!canvas) return resolve();
        const ctx = canvas.getContext("2d");
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () => resolve(null);
      const sep = url.includes("?") ? "&" : "?";
      img.src = url + sep + "t=" + Date.now();
    });
  };

  const loadBiometricData = async (userId) => {
    if (!userId) {
      setBiometricRecords([]);
      return;
    }

    setIsProcessing(true);
    // Bersihkan data lama segera sebelum fetch agar UI tidak "stuck" di data lama
    setBiometricRecords([]);
    
    try {
      const res = await fetch(`${baseUrl}/api/face/facebiometric/${userId}`);
      if (res.ok) {
        const data = await res.json();
        // Filter ketat berdasarkan ID
        const filtered = Array.isArray(data) 
          ? data.filter(item => (item.UserID || item.userId || "").toString() === userId.toString()) 
          : [];
        setBiometricRecords(filtered);
      } else {
        setBiometricRecords([]);
      }
    } catch (err) {
      setBiometricRecords([]);
      console.error("Load failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  const startCamera = () => {
    if (pollingRef.current) return;
    setIsConnected(true);
    setStatusMsg("Active");
    addLog("Memulai sensor optik (Polling Stream aktif)...", "success");

    pollingRef.current = setInterval(async () => {
      const url = `${baseUrl}/api/face/capture`;
      if (cameraCanvasRef.current) {
        const canvas = await drawImageToCanvas(url, cameraCanvasRef.current);
        if (canvas) {
          const frameData = canvas.toDataURL("image/jpeg", 0.6);
          window.dispatchEvent(new CustomEvent('terminal:update-preview', { 
            detail: frameData 
          }));
        }
      }
    }, 100);
  };

  const stopCamera = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsConnected(false);
    setStatusMsg("Standby");
    addLog("Sensor optik dinonaktifkan.", "info");
    window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
  };

  const handleEnrollAction = async () => {
    if (!isConnected || isProcessing) return;
    if (!userData.userId) {
      toast.error("Silakan pilih personel terlebih dahulu!");
      addLog("Pendaftaran dibatalkan: Personel belum dipilih.", "error");
      return;
    }

    const loadingToast = toast.loading(`Mendaftarkan wajah ${userData.name}...`);
    setIsProcessing(true);

    try {
      const ts = Date.now();
      const snapRes = await fetch(`${baseUrl}/api/face/snapshot?ts=${ts}`);
      if (!snapRes.ok) throw new Error("Gagal mengambil snapshot");
      
      const blob = await snapRes.blob();
      const formData = new FormData();
      
      formData.append("frame", blob, `enroll_${ts}.jpg`);
      formData.append("userId", userData.userId);

      const res = await fetch(`${baseUrl}/api/face/enroll`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        toast.success(`Berhasil mendaftarkan biometrik ${userData.name}.`, { id: loadingToast });
        addLog(`Pendaftaran SUKSES untuk UID ${userData.userId}.`, "success");
        await loadBiometricData(userData.userId);
      } else {
        const errorText = await res.text();
        toast.error(`Gagal: ${errorText}`, { id: loadingToast });
      }
    } catch (err) {
      toast.error(`Error: ${err.message}`, { id: loadingToast });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMatchAction = async () => {
    if (!isConnected || isProcessing) return;
    setIsProcessing(true);
    setMatchResult(null);
    setFaceAttributes(null);
    addLog("Memulai identifikasi subjek...", "info");

    try {
      const ts = Date.now();
      const snapRes = await fetch(`${baseUrl}/api/face/snapshot?ts=${ts}`);
      const blob = await snapRes.blob();

      const formData = new FormData();
      formData.append("frame", blob, "capture.png");
      formData.append("frame1", blob, "capture.png");

      const matchRes = await fetch(`${baseUrl}/api/face/Face_match`, {
        method: "POST",
        body: formData
      });

      if (!matchRes.ok) {
        addLog("Identifikasi gagal: Subjek tidak dikenal.", "error");
        setIsProcessing(false);
        return;
      }

      const matchData = await matchRes.json();
      
      // Tracking & Attributes analysis
      const trackRes = await fetch(`${baseUrl}/api/face/tracking`, { method: "POST", body: formData });
      if (trackRes.ok) {
        const processedBlob = await trackRes.blob();
        const imgUrl = URL.createObjectURL(processedBlob);
        if (resultCanvasRef.current) {
          const ctx = resultCanvasRef.current.getContext("2d");
          const img = new Image();
          img.onload = () => {
            resultCanvasRef.current.width = img.width;
            resultCanvasRef.current.height = img.height;
            ctx.drawImage(img, 0, 0);
          };
          img.src = imgUrl;
        }
        window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: imgUrl }));
      }

      const attrRes = await fetch(`${baseUrl}/api/face/attributes`, { method: "POST", body: formData });
      if (attrRes.ok) {
        const attrJson = await attrRes.json();
        if (attrJson.FaceCount > 0) setFaceAttributes(attrJson.Faces[0]);
      }

      setMatchResult({
        userId: matchData.UserID,
        name: matchData.Name,
        address: matchData.Address,
        status: "AUTHORIZED",
        timestamp: new Date().toLocaleString()
      });

      addLog(`Subjek teridentifikasi: ${matchData.Name}.`, "success");
    } catch (err) {
      addLog("Kesalahan proses matching.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (uid) => {
    if (!confirm("Hapus rekaman biometrik wajah ini?")) return;
    try {
      const res = await fetch(`${baseUrl}/api/face/del_face/${uid}`, { method: "DELETE" });
      if (res.ok) {
        addLog("Data biometrik dihapus.", "success");
        loadBiometricData(userData.userId);
      }
    } catch (err) {
      addLog("Gagal menghapus data.", "error");
    }
  };

  return (
    <div className="w-full h-full p-4 flex flex-col gap-4 overflow-hidden bg-black/40 font-mono text-left">
      <Toaster />

      {/* SELECTBOX: Sekarang hanya muncul di tab Pendaftaran (face_enrollment) */}
      {activeTab === 'face_enrollment' && (
        <div className="bg-zinc-900/80 p-4 border-2 border-[#00ffff]/30 rounded-sm flex flex-col gap-2 shrink-0 shadow-lg animate-in fade-in slide-in-from-top-4">
          <label className="text-[16px] font-black text-white uppercase tracking-widest flex items-center gap-2">
            <User size={18} /> PILIH TARGET PENDAFTARAN
          </label>
          <select
            value={userData.userId}
            onChange={handleUserSelection}
            disabled={isLoadingUsers || isProcessing}
            className="w-full bg-black border border-[#00ffff]/20 p-2 text-[#00ffff] text-[16px] outline-none focus:border-[#00ffff] transition-colors cursor-pointer"
          >
            <option value="">-- PILIH PERSONEL ({availableUsers.length} TERDAFTAR) --</option>
            {availableUsers.map((user) => (
              <option key={user.UserID} value={user.UserID}>
                ID: {user.UserID} | {user.Name}
              </option>
            ))}
          </select>
          {userData.userId && (
            <div className="text-[8px] text-emerald-400 font-bold tracking-widest uppercase animate-pulse">
              Sesi Aktif: {userData.name} (UID_{userData.userId})
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden">
        
        {/* SISI KANAN: Kontrol & Monitoring */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          
          {/* Header Controls */}
          <div className="flex items-center justify-between bg-zinc-900/60 p-3 border border-[#00ffff]/10 rounded-sm shrink-0">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className={`text-[16px] font-black uppercase tracking-widest ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                {isConnected ? 'KAMERA_AKTIF' : 'KAMERA_OFFLINE'}
              </span>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={isConnected ? stopCamera : startCamera} 
                className={`px-4 py-1.5 border-2 text-[16px] font-black uppercase rounded-sm transition-all flex items-center gap-2 ${isConnected ? 'border-red-500 text-red-500 hover:bg-red-500 hover:text-white' : 'border-[#00ffff] text-[#00ffff] hover:bg-[#00ffff] hover:text-black'}`}
              >
                <Power size={18} /> {isConnected ? 'Stop Sensor' : 'Start Sensor'}
              </button>

              {activeTab === 'face_verification' ? (
                <button 
                  onClick={handleMatchAction} 
                  disabled={!isConnected || isProcessing} 
                  className="px-4 py-1.5 border-2 border-[#00ffff] text-[#00ffff] text-[16px] font-black uppercase rounded-sm hover:bg-[#00ffff] hover:text-black disabled:opacity-30 transition-all flex items-center gap-2"
                >
                  <CheckCircle size={18} /> Matching
                </button>
              ) : (
                <button 
                  onClick={handleEnrollAction} 
                  disabled={!isConnected || isProcessing || !userData.userId} 
                  className="px-4 py-1.5 border-2 border-emerald-500 text-emerald-400 text-[16px] font-black uppercase rounded-sm hover:bg-emerald-500 hover:text-white disabled:opacity-30 transition-all flex items-center gap-2"
                >
                  <Save size={18} /> Enroll Wajah
                </button>
              )}
            </div>
          </div>

          {/* Area Utama Tab */}
          <div className="flex-1 border-2 border-[#00ffff]/20 bg-zinc-950/60 rounded-sm overflow-hidden flex flex-col relative">
            <div className="bg-[#00ffff]/10 px-4 py-2 border-b border-[#00ffff]/20 flex justify-between items-center shrink-0">
               <span className="text-[18px] font-black text-[#00ffff] uppercase tracking-widest">
                 {activeTab === 'face_enrollment' ? 'BIOMETRIC_DATA_VAULT' : 'VERIFICATION_TERMINAL'}
               </span>
               {/* <div className="px-2 py-0.5 bg-black/40 border border-[#00ffff]/20 text-[8px] text-[#00ffff] font-black">
                 SISTEM: {statusMsg.toUpperCase()}
               </div> */}
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
              {activeTab === 'face_enrollment' ? (
                isProcessing ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 opacity-50">
                    <Loader2 size={32} className="text-[#00ffff] animate-spin" />
                    <span className="text-[10px] uppercase tracking-widest text-[#00ffff]">Menarik Data...</span>
                  </div>
                ) : biometricRecords.length > 0 ? (
                  <table className="w-full text-[10px] border-collapse">
                    <thead className="bg-black/60 sticky top-0 text-[#00ffff] uppercase font-bold border-b border-[#00ffff]/10">
                      <tr>
                        <th className="p-3 text-left">UID</th>
                        <th className="p-3 text-left">Citra Biometrik</th>
                        <th className="p-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-300">
                      {biometricRecords.map((record, idx) => (
                        <tr key={idx} className="border-b border-[#00ffff]/5 hover:bg-[#00ffff]/5 transition-colors">
                          <td className="p-3 font-mono font-bold text-white">{record.UserID}</td>
                          <td className="p-3">
                            <div className="w-12 h-12 bg-black border border-white/10 rounded-sm overflow-hidden group">
                               <img 
                                 src={`data:image/jpeg;base64,${record.Image}`} 
                                 className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" 
                                 alt="face" 
                               />
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <button onClick={() => handleDelete(record.UserID)} className="p-2 text-red-500 hover:bg-red-500 hover:text-white rounded-sm border border-red-500/20 transition-all">
                               <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-100 italic gap-4 py-20">
                    <Database size={72} strokeWidth={1} className="opacity-20" />
                    <span className="text-[16px] uppercase tracking-[0.4em]">
                      {userData.userId ? `DATA KOSONG UNTUK ${userData.name}` : 'SILAKAN PILIH PERSONEL'}
                    </span>
                  </div>
                )
              ) : (
                <div className="p-6 h-full flex flex-col gap-6">
                   {matchResult ? (
                     <div className="p-6 border-2 border-emerald-500/40 bg-emerald-500/5 rounded-sm animate-in fade-in slide-in-from-left duration-500 flex flex-col gap-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <UserCheck size={80} className="text-emerald-400" />
                        </div>
                        <div className="grid grid-cols-2 gap-12 relative z-10">
                           <div className="flex flex-col gap-1">
                              <span className="text-[8px] text-zinc-500 uppercase font-black">Subject_Identity</span>
                              <span className="text-2xl font-black text-white truncate drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">{matchResult.name}</span>
                           </div>
                           <div className="flex flex-col gap-1">
                              <span className="text-[8px] text-zinc-500 uppercase font-black">Authorization</span>
                              <div className="flex items-center gap-2 text-emerald-400">
                                <ShieldCheck size={16} className="animate-pulse" />
                                <span className="text-xl font-black uppercase tracking-tighter">{matchResult.status}</span>
                              </div>
                           </div>
                           <div className="flex flex-col gap-1">
                              <span className="text-[8px] text-zinc-500 uppercase font-black">Subject_UID</span>
                              <span className="text-[12px] font-bold text-[#00ffff] bg-[#00ffff]/10 px-3 py-1 w-fit border border-[#00ffff]/20 rounded-sm font-mono">{matchResult.userId}</span>
                           </div>
                        </div>
                     </div>
                   ) : (
                     <div className="h-full flex flex-col items-center justify-center text-zinc-700 italic opacity-20 gap-4 py-20">
                        <Scan size={64} strokeWidth={1} />
                        <span className="text-[11px] uppercase tracking-[0.5em]">Awaiting_Sensor_Trigger</span>
                     </div>
                   )}

                   {faceAttributes && (
                     <div className="p-5 border-2 border-[#00ffff]/30 bg-black/40 rounded-sm flex flex-col gap-4 animate-in fade-in duration-700">
                        <div className="flex items-center gap-2 text-[#00ffff] border-b border-[#00ffff]/10 pb-2">
                           <Dna size={14} />
                           <span className="text-[10px] font-black uppercase tracking-[0.2em]">Live_Attributes_Analysis</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
                           <div className="flex flex-col p-2 bg-zinc-900/60 border border-white/5 rounded-sm">
                              <span className="text-[7px] text-zinc-500 uppercase font-black">Mask</span>
                              <span className={`text-[11px] font-black uppercase mt-1 ${faceAttributes.Mask === 'No Mask' ? 'text-emerald-400' : 'text-yellow-400'}`}>{faceAttributes.Mask}</span>
                           </div>
                           <div className="flex flex-col p-2 bg-zinc-900/60 border border-white/5 rounded-sm">
                              <span className="text-[7px] text-zinc-500 uppercase font-black">Gender</span>
                              <span className="text-[11px] font-black uppercase text-white mt-1">{faceAttributes.Gender}</span>
                           </div>
                           <div className="flex flex-col p-2 bg-zinc-900/60 border border-white/5 rounded-sm">
                              <span className="text-[7px] text-zinc-500 uppercase font-black">Age</span>
                              <span className="text-[14px] font-black text-[#00ffff] mt-1">{faceAttributes.Age} <span className="text-[8px] font-normal text-zinc-500">Yrs</span></span>
                           </div>
                           <div className="flex flex-col p-2 bg-zinc-900/60 border border-white/5 rounded-sm">
                              <span className="text-[7px] text-zinc-500 uppercase font-black">Spoof</span>
                              <span className={`text-[11px] font-black uppercase mt-1 ${faceAttributes.Spoof === 'Real' ? 'text-emerald-400' : 'text-rose-500'}`}>{faceAttributes.Spoof}</span>
                           </div>
                        </div>
                     </div>
                   )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SISI KIRI: Tracking Feed */}
        <div className="w-full lg:w-[480px] flex flex-col gap-4 shrink-0">
           <div className="flex-1 border-2 border-[#00ffff]/40 bg-zinc-950 rounded-sm overflow-hidden flex flex-col relative shadow-[0_0_30px_rgba(0,255,255,0.1)]">
              <div className="p-3 bg-zinc-900/80 border-b border-[#00ffff]/20 flex items-center justify-between">
                 <div className="flex items-center gap-2 text-[#00ffff] font-black uppercase text-[16px]">
                    <Zap size={18} fill="#00ffff" /> 
                    <span>Live_Tracking_Feed</span>
                 </div>
                 <Activity size={18} className="text-[#00ffff] animate-pulse" />
              </div>
              
              <div className="flex-1 relative bg-black flex items-center justify-center">
                 <canvas ref={cameraCanvasRef} className="hidden" />
                 <canvas ref={resultCanvasRef} className="w-full h-full object-contain" />
                 {isProcessing && (
                   <div className="absolute inset-x-0 h-[2px] bg-[#00ffff] shadow-[0_0_15px_#00ffff] animate-pixel-scan z-20" />
                 )}
                 {!isConnected && (
                   <div className="pr-100 flex flex-col items-center gap-3 opacity-10 text-white">
                     <Video size={120} strokeWidth={1} />
                     <span className="text-[16px] font-black uppercase tracking-[0.5em]">SIGNAL_LOST</span>
                   </div>
                 )}
              </div>
           </div>

           {/* Console Log Panel */}
           {/* <div className="h-40 border-2 border-[#00ffff]/20 bg-black/40 rounded-sm overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-[#00ffff]/10 bg-black/60 flex items-center gap-2">
                 <TerminalIcon size={12} className="text-[#00ffff]" />
                 <span className="text-[9px] font-black text-white uppercase tracking-widest">Face_Console_Log</span>
              </div>
              <div className="flex-1 p-3 overflow-y-auto custom-scrollbar font-mono text-[9px] space-y-1">
                 {logs.map((log, i) => (
                    <div key={i} className={`flex gap-2 ${log.includes('[ERROR]') ? 'text-red-400' : log.includes('[SUCCESS]') ? 'text-emerald-400' : 'text-zinc-500'}`}>
                       <span className="opacity-30">&gt;</span>
                       <span>{log}</span>
                    </div>
                 ))}
              </div>
           </div> */}
        </div>
      </div>

      <style jsx>{`
        @keyframes pixel-scan { 0% { top: 0; } 100% { top: 100%; } }
        .animate-pixel-scan { position: absolute; height: 2px; width: 100%; animation: pixel-scan 2.5s linear infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0, 255, 255, 0.2); }
      `}</style>
    </div>
  );
};

export default FaceRecognitionModule;