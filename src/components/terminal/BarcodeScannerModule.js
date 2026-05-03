"use client";
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Camera, 
  Settings, 
  Key, 
  Play, 
  Square, 
  Maximize,
  ScanBarcode,
  Terminal,
  Image as ImageIcon,
  FolderOpen,
  FileSearch,
  ShieldCheck,
  Wifi,
  WifiOff,
  Cpu,
  Clock,
  Database,
  RefreshCw, X,
  Link as LinkIcon
} from 'lucide-react';

/**
 * BarcodeScannerModule (Integrasi SDK Penuh - Dioptimalkan)
 * Diperbarui: Memperbaiki logika deteksi barcode dan format log sesuai referensi agar berhasil.
 */
const App = ({ data }) => {
  // --- State Utama ---
  const [logs, setLogs] = useState([`[${new Date().toLocaleTimeString()}] [SYSTEM] Barcode Engine v3.0 Online.`]);
  const [license, setLicense] = useState("");
  const [sdkVersion, setSdkVersion] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [isA4, setIsA4] = useState(false);
  const [connections, setConnections] = useState({ cmd: false, main: false });
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  // Ambil dari ENV
  const SDK_LICENSE = process.env.NEXT_PUBLIC_BARCODE_LICENSE || "";
  const isAutoInitializing = useRef(false); // Pengunci agar tidak init berkali-kali
  // --- Di dalam komponen App ---
  const [isLicenseActive, setIsLicenseActive] = useState(false); // Melacak hasil AUTO-INIT
  const [isCameraOpen, setIsCameraOpen] = useState(false); // Melacak status kamera

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
    
  // --- State Fungsi Kamera ---
  const [camFunc, setCamFunc] = useState({
    devType: 0, 
    filePath: "C:\\barcode_capture.jpg",
    dpi: 300,
    colorMode: 0,
    keepRound: false,
    autoAdjust: false,
    readBarcode: true,
    detectBlank: false,
    jpgQuality: 75,
    tiffCompress: 1 
  });

  const [barcodeFile, setBarcodeFile] = useState("C:\\barcode_capture.jpg");

  // Ref WebSocket & Canvas
  const wsCmd = useRef(null);
  const wsMain = useRef(null);
  const mainCanvas = useRef(null);
  const savePathInputRef = useRef(null);
  const barcodePathInputRef = useRef(null);

  const showToast = (message, type = "success") => {
    const cleanMsg = message ? message.replace(/\0/g, '').trim() : "Sistem Sibuk";
    setToast({ show: true, message: cleanMsg, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 5000);
  };


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
    return () => {
      if (wsCmd.current) wsCmd.current.close();
      if (wsMain.current) wsMain.current.close();
      window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
    };
  }, []);

  useEffect(() => {
      window.dispatchEvent(new CustomEvent('scanner:logs-sync', { detail: logs }));
    }, [logs]);

  // Helper untuk mendapatkan Tipe Barcode sesuai referensi page.js
  const getBarcodeTypeString = (typeId) => {
    const types = {
      8: "EAN-8",
      9: "UPC-E",
      12: "UPC-A",
      13: "EAN-13",
      14: "ISBN-13",
      25: "Interleaved 2 of 5",
      39: "Code 39",
      64: "QR Code",
      128: "Code 128"
    };
    return types[typeId] || "Unknown";
  };

// Di dalam komponen App, tambahkan ref ini di bagian atas bersama ref lainnya
const autoConnectStarted = useRef(false); 

useEffect(() => {
  // LOCKING MECHANISM: Mencegah eksekusi ganda meskipun React Strict Mode memicu useEffect 2x
  if (!autoConnectStarted.current) {
    autoConnectStarted.current = true;
    checkApiStatus();
  }

  return () => {
    // Bersihkan koneksi saat menu ditutup
    if (wsCmd.current) wsCmd.current.close();
    if (wsMain.current) wsMain.current.close();
    window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
  };
}, []);

// const checkApiStatus = async () => {
//   // Guard Tambahan: Jangan jalankan jika sudah ada koneksi aktif
//   if (wsCmd.current?.readyState === WebSocket.OPEN || wsMain.current?.readyState === WebSocket.OPEN) {
//     return;
//   }

//   addLog("Memeriksa status endpoint API Barcode SDK...", "info");
  
//   if (!SDK_LICENSE) {
//     addLog("PERINGATAN: NEXT_PUBLIC_BARCODE_LICENSE belum diatur di file .env", "error");
//   } else {
//     addLog("Lisensi terdeteksi di sistem (Environment Mode).", "success");
//   }
  
//   const ports = { cmd: 25014, main: 9999 };
  
//   Object.entries(ports).forEach(([type, port]) => {
//     const testWs = new WebSocket(`ws://127.0.0.1:${port}/`);
    
//     testWs.onopen = () => {
//       // Pastikan kita tidak menimpa koneksi yang mungkin sudah dibuat oleh thread paralel
//       setConnections(prev => {
//         if (prev[type]) {
//           testWs.close(); // Tutup jika sudah ada yang menang
//           return prev;
//         }
        
//         addLog(`Status API ${type.toUpperCase()}: AKTIF (Terhubung secara otomatis).`, "success");
        
//         if (type === 'cmd') {
//           testWs.onmessage = (e) => handleCmdMessage(JSON.parse(e.data));
//           wsCmd.current = testWs;
//         } else {
//           testWs.onmessage = (e) => {
//             const b64 = 'data:image/jpeg;base64,' + e.data;
//             window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: b64 }));
//           };
//           wsMain.current = testWs;
//         }
        
//         return { ...prev, [type]: true };
//       });
//     };

//     testWs.onerror = () => {
//       // Hanya log error jika memang belum terhubung
//       if (!connections[type]) {
//         addLog(`Status API ${type.toUpperCase()}: TIDAK AKTIF.`, "error");
//       }
//     };
//   });
// };

const checkApiStatus = async () => {
  if (wsCmd.current?.readyState === WebSocket.OPEN && wsMain.current?.readyState === WebSocket.OPEN) {
    return;
  }

  addLog("Memeriksa status endpoint API Barcode SDK...", "info");
  showToast("Memeriksa status SDK...", "info");

  const ports = { cmd: 25014, main: 9999 };
  let activeConns = { cmd: false, main: false };

  Object.entries(ports).forEach(([type, port]) => {
    const testWs = new WebSocket(`ws://127.0.0.1:${port}/`);
    
    testWs.onopen = () => {
      setConnections(prev => {
        const newConns = { ...prev, [type]: true };
        
        // AUTO-INIT LOGIC: Jika kedua server aktif, eksekusi lisensi
        if (newConns.cmd && newConns.main && !isAutoInitializing.current) {
          isAutoInitializing.current = true;
          
          addLog("Server CMD & MAIN Aktif. Memulai Auto-Init Lisensi...", "info");
          
          // Kirim perintah init secara manual menggunakan WebSocket yang baru terbuka
          const initCmd = JSON.stringify({ id: 1, license: SDK_LICENSE });
          if (type === 'cmd') {
            testWs.send(initCmd);
          } else if (wsCmd.current) {
            wsCmd.current.send(initCmd);
          }
        }
        
        return newConns;
      });

      showToast(`Server ${type.toUpperCase()} Terhubung`, "success");

      addLog(`Status API ${type.toUpperCase()}: Terhubung otomatis.`, "success");
      
      if (type === 'cmd') {
        testWs.onmessage = (e) => handleCmdMessage(JSON.parse(e.data));
        wsCmd.current = testWs;
      } else {
        testWs.onmessage = (e) => {
          const b64 = 'data:image/jpeg;base64,' + e.data;
          window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: b64 }));
        };
        wsMain.current = testWs;
      }
    };

    testWs.onerror = () => {
      showToast(`Server ${type.toUpperCase()} Tidak Terhubung`, "error");
      addLog(`Status API ${type.toUpperCase()}: TIDAK AKTIF.`, "error");
    };
  });
};

  // --- Logika WebSocket ---
  const connectSvc = (type, port) => {
    const url = `ws://127.0.0.1:${port}/`;
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        setConnections(prev => ({ ...prev, [type]: true }));
        addLog(`Berhasil terhubung ke Server ${type.toUpperCase()}.`, "success");
      };
      ws.onclose = () => {
        setConnections(prev => ({ ...prev, [type]: false }));
        addLog(`Terputus dari Server ${type.toUpperCase()}.`, "error");
        if (type === 'main') window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
      };
      if (type === 'cmd') {
        ws.onmessage = (e) => handleCmdMessage(JSON.parse(e.data));
        wsCmd.current = ws;
      } else {
        ws.onmessage = (e) => {
          const b64 = 'data:image/jpeg;base64,' + e.data;
          if (mainCanvas.current) {
            const ctx = mainCanvas.current.getContext('2d');
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0, 640, 480);
            img.src = b64;
          }
          window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: b64 }));
        };
        wsMain.current = ws;
      }
    } catch (e) {
      addLog(`Gagal menyambung ke port ${port}.`);
    }
  };

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
        else addLog(`Gagal memotret: Error ${data.error}, periksa path penyimpanan!`, "error");
        showToast("Gambar Mengambil Gambar", "error");
        break;

      // Respon Penyimpanan Gambar (ID 301)
      case 301: 
        if (data.error === 0 && data.file1 !== "null") {
          showToast("Gambar Berhasil Disimpan", "success");
          addLog(`Image Saved, File Name is: ${data.file1}`, "success");
        }
        break;

      // Hasil Barcode Dikenali (ID 326)
      case 326: 
        if (data.error === 0) {
          const typeStr = getBarcodeTypeString(data.type);
          setScanResult({ data: data.text, type: typeStr });
          showToast("Barcode Terdeteksi!", "success");
          addLog(`Barcode Recognized, Type: ${typeStr}, Content: ${data.text}`, "success");
        }
        break;

      // case 2: addLog(data.error === 0 ? "Inisialisasi Plugin Berhasil" : `Gagal Inisialisasi: Error ${data.error}`); break;
      case 2: // Respon Inisialisasi Plugin[cite: 33]
        if (data.error === 0) {
          showToast("SDK Barcode Siap Digunakan", "success");
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
          showToast("Scanner tidak terhubung.", "error");
          addLog("Scanner is not connected. Please connect the scanner to this computer.", "error"); // Sesuai Source 41
          setIsCameraOpen(false);
        } else {
          addLog(`Gagal mengaktifkan kamera: Error ${data.error}`, "error");
        }
        break;

      case 12: // Konfirmasi Kamera Tertutup[cite: 33]
        addLog("Kamera dimatikan.", "success");
        showToast("Kamera dimatikan.", "info");
        setIsCameraOpen(false); // <--- Mengaktifkan tombol Enable kembali[cite: 39]
        break;

      default:
        if (data.error !== undefined && data.error !== 0) {
          addLog(`Kesalahan Server: ${data.error}`);
        }
    }
  };

  const sendCmd = (obj) => {
    if (wsCmd.current && wsCmd.current.readyState === WebSocket.OPEN) {
      // Mengirim sebagai string untuk penanganan path Windows yang lebih aman
      const message = typeof obj === 'string' ? obj : JSON.stringify(obj);
      wsCmd.current.send(message);
    } else {
      addLog("Kesalahan: Server Perintah belum terhubung!");
    }
  };

  // const initializePlugin = () => sendCmd({ id: 1, license });
  const initializePlugin = () => sendCmd({ id: 1, license: SDK_LICENSE });
  const openCamera = () => sendCmd({ id: 9, index: camFunc.devType });
  const closeCamera = () => sendCmd({ id: 11, index: camFunc.devType });
  const setA4 = (on) => { setIsA4(on); sendCmd({ id: 110, on: on ? 1 : 0 }); };

  const obtainImageFile = () => {
    setIsScanning(true);
    // Konstruksi manual untuk menghindari masalah escaping path sesuai referensi page.js
    const cmd = '{"id": 13, "index": ' + camFunc.devType + ', "file": "' + camFunc.filePath.replace(/\\/g, "\\\\") + '", "dpi": ' + camFunc.dpi + ', "color": ' + camFunc.colorMode + ', "round": ' + (camFunc.keepRound ? 1 : 0) + ', "adjust": ' + (camFunc.autoAdjust ? 1 : 0) + ', "bcr": ' + (camFunc.readBarcode ? 1 : 0) + ', "bpd": ' + (camFunc.detectBlank ? 1 : 0) + ', "quality": ' + camFunc.jpgQuality + ', "compress": ' + camFunc.tiffCompress + '}';
    sendCmd(cmd);
    setTimeout(() => setIsScanning(false), 1500);
  };

  const startBarcodeRecog = () => {
    // Menggunakan konstruksi string manual agar path Windows tidak rusak saat parsing JSON (perbaikan bug SDK error 5)
    const cmd = '{"id": 102, "freq": 8, "left": 0.0, "top": 0.0, "right": 1.0, "bottom": 1.0, "flag": 2, "content": "' + barcodeFile.replace(/\\/g, "\\\\") + '"}';
    sendCmd(cmd);
    addLog("Barcode recognition in progress, please wait");
  };

  const stopBarcodeRecog = () => {
    sendCmd({ id: 104 });
    addLog("Deteksi barcode dihentikan.");
  };

  const handleBrowseSavePath = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      const path = files[0].name;
      setCamFunc({...camFunc, filePath: `C:\\${path}`});
      addLog(`Path penyimpanan dipilih: C:\\${path}`);
    }
  };

  const handleBrowseBarcodeFile = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      const path = files[0].name;
      setBarcodeFile(`C:\\${path}`);
      addLog(`File barcode dipilih: C:\\${path}`);
    }
  };

  return (
    <div className="flex-1 p-3 flex flex-col gap-5 overflow-hidden font-mono bg-zinc-950 text-white">
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

      {/* HEADER: KONEKTIVITAS */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-4 shrink-0">
        <div className="border-2 border-[#00ffff]/40 bg-zinc-900/60 p-4 relative rounded-sm shadow-xl flex items-center justify-between">
           {/* <div className="absolute -top-[10px] left-4 bg-white text-black px-3 py-0.5 text-[10px] font-black uppercase z-10">Connectivity</div> */}

           <div className="absolute -top-[10px] left-4 bg-white text-black px-3 py-0.5 text-[18px] font-black uppercase z-10">
              System Authorization
          </div>

           {/* <div className="flex gap-2">
              <ConnectionBtn label="CMD" active={connections.cmd} onClick={() => connectSvc('cmd', 25014)} />
              <ConnectionBtn label="MAIN" active={connections.main} onClick={() => connectSvc('main', 9999)} />
           </div> */}
           {/* <div className="flex gap-4 text-[10px]">
              <div className="flex flex-col items-end"><span className="text-zinc-500 uppercase">SDK Ver</span><span className="text-[#00ffff] font-black">{sdkVersion || "---"}</span></div>
              <div className="flex flex-col items-end"><span className="text-zinc-500 uppercase">Device ID</span><span className="text-[#00ffff] font-black">{deviceId || "---"}</span></div>
           </div> */}
           {/* <div className="absolute -top-[10px] left-4 bg-white text-black px-3 py-0.5 text-[10px] font-black uppercase z-10">Inisialisasi SDK</div> */}
           {/* <div className="flex gap-2 items-center h-full"> */}

              {/* <Key size={14} className="text-[#00ffff]/60" />
              <input 
                type="text" value={license} onChange={(e) => setLicense(e.target.value)}
                placeholder="Masukkan Kode Lisensi..." 
                className="flex-1 bg-black border border-[#00ffff]/20 px-3 py-1.5 text-[11px] text-white outline-none focus:border-[#00ffff]/60"
              />
              <button onClick={initializePlugin} className="bg-[#00ffff] text-black px-4 py-1.5 text-[10px] font-black uppercase hover:brightness-110 active:scale-95 transition-all">INIT</button> */}

              {/* Tombol INIT */}
              {/* <button 
                onClick={initializePlugin} 
                disabled={!connections.cmd}
                className={`flex-1 h-10 flex items-center justify-center gap-2 text-[11px] font-black uppercase transition-all active:scale-95 ${
                  !connections.cmd 
                    ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed' 
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                }`}
              >
                <Key size={14} /> INIT SDK
              </button> */}

              {/* Tombol DEINIT */}
              {/* <button 
                onClick={() => sendCmd({ id: 3 })} // Perintah deinit SDK
                disabled={!connections.cmd}
                className={`flex-1 h-10 flex items-center justify-center gap-2 text-[11px] font-black uppercase transition-all active:scale-95 ${
                  !connections.cmd 
                    ? 'bg-zinc-800 text-zinc-600 border border-zinc-700 cursor-not-allowed' 
                    : 'bg-rose-600 text-white hover:bg-rose-500 shadow-[0_0_15px_rgba(225,29,72,0.3)]'
                }`}
              >
                <RefreshCw size={14} /> DEINIT SDK
              </button> */}

              {/* <div className={`flex items-center gap-3 px-6 py-2 border-2 ${isAutoInitializing.current ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-zinc-700 text-zinc-500'}`}>
                {isLicenseActive ? <ShieldCheck size={20} className="animate-pulse" /> : <Activity size={20} />}
                <span className="text-[12px] font-black uppercase tracking-widest">
                    {isLicenseActive ? "SDK_AUTHORIZED_ACTIVE" : "Awaiting_Auto_Initialization"}
                </span>
              </div> */}

              <div className="flex gap-2 items-center h-full w-full pt-4">
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
                        SDK_AUTHORIZED_ACTIVE
                      </span>
                    </>
                  ) : (
                    <>
                      <Activity size={20} className="animate-pulse" />
                      <span className="text-[12px] font-black uppercase tracking-[0.2em]">
                        Awaiting_Auto_Initialization
                      </span>
                    </>
                  )}
                </div>
              </div>

           {/* </div> */}
        </div>
        

        {/* <div className="border-2 border-[#00ffff]/40 bg-zinc-900/60 p-4 relative rounded-sm shadow-xl">
           <div className="absolute -top-[10px] left-4 bg-white text-black px-3 py-0.5 text-[10px] font-black uppercase z-10">Inisialisasi SDK</div>
           <div className="flex gap-2 items-center h-full">
              <Key size={14} className="text-[#00ffff]/60" />
              <input 
                type="text" value={license} onChange={(e) => setLicense(e.target.value)}
                placeholder="Masukkan Kode Lisensi..." 
                className="flex-1 bg-black border border-[#00ffff]/20 px-3 py-1.5 text-[11px] text-white outline-none focus:border-[#00ffff]/60"
              />
              <button onClick={initializePlugin} className="bg-[#00ffff] text-black px-4 py-1.5 text-[10px] font-black uppercase hover:brightness-110 active:scale-95 transition-all">INIT</button>
           </div>
        </div> */}
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-5 overflow-hidden">
        
        {/* SISI KIRI: PRATINJAU & LOG (POSISI TETAP) */}
        

        {/* SISI KANAN: PENGATURAN */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
           
           <div className="py-2 grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Menu Kamera */}
              <div className="border-3 border-[#00ffff]/20 bg-zinc-900/40 p-4 rounded-sm relative">
                <div className="absolute -top-[10px] left-4 bg-zinc-800 text-[#00ffff] px-2 py-0.5 text-[18px] font-black uppercase tracking-widest border border-[#00ffff]/20">Kamera</div>
                {/* <div className="flex items-center justify-between p-3 bg-black/40 rounded mb-4 border border-[#00ffff]/5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">A4 Size Mode</span>
                  <button 
                    onClick={() => setA4(!isA4)}
                    className={`w-10 h-5 rounded-full transition-all relative ${isA4 ? 'bg-[#00ffff]' : 'bg-zinc-700'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${isA4 ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                </div> */}
                <div className="py-5 grid grid-cols-1 gap-2">
                  {/* <button onClick={openCamera} className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 py-2.5 rounded-sm text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                    <Play size={12}/> Enable Camera
                  </button>
                  <button onClick={closeCamera} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/40 py-2.5 rounded-sm text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                    <Square size={12}/> Disable Camera
                  </button> */}

                  {/* Tombol Enable Camera: Aktif jika lisensi OK DAN kamera sedang MATI[cite: 39] */}
                  {/* ENABLE CAMERA */}
                  <button 
                    onClick={openCamera} 
                    // Aktif hanya jika Lisensi OK DAN Kamera sedang tertutup
                    disabled={!isLicenseActive || isCameraOpen} 
                    className={`py-2.5 rounded-sm text-[18px] font-black uppercase transition-all flex items-center justify-center gap-2 border-2 ${
                      isLicenseActive && !isCameraOpen 
                        ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                        : 'bg-zinc-800/50 text-zinc-600 border-zinc-700 cursor-not-allowed opacity-30'
                    }`}
                  >
                    <Play size={18} fill="currentColor"/> Enable Camera
                  </button>

                  {/* DISABLE CAMERA */}
                  <button 
                    onClick={closeCamera} 
                    // Aktif hanya jika Kamera sedang terbuka
                    disabled={!isCameraOpen} 
                    className={`mt-3 py-2.5 rounded-sm text-[18px] font-black uppercase transition-all flex items-center justify-center gap-2 border-2 ${
                      isCameraOpen 
                        ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                        : 'bg-zinc-800/50 text-zinc-600 border-zinc-700 cursor-not-allowed opacity-30'
                    }`}
                  >
                    <Square size={18} fill="currentColor"/> Disable Camera
                  </button>
                </div>
              </div>

              {/* Menu Konfigurasi */}
              <div className="border-3 border-[#00ffff]/20 bg-zinc-900/40 p-4 rounded-sm relative">
                <div className="absolute -top-[10px] left-4 bg-zinc-800 text-[#00ffff] px-2 py-0.5 text-[18px] font-black uppercase tracking-widest border border-[#00ffff]/20">Konfigurasi</div>
                <div className="space-y-3 pt-3 text-left">
                   <div className="space-y-1">
                      <label className="text-[16px] text-white uppercase font-black">Save Path</label>
                      <div className="flex gap-1">
                         <input type="text" value={camFunc.filePath} onChange={(e) => setCamFunc({...camFunc, filePath: e.target.value})} className="flex-1 bg-black border border-[#00ffff]/20 p-2 text-[14px] text-[#00ffff] outline-none" />
                         <button onClick={() => savePathInputRef.current.click()} className="p-2 bg-zinc-800 border border-[#00ffff]/10 text-zinc-400 hover:text-white"><FolderOpen size={12}/></button>
                         <input type="file" ref={savePathInputRef} className="hidden" onChange={handleBrowseSavePath} />
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                         <label className="text-[16px] text-white uppercase font-black text-left block">DPI</label>
                         <input type="number" value={camFunc.dpi} onChange={(e) => setCamFunc({...camFunc, dpi: parseInt(e.target.value)})} className="w-full bg-black border border-[#00ffff]/20 p-2 text-[14px] text-[#00ffff] outline-none" />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[16px] text-white uppercase font-black text-left block">Mode Warna</label>
                         <select value={camFunc.colorMode} onChange={(e) => setCamFunc({...camFunc, colorMode: parseInt(e.target.value)})} className="w-full bg-black border border-[#00ffff]/20 p-2 text-[14px] text-[#00ffff] outline-none">
                            <option value={0}>Color</option><option value={1}>Optimize</option><option value={2}>Grey</option><option value={3}>B&W</option>
                         </select>
                      </div>
                   </div>
                   <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                      <Checkbox label="Keep Corners" checked={camFunc.keepRound} onChange={(v) => setCamFunc({...camFunc, keepRound: v})} />
                      <Checkbox label="Auto Adjust" checked={camFunc.autoAdjust} onChange={(v) => setCamFunc({...camFunc, autoAdjust: v})} />
                      <Checkbox label="Read Barcode" checked={camFunc.readBarcode} onChange={(v) => setCamFunc({...camFunc, readBarcode: v})} />
                      <Checkbox label="Detect Blank" checked={camFunc.detectBlank} onChange={(v) => setCamFunc({...camFunc, detectBlank: v})} />
                    </div>
              {/* <button onClick={obtainImageFile} disabled={isScanning} className="w-full mt-4 bg-zinc-800 hover:bg-black border border-[#00ffff]/20 text-white py-2.5 text-[14px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md">
                 {isScanning ? <RefreshCw size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                 Obtain Image File
              </button> */}
                  
                  {/* Tombol Obtain Image File dalam Panel Konfigurasi */}
                  <button 
                    onClick={obtainImageFile} 
                    // PERBAIKAN: Tombol hanya aktif jika Kamera OPEN (isCameraOpen) DAN sedang tidak dalam proses scanning
                    disabled={!isCameraOpen || isScanning} 
                    className={`w-full mt-4 border py-2.5 text-[14px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md ${
                      isCameraOpen && !isScanning 
                        ? 'bg-zinc-100 text-black hover:bg-white border-[#00ffff]/50 shadow-[0_0_15px_rgba(0,255,255,0.1)]' // AKTIF[cite: 45]
                        : 'bg-zinc-800 text-zinc-600 border-zinc-700 cursor-not-allowed opacity-50'                        // NON-AKTIF[cite: 45]
                    }`}
                  >
                    {isScanning ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <ImageIcon size={14} />
                    )}
                    Obtain Image File
                  </button>

                </div>
              </div>
           </div>

           

           {/* ENGINE BCR */}
           <div className="border-2 border-[#00ffff]/40 bg-zinc-950 p-5 rounded-sm relative shadow-2xl flex flex-col">
              <div className="absolute -top-[12px] left-6 bg-white text-black px-4 py-0.5 text-[18px] font-black uppercase z-20">Barcode Recognition</div>
              <div className="space-y-4 text-left">
                 <div className="space-y-1">
                    <label className="py-2 text-[14px] text-white-500 uppercase font-black flex items-center gap-2 block"><FileSearch size={12}/> Analysis Target Path</label>
                    <div className="flex gap-2">
                       <input type="text" value={barcodeFile} onChange={(e) => setBarcodeFile(e.target.value)} className="flex-1 bg-black border border-[#00ffff]/20 p-2 text-[14px] text-[#00ffff] outline-none" />
                       <button onClick={() => barcodePathInputRef.current.click()} className="px-3 bg-zinc-800 border border-[#00ffff]/20 text-zinc-400 hover:text-white transition-all"><FolderOpen size={16}/></button>
                       <input type="file" accept=".jpg,.jpeg" ref={barcodePathInputRef} className="hidden" onChange={handleBrowseBarcodeFile} />
                    </div>
                 </div>

                 <div className="grid grid-cols-1 gap-3">
                    <button onClick={startBarcodeRecog} className="bg-blue-600 hover:bg-blue-700 text-white py-2 text-[16px] font-black uppercase tracking-tighter transition-all active:scale-95 shadow-[0_0_15px_rgba(37,99,235,0.4)] flex items-center justify-center gap-2">
                       <Play size={14} fill="white" /> MULAI RECOGNITION
                    </button>
                    {/* <button onClick={stopBarcodeRecog} className="bg-zinc-800 hover:bg-zinc-900 text-zinc-400 py-2 text-[16px] font-black uppercase tracking-tighter transition-all active:scale-95 border border-white/5 flex items-center justify-center gap-2">
                       <Square size={14} fill="currentColor" /> BERHENTIKAN RECOGNITION
                    </button> */}
                 </div>

                 {scanResult ? (
                    <div className="bg-[#00ffff]/5 border-l-4 border-[#00ffff] p-4 animate-in fade-in slide-in-from-top-2">
                       <span className="text-[9px] text-[#00ffff]/60 uppercase font-black block mb-1 underline">Last Result</span>
                       <div className="text-xl text-[#00ffff] break-all font-black leading-none">{scanResult.data}</div>
                       <div className="text-[8px] text-zinc-500 mt-1 uppercase font-bold tracking-widest">{scanResult.type} Detected</div>
                    </div>
                 ) : (
                    <div className="border border-white/5 bg-black/40 p-6 flex flex-col items-center justify-center text-white opacity-70 italic">
                       <ScanBarcode size={32} className="mb-2" />
                       <span className="text-[14px] uppercase font-white text-white">Menunggu Data...</span>
                    </div>
                 )}
              </div>
           </div>

        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0, 255, 255, 0.2); border-radius: 10px; }
      `}</style>
    </div>
  );
};

// --- Komponen UI Reusable ---
function ConnectionBtn({ label, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`px-3 py-1.5 rounded-sm text-[9px] font-black flex items-center gap-2 transition-all border-2 uppercase ${
        active 
          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
          : 'bg-black border-zinc-800 text-zinc-600 hover:border-[#00ffff]/40 hover:text-white'
      }`}
    >
      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-300'}`} />
      {label}
    </button>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group">
      <input 
        type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="w-3 h-3 bg-black border-zinc-700 text-[#00ffff] focus:ring-[#00ffff]/20"
      />
      <span className="text-[12px] font-black text-[#00ffff] group-hover:text-zinc-300 transition-colors uppercase">
        {label}
      </span>
    </label>
  );
}

export default App;