"use client";
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Square, 
  Wifi, 
  WifiOff, 
  Maximize2,
  Link as LinkIcon,
  Key,
  Database,
  RefreshCw,
  Activity,
  FileText,
  Camera,
  Loader2, X,
  Settings, CameraIcon,
  Layers, FolderOpen, Search, ShieldCheck
} from 'lucide-react';

/**
 * DocumentScannerModule
 * Terintegrasi dengan CZUR SDK via WebSockets.
 * Diperbarui: Mengembalikan logika toggle tombol tunggal yang stabil & sinkron dengan SDK.
 */
const DocumentScannerModule = ({ data }) => {
  const [logs, setLogs] = useState([`[SYSTEM] Document Engine v3.0 Online.`]);
  const [connStatus, setConnStatus] = useState({ cmd: false, mc: false });
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLicenseActive, setIsLicenseActive] = useState(false);
  
  // State navigasi panel bawah
  const [activeBottomTab, setActiveBottomTab] = useState('storage');

  // Di dalam komponen DocumentScannerModule
  const SDK_LICENSE = process.env.NEXT_PUBLIC_DOCUMENT_LICENSE || ""; // Pastikan sudah ada di .env
  const autoConnectStarted = useRef(false);
  const isAutoInitializing = useRef(false);
  // const [connections, setConnections] = useState({ cmd: false, main: false });
  
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
    
  const [formData, setFormData] = useState({
    license: "", 
    grabImage: "d:\\scan_result.jpg",
    scanWide: 1, 
    a4WideOn: false,
    dpi: 300,
    jpgQuality: 80,
    colorMode: 0,
    pdfImage: "d:\\scan_result.jpg",
    pdfFile: "d:\\output_document.pdf"
  });

  const wsCmd = useRef(null);
  const wsMc = useRef(null);

  // --- SINKRONISASI LOG KE SIDEBAR ---
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('scanner:logs-sync', { detail: logs }));
  }, [logs]);

  const showToast = (message, type = "success") => {
    const cleanMsg = message ? message.replace(/\0/g, '').trim() : "Sistem Sibuk";
    setToast({ show: true, message: cleanMsg, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 5000);
  };

  const addLog = (msg, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === "error" ? "[ERROR]" : type === "success" ? "[SUCCESS]" : "[INFO]";
    setLogs(prev => [`${prefix} ${msg} (${timestamp})`, ...prev].slice(0, 50));
  };

// Perbaikan pada DocumentScannerModule.js[cite: 22, 25]
 useEffect(() => {
  if (!autoConnectStarted.current) {
    autoConnectStarted.current = true;
    checkApiStatus();
  }

  return () => {
    if (wsCmd.current) wsCmd.current.close();
    if (wsMc.current) wsMc.current.close();
    window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
  };
}, []);

const checkApiStatus = async () => {
  // Guard: Jangan jalankan jika sudah terhubung
  if (wsCmd.current?.readyState === WebSocket.OPEN && wsMc.current?.readyState === WebSocket.OPEN) {
    return;
  }

  showToast("Memeriksa status SDK...", "success");
  addLog("Memeriksa status endpoint API Document SDK...", "info");
  const ports = { cmd: 25014, mc: 9999 };

  // --- DIAGNOSA ENV DIMULAI ---
  if (!SDK_LICENSE || SDK_LICENSE === "") {
    addLog("DEBUG ENV: NEXT_PUBLIC_DOCUMENT_LICENSE TIDAK TERBACA/KOSONG!", "error");
  } else {
    // Log ini akan menampilkan 4 karakter pertama lisensi untuk keamanan
    const maskedLicense = SDK_LICENSE.substring(0, 4) + "****";
    addLog(`DEBUG ENV: Lisensi Terbaca (${maskedLicense})`, "success");
  }

  Object.entries(ports).forEach(([type, port]) => {
    const url = `ws://127.0.0.1:${port}/`;
    const testWs = new WebSocket(url);

    testWs.onopen = () => {
      setConnStatus(prev => {
        const newConns = { ...prev, [type]: true };
        
        // AUTO-INIT LOGIC: Kirim lisensi Document setelah CMD & MC aktif
        if (newConns.cmd && newConns.mc && !isAutoInitializing.current) {
          isAutoInitializing.current = true;
          addLog("Server CMD & Media Aktif. Memulai Auto-Init Lisensi...", "info");
          
          // Gunakan SDK_LICENSE Document yang spesifik
          const initCmd = JSON.stringify({ id: 1, license: SDK_LICENSE });
          
          // Kirim langsung ke testWs jika ini adalah channel CMD, 
          // atau ke ref jika sudah terisi
          if (type === 'cmd') {
            testWs.send(initCmd);
          } else if (wsCmd.current && wsCmd.current.readyState === WebSocket.OPEN) {
            wsCmd.current.send(initCmd);
          }
        }
        return newConns;
      });

      showToast(`Server ${type.toUpperCase()} Terhubung`, "success");

      addLog(`Status API ${type.toUpperCase()}: Terhubung otomatis.`, "success");

      if (type === 'cmd') {
        // PERBAIKAN: Gunakan handleCmdMessage atau handleSDKResponse yang konsisten
        testWs.onmessage = (e) => {
          try {
            const res = JSON.parse(e.data);
            handleCmdMessage(res); // Arahkan ke handler utama Document
          } catch (err) { console.error("Parse error", err); }
        };
        wsCmd.current = testWs;
      } else {
        testWs.onmessage = (e) => {
          const imageUrl = 'data:image/jpeg;base64,' + e.data;
          window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: imageUrl }));
        };
        wsMc.current = testWs;
      }
    };

    testWs.onerror = () => {
      addLog(`Status API ${type.toUpperCase()}: TIDAK AKTIF.`, "error");
    };
  });
};


  // --- WEBSOCKET HANDLERS ---
  const connectSvc = (type) => {
    const ports = { cmd: 25014, mc: 9999 };
    const url = `ws://127.0.0.1:${ports[type]}/`;

    try {
      console.log(`[WS] Menghubungkan ke ${type}...`);
      addLog(`[WS] Menghubungkan ke ${type}...`);
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        setConnStatus(prev => ({ ...prev, [type]: true }));
        addLog(`Terhubung ke Server ${type.toUpperCase()}`, "success");
        if (type === 'cmd') {
            ws.onmessage = (e) => {
                try {
                    const res = JSON.parse(e.data);
                    handleSDKResponse(res);
                } catch (err) { console.error("Parse error", err); }
            };
        }
        if (type === 'mc') {
            ws.onmessage = (e) => {
                const imageUrl = 'data:image/jpeg;base64,' + e.data;
                window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: imageUrl }));
            };
        }
      };

      ws.onclose = () => {
        setConnStatus(prev => ({ ...prev, [type]: false }));
        addLog(`Koneksi ${type.toUpperCase()} terputus`, "error");
        if (type === 'mc') window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
        if (type === 'cmd') {
            setIsCameraOpen(false);
            setIsLicenseActive(false);
        }
      };

      if (type === 'cmd') wsCmd.current = ws;
      if (type === 'mc') wsMc.current = ws;

    } catch (e) {
      addLog(`Koneksi Gagal: ${e.message}`, "error");
    }
  };

  // const handleSDKResponse = (jsonObj) => {
  //   console.log("%c[SDK RESPONSE]", "color: #00ff00; font-weight: bold;", jsonObj);

  //   switch(jsonObj.id) {
  //     // case 2: // INITIALIZE RESPONSE
  //     //   if (jsonObj.error === 0 || jsonObj.error === 9) {
  //     //       addLog("Initialize CZURPlugin successfully", "success");
  //     //       setIsLicenseActive(true);
  //     //   } else {
  //     //       addLog(`Initialize Failed: Code ${jsonObj.error}`, "error");
  //     //       setIsLicenseActive(false);
  //     //   }
  //     //   break;

  //     case 2: // INITIALIZE RESPONSE[cite: 48]
  //       if (jsonObj.error === 0 || jsonObj.error === 9) {
  //           addLog("AUTO-INIT BERHASIL: SDK Document siap digunakan.", "success");
  //           setIsLicenseActive(true);
  //       } else {
  //           addLog(`AUTO-INIT GAGAL: Kode Error ${jsonObj.error}`, "error");
  //           setIsLicenseActive(false);
  //           isAutoInitializing.current = false;
  //       }
  //       break;
  //     case 10: // OPEN CAMERA CONFIRMATION
  //       setIsCameraOpen(true);
  //       addLog("Kamera Utama Diaktifkan", "success");
  //       break;
  //     case 11: // CLOSE CAMERA CONFIRMATION
  //     case 12: // Alternate Close Confirmation
  //       setIsCameraOpen(false);
  //       addLog("Kamera Berhasil Ditutup", "info");
  //       window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
  //       break;
  //     case 14: 
  //       if (jsonObj.error === 0) addLog("Perintah Ambil Gambar Diterima SDK", "success");
  //       break;
  //     case 301: 
  //       if (jsonObj.error === 0) addLog(`Proses Selesai - File: ${jsonObj.file1}`, "success");
  //       else addLog(`SDK Error: ${jsonObj.error}`, "error");
  //       break;
  //     default:
  //       if (jsonObj.error !== undefined && jsonObj.error !== 0) {
  //           addLog(`Notify (ID ${jsonObj.id}): Kode ${jsonObj.error}`, "info");
  //       }
  //   }
  // };

  const handleCmdMessage = (data) => {
    switch (data.id) {
      case 130: setSdkVersion(data.version || "Error"); break;
      case 8:
      case 107: setDeviceId(data.did || "N/A"); break;
      // case 10: addLog("Kamera berhasil diaktifkan."); break;
      // case 12: addLog("Kamera dimatikan."); break;
      
      // Respon Ambil Gambar (ID 14)
      case 14: 
        if (data.error === 0) addLog("Photo Taken. Processing Image, Please Wait");
        else addLog(`Gagal memotret: Error ${data.error}`);
        break;

      // Respon Penyimpanan Gambar (ID 301)
      case 301: 
        if (data.error === 0 && data.file1 !== "null") {
          addLog(`Image Saved, File Name is: ${data.file1}`);
        }
        break;

      // Hasil Barcode Dikenali (ID 326)
      case 326: 
        if (data.error === 0) {
          const typeStr = getBarcodeTypeString(data.type);
          setScanResult({ data: data.text, type: typeStr });
          addLog(`Barcode Recognized, Type: ${typeStr}, Content: ${data.text}`);
        }
        break;

      // case 2: addLog(data.error === 0 ? "Inisialisasi Plugin Berhasil" : `Gagal Inisialisasi: Error ${data.error}`); break;
      case 2: // Respon Inisialisasi Plugin[cite: 33]
        if (data.error === 0) {
          showToast("SDK Document Siap Digunakan", "success");
          addLog("AUTO-INIT BERHASIL: SDK Barcode siap digunakan.", "success");
          setIsLicenseActive(true); // <--- KUNCI UTAMA: Mengaktifkan tombol Enable Camera
        } else {
          showToast(`Inisialisasi Gagal: Error ${data.error}`, "error");
          addLog(`AUTO-INIT GAGAL: Kode Error ${data.error}`, "error");
          setIsLicenseActive(false);
        }
        break;

      case 10: // Konfirmasi Kamera Terbuka[cite: 33]
        if (data.error === 0 || data.error === 12) {
          showToast("Kamera Utama Diaktifkan", "success");
          addLog("Kamera Utama Diaktifkan", "success");
          setIsCameraOpen(true);
        } else if (data.error === 13) {
          showToast("Perangkat Tidak Terhubung", "info");
          addLog("Scanner is not connected. Please connect the scanner to this computer.", "error"); // Sesuai Source 41
          setIsCameraOpen(false);
        } else {
          addLog(`Gagal mengaktifkan kamera: Error ${data.error}`, "error");
        }
        break;

      case 12: // Callback Status Kamera Tertutup (SDK Event)
        setIsCameraOpen(false); // <--- KUNCI PERBAIKAN: Reset tombol ke "Start Camera"
        showToast("Kamera Berhasil Dimatikan", "info");
        addLog("Kamera Utama Berhasil Dimatikan", "succcess");
        // Bersihkan layar pratinjau
        window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
        break;

      default:
        if (data.error !== undefined && data.error !== 0) {
          addLog(`Kesalahan Server: ${data.error}`);
        }
    }
  };

  const sendCmd = (payload) => {
    if (wsCmd.current?.readyState === WebSocket.OPEN) {
      console.log("%c[SDK REQUEST]", "color: #ffff00;", payload);
      wsCmd.current.send(JSON.stringify(payload));
    } else {
      addLog("Gagal: Server Command Belum Terhubung!", "error");
    }
  };

  // --- SDK ACTIONS ---
  const handleInitSDK = () => {
    addLog(`Mengirim kode lisensi...`, "info");
    sendCmd({ id: 1, license: formData.license });
  };

  const handleDeinitSDK = () => {
    sendCmd({ id: 3 });
    setIsLicenseActive(false);
    setIsCameraOpen(false);
    addLog("SDK De-initialized", "info");
  };

  const openCamera = () => {
    if (!isLicenseActive) return;
    sendCmd({ id: 9, index: 0 });
  };

  const closeCamera = () => {
    if (!isLicenseActive) return;
    sendCmd({ id: 11, index: 0 });
  };

  const handleTakePhoto = () => {
    if (!isCameraOpen) return addLog("Kamera belum aktif!", "error");
    setIsProcessing(true);
    addLog(`Mengambil foto ke: ${formData.grabImage}`, "info");
    sendCmd({
      id: 13, index: 0, file: formData.grabImage,
      dpi: formData.dpi, quality: formData.jpgQuality, color: formData.colorMode,
      round: 0, adjust: 0, bcr: 0, bpd: 0, compress: 1
    });
    setTimeout(() => setIsProcessing(false), 1500);
  };

  const handleGeneratePDF = () => {
    addLog(`Memulai komposisi PDF ke: ${formData.pdfFile}`, "info");
    sendCmd({ id: 50, image: formData.pdfImage, pdf: formData.pdfFile });
  };

  // Tambahkan fungsi ini di dalam komponen DocumentScannerModule
  const handleFileBrowse = (e, field) => {
    const file = e.target.files[0];
    if (file) {
      // Karena browser tidak memberikan path absolut (C:\path\to\file) demi keamanan,
      // kita mengambil namanya. Untuk SDK lokal, pengguna tetap perlu memastikan 
      // drive yang benar, namun ini mempermudah input nama file.
      setFormData(prev => ({
        ...prev,
        [field]: file.name // Atau logika path sesuai kebutuhan SDK Anda
      }));
      addLog(`File terpilih untuk ${field}: ${file.name}`, "success");
    }
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        {/* KOMPONEN TOAST GLOBAL */}
          <AnimatePresence>
            {toast.show && (
              <motion.div 
                initial={{ opacity: 0, x: 50 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: 50 }} 
                className={`fixed top-12 right-12 z-[9999] flex items-center gap-3 px-6 py-3 border-2 shadow-2xl backdrop-blur-md rounded-sm ${
                  toast.type === 'success' 
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' 
                    : 'bg-rose-500/10 border-rose-500 text-rose-400'
                }`}
              >
                <span className="text-[18px] font-black uppercase tracking-widest">{toast.message}</span>
                <button onClick={() => setToast({ ...toast, show: false })} className="hover:text-white transition-colors">
                  <X size={18} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
      
      {/* BARIS ATAS: Status & Kontrol Utama */}
      {/* <div className="flex flex-col lg:flex-row gap-8 items-start shrink-0"> */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-4 shrink-0">

        {/* <div className="w-full lg:w-[190px] flex flex-col items-center gap-2 shrink-0">
          <div className="relative w-full aspect-[1.25/1] border-2 border-[#00ffff]/30 bg-zinc-950 overflow-hidden shadow-2xl rounded-sm">
            <img 
              src="https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExb2N3ZXg5NzV5ZW9hZHJpY2xxMjRid2Q3dGt3aTBuNWwyMWI0cTFwbyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/gUNA7QH4AeLde/giphy.gif" 
              alt="System Status" 
              className={`w-full h-full object-cover transition-all duration-700 ${connStatus.cmd ? 'opacity-100' : 'opacity-40 grayscale brightness-125'}`} 
            />
            <div className="absolute top-2 right-2 z-20 flex flex-col gap-1">
              <div className={`flex items-center gap-1.5 px-2 py-0.5 bg-black/80 border text-[7px] font-black uppercase tracking-widest ${connStatus.cmd ? 'text-emerald-400 border-emerald-500/50' : 'text-red-500 border-red-500/50'}`}>
                {connStatus.cmd ? <Wifi size={8} /> : <WifiOff size={8} />}
                {connStatus.cmd ? 'ONLINE' : 'OFFLINE'}
              </div>
            </div>
            {isProcessing && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-40">
                <Loader2 size={24} className="text-[#00ffff] animate-spin mb-2" />
                <span className="text-[8px] text-[#00ffff] font-black uppercase tracking-widest">Processing</span>
              </div>
            )}
          </div>
          <span className="text-[8px] text-[#00ffff]/40 font-bold uppercase tracking-[0.3em]">Scanner_Engine_v3.0</span>
        </div> */}

        <div className="flex-1 border-2 border-[#00ffff]/40 bg-zinc-900/60 p-5 relative font-mono rounded-sm flex flex-col shadow-2xl min-h-[160px]">
          <div className="absolute -top-[12px] left-6 bg-white text-black px-4 py-0.5 text-[18px] font-black uppercase z-[50]">Setup Perangkat & Lisensi</div>
          {/* <div className="flex flex-row items-end gap-6 text-left font-mono w-full mb-auto"> */}
            
            {/* 1. Connectivity Section */}
            {/* <div className="flex-none space-y-1">
              <label className="text-[14px] pt-2.5 text-[#00ffff]/60 uppercase font-black flex items-center gap-1"><LinkIcon size={10} /> Connectivity</label>
              <div className="flex gap-1 h-9 items-center">
                <button onClick={() => connectSvc('cmd')} className={`px-4 h-full text-[14px] border font-black uppercase transition-all ${connStatus.cmd ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>Cmd</button>
                <button onClick={() => connectSvc('mc')} className={`px-4 h-full text-[14px] border font-black uppercase transition-all ${connStatus.mc ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>Media</button>
              </div>
            </div> */}

            {/* 2. License Code Section */}
            {/* <div className="flex-1 space-y-1">
              <label className="text-[14px] text-[#00ffff]/60 uppercase font-black flex items-center gap-1"><Key size={10} /> License Code</label>
              <div className="flex gap-1 h-9 items-center"> */}
                {/* INPUT: Mati jika Cmd/Media belum aktif */}
                {/* <input 
                  type="text" 
                  value={formData.license} 
                  onChange={(e) => setFormData({...formData, license: e.target.value})} 
                  disabled={!connStatus.cmd || !connStatus.mc || isLicenseActive}
                  placeholder={(!connStatus.cmd || !connStatus.mc) ? "Connect Cmd & Media first..." : "Enter SDK License..."} 
                  className={`flex-1 bg-black border border-[#00ffff]/20 h-full px-3 text-[14px] text-white outline-none focus:border-[#00ffff]/60 font-mono placeholder:opacity-20 ${(!connStatus.cmd || !connStatus.mc) ? 'cursor-not-allowed opacity-50' : ''}`} 
                /> */}
                
                {/* INIT: Aktif jika (Cmd & Media OK) DAN (License Input terisi) DAN (Belum ter-Init) */}
                {/* <button 
                  onClick={handleInitSDK} 
                  disabled={!connStatus.cmd || !connStatus.mc || !formData.license || isLicenseActive} 
                  className={`px-4 h-full text-[10px] font-black uppercase transition-all active:scale-95 ${(!connStatus.cmd || !connStatus.mc || !formData.license || isLicenseActive) ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-white text-black hover:bg-zinc-200'}`}
                >
                  INIT
                </button> */}

                {/* DEINIT: Aktif jika lisensi sudah berhasil diaktifkan */}
                {/* <button 
                  onClick={handleDeinitSDK} 
                  disabled={!isLicenseActive} 
                  className={`px-4 h-full text-[10px] font-black uppercase transition-all active:scale-95 ${!isLicenseActive ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-rose-600 text-white hover:bg-rose-500'}`}
                >
                  DEINIT
                </button> */}
              {/* </div>
            </div> */}

            {/* 3. Scan Size Section */}
            {/* <div className="flex-none w-44 space-y-1">
              <label className="text-[14px] text-[#00ffff]/60 uppercase font-black flex items-center gap-1"><Maximize2 size={10} /> Scan Size</label>
              <div className="h-9">
                <select 
                  disabled={!isLicenseActive}
                  value={formData.scanWide} 
                  onChange={(e) => { const val = parseInt(e.target.value); setFormData({...formData, scanWide: val}); sendCmd({ id: 74, wide: val }); }} 
                  className={`w-full h-full bg-black border border-[#00ffff]/20 px-2 text-[12px] text-white outline-none focus:border-[#00ffff]/50 ${!isLicenseActive ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                >
                  <option value={1}>A4 Standard</option>
                  <option value={2}>A3 Expanded</option>
                </select>
              </div>
            </div> */}
          {/* </div> */}

          <label className="text-[16px] text-white uppercase font-black flex items-center gap-1 pt-3 pb-2"><Key size={18} /> Status Kode Lisensi</label>
          
          <div className="flex gap-2 items-center h-full w-full">
                          {/* 
                            PERBAIKAN: Gunakan hanya SATU div status. 
                            Hapus wrapper 'isAutoInitializing.current' yang ada di source 43.
                          */}
                          <div 
                            className={`flex items-center gap-3 px-8 py-2 border-2 transition-all duration-500 rounded-sm ${
                              isLicenseActive 
                                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' // HIJAU SAAT AKTIF[cite: 42]
                                : 'border-rose-600 text-rose-500 bg-rose-500/10'          // MERAH SAAT MENUNGGU[cite: 42]
                            }`}
                          >
                            {isLicenseActive ? (
                              <>
                                <ShieldCheck size={20} className="animate-pulse" />
                                <span className="text-[12px] font-black uppercase tracking-[0.2em]">
                                  Kode_Lisensi_Aktif
                                </span>
                              </>
                            ) : (
                              <>
                                <Activity size={20} className="animate-pulse" />
                                <span className="text-[12px] font-black uppercase tracking-[0.2em]">
                                  Kode_Lisensi_Tidak_Aktif
                                </span>
                              </>
                            )}
                          </div>
                        </div>

          <label className="text-[16px] text-white uppercase font-black flex items-center gap-1 pt-4"><CameraIcon size={18} /> Kontrol Kamera</label>

          {/* Tombol Start/Stop Camera juga sudah otomatis ter-handle oleh !isLicenseActive */}
          <div className="mt-4 flex gap-4">
            <button 
              onClick={isCameraOpen ? closeCamera : openCamera} 
              disabled={!isLicenseActive} 
              className={`flex-1 py-3 font-black text-[14px] font-mono uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 rounded-sm shadow-md ${
                !isLicenseActive 
                  ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed opacity-50' 
                  : isCameraOpen 
                    ? 'bg-red-600 text-white hover:bg-red-500 active:scale-95' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95'
              }`}
            >
              {isCameraOpen ? (
                <>
                  <Square size={14} fill="white" />
                  <span>Stop Camera</span>
                </>
              ) : (
                <>
                  <Play size={14} fill="white" />
                  <span>Start Camera</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* PANEL NAVIGASI BAWAH */}
      <div className="flex-1 font-mono border-2 border-[#00ffff]/40 bg-zinc-950 flex flex-col rounded-sm relative overflow-hidden shadow-2xl min-h-[350px]">
          <div className="flex border-b border-[#00ffff]/40 bg-zinc-750/80">
            <button 
              onClick={() => setActiveBottomTab('storage')}
              className={`px-6 py-2 text-[16px] font-black uppercase tracking-[0.2em] flex items-center gap-2 transition-all border-r border-[#00ffff]/10 ${activeBottomTab === 'storage' ? 'bg-[#00ffff] text-black' : 'text-[#00ffff]/70 hover:text-[#00ffff] hover:bg-zinc-800'}`}
            >
              <Database size={14} /> Device Storage Path
            </button>
            <button 
              onClick={() => setActiveBottomTab('pdf')}
              className={`px-6 py-2 text-[16px] font-black uppercase tracking-[0.2em] flex items-center gap-2 transition-all border-r-1 border-[#00ffff]/40 ${activeBottomTab === 'pdf' ? 'bg-[#00ffff] text-black' : 'text-[#00ffff]/70 hover:text-[#00ffff] hover:bg-zinc-800'}`}
            >
              <Layers size={14} /> PDF Composition
            </button>
          </div>

          <div className="p-6 flex-1 flex flex-col relative overflow-hidden">
              {activeBottomTab === 'storage' ? (
                <div className="space-y-6 font-mono text-left max-w-4xl animate-in fade-in duration-500">
                  <div className="space-y-1.5">
                      <label className="text-[16px] text-white uppercase font-black tracking-widest block">Destination File Path (SDK Local)</label>
                      <div className="flex gap-2">
                        <input type="text" value={formData.grabImage} onChange={(e) => setFormData({...formData, grabImage: e.target.value})} className="flex-1 bg-black border border-[#00ffff]/40 p-2 text-[16px] text-[#00ffff] outline-none focus:border-[#00ffff]/50 font-mono shadow-inner" />
                        <label className="px-4 bg-zinc-800 border border-[#00ffff]/40 flex items-center justify-center cursor-pointer hover:bg-zinc-700 transition-colors rounded-sm">
                          <FolderOpen size={16} className="text-[#00ffff]" />
                          <input type="file" className="hidden" onChange={(e) => handleFileBrowse(e, 'grabImage')} />
                        </label>
                      </div>
                  </div>
                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-1.5">
                            <label className="text-[16px] text-white uppercase font-black tracking-widest block">DPI Resolution</label>
                            <input type="number" value={formData.dpi} onChange={(e) => setFormData({...formData, dpi: parseInt(e.target.value)})} className="w-full bg-black border border-[#00ffff]/40 p-2 text-[16px] text-[#00ffff] outline-none focus:border-[#00ffff]/50" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[16px] text-white uppercase font-black tracking-widest block">JPG Quality %</label>
                            <input type="number" value={formData.jpgQuality} onChange={(e) => setFormData({...formData, jpgQuality: parseInt(e.target.value)})} className="w-full bg-black border border-[#00ffff]/40 p-2 text-[16px] text-[#00ffff] outline-none focus:border-[#00ffff]/50" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[16px] text-white uppercase font-black tracking-widest block mb-1">Color Mode</label>
                        <select value={formData.colorMode} onChange={(e) => setFormData({...formData, colorMode: parseInt(e.target.value)})} className="w-full bg-black border border-[#00ffff]/40 p-2 text-[16px] text-[#00ffff] outline-none focus:border-[#00ffff]/50 cursor-pointer font-mono">
                          <option value={0}>Color</option>
                          <option value={1}>Color Optimization</option>
                          <option value={2}>Grey Scale</option>
                          <option value={3}>B & W</option>
                        </select>
                    </div>
                    <div className="pt-2">
                        <button onClick={handleTakePhoto} disabled={!isCameraOpen || isProcessing} className={`w-full py-4 rounded-sm text-[14px] font-black uppercase tracking-[0.4em] transition-all flex items-center justify-center gap-3 shadow-lg ${isCameraOpen && !isProcessing ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 shadow-[0_0_25px_rgba(79,70,229,0.3)]' : 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed'}`}>
                          <Camera size={22} /> {isProcessing ? "Processing..." : "Take & Save Photo"}
                        </button>
                    </div>
                </div>
              ) : (
                <div className="space-y-6 font-mono text-left max-w-4xl animate-in slide-in-from-right-4 duration-500">
                  <div className="space-y-1.5">
                      <label className="text-[16px] text-white uppercase font-black tracking-widest block">Source Image Path (Local Disk)</label>
                      <div className="flex gap-2">
                          <input type="text" value={formData.pdfImage} onChange={(e) => setFormData({...formData, pdfImage: e.target.value})} className="flex-1 bg-black border border-[#00ffff]/40 p-2 text-[16px] text-[#00ffff] outline-none focus:border-[#00ffff]/50 shadow-inner" />
                          <label className="px-4 bg-zinc-800 border border-[#00ffff]/40 flex items-center justify-center cursor-pointer hover:bg-zinc-700 transition-colors rounded-sm">
                              <Search size={16} className="text-[#00ffff]" />
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileBrowse(e, 'pdfImage')} />
                          </label>
                      </div>
                  </div>

                  <div className="space-y-1.5">
                      <label className="text-[16px] text-white uppercase font-black tracking-widest block">Output PDF Path</label>
                      <div className="flex gap-2">
                          <input type="text" value={formData.pdfFile} onChange={(e) => setFormData({...formData, pdfFile: e.target.value})} className="flex-1 bg-black border border-[#00ffff]/40 p-2 text-[16px] text-[#00ffff] outline-none focus:border-[#00ffff]/50 shadow-inner" />
                          <label className="px-4 bg-zinc-800 border border-[#00ffff]/40 flex items-center justify-center cursor-pointer hover:bg-zinc-700 transition-colors rounded-sm">
                              <FileText size={16} className="text-[#00ffff]" />
                              <input type="file" className="hidden" onChange={(e) => handleFileBrowse(e, 'pdfFile')} />
                          </label>
                      </div>
                  </div>
                    <div className="pt-4">
                        <div className="bg-indigo-900/10 border border-indigo-500/20 p-4 rounded mb-4">
                           <p className="text-[14px] text-indigo-300 leading-relaxed italic flex items-start gap-2">
                             <Settings size={14} className="shrink-0" />
                             Instruksi: Mengubah file citra fisik dari direktori lokal menjadi dokumen PDF melalui engine SDK.
                           </p>
                        </div>
                        <button onClick={handleGeneratePDF} className="w-full py-4 bg-indigo-600 text-white rounded-sm text-[14px] font-black uppercase tracking-[0.4em] shadow-lg hover:bg-indigo-500 active:scale-95 transition-all">
                           <FileText size={16} className="inline mr-3" /> Generate PDF File
                        </button>
                    </div>
                </div>
              )}

              {/* FOOTER METADATA */}
              <div className="mt-auto flex justify-between items-center border-t border-[#00ffff]/5 pt-4">
                 <div className="flex items-center gap-2">
                    <Activity size={12} className="text-[#00ffff]/40 animate-pulse" />
                    {/* <span className="text-[14px] text-white uppercase font-black tracking-widest italic">Logs synced to Sidebar Console</span> */}
                 </div>
                 <div className="flex gap-6 items-center">
                    <button onClick={() => setLogs([`[SYSTEM] Console logs flushed.`])} className="text-[14px] text-[#00ffff]/70 hover:text-[#00ffff] uppercase font-black underline underline-offset-4 decoration-[#00ffff]/20 transition-colors">Flush Logs</button>
                    {/* <button onClick={handleDeinitSDK} className="text-[9px] text-rose-500 hover:text-white uppercase font-black tracking-wider transition-colors">Deinit SDK</button> */}
                 </div>
              </div>
          </div>
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              {activeBottomTab === 'storage' ? <Database size={120} className="text-[#00ffff]" /> : <FileText size={120} className="text-[#00ffff]" />}
          </div>
      </div>
    </div>
  );
};

export default DocumentScannerModule;