"use client";
import React, { useState, useRef, useEffect } from 'react';
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
  Wifi,
  WifiOff,
  Cpu,
  Clock,
  Database,
  RefreshCw,
  Link as LinkIcon
} from 'lucide-react';

/**
 * BarcodeScannerModule (Full SDK Integration based on page.js)
 * Modul ini menggunakan perintah ID dari CZUR SDK (102, 104, 13, 68) 
 * dengan tata letak Log dan Preview di sisi kiri.
 */
const BarcodeScannerModule = ({ data }) => {
  // --- State Utama (Sesuai page.js) ---
  const [logs, setLogs] = useState([`[SYSTEM] Barcode Engine v3.0 Online.`]);
  const [license, setLicense] = useState("");
  const [sdkVersion, setSdkVersion] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [isA4, setIsA4] = useState(false);
  const [connections, setConnections] = useState({ cmd: false, main: false });
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  // --- State Fungsi Kamera (Sesuai page.js) ---
  const [camFunc, setCamFunc] = useState({
    devType: 0, // 0: Utama
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

  // Referensi WebSocket & Canvas
  const wsCmd = useRef(null);
  const wsMain = useRef(null);
  const mainCanvas = useRef(null);
  const savePathInputRef = useRef(null);
  const barcodePathInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (wsCmd.current) wsCmd.current.close();
      if (wsMain.current) wsMain.current.close();
      window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
    };
  }, []);

  // Sinkronisasi log ke sidebar global (opsional)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('scanner:logs-sync', { detail: logs }));
  }, [logs]);

  const addLog = (message, type = "info") => {
    const time = new Date().toLocaleTimeString();
    const prefix = type === "error" ? "[ERROR]" : type === "success" ? "[SUCCESS]" : "[INFO]";
    setLogs(prev => [`${prefix} ${message} (${time})`, ...prev].slice(0, 50));
  };

  // --- Logika WebSocket ---
  const connectSvc = (type, port) => {
    const url = `ws://127.0.0.1:${port}/`;
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        setConnections(prev => ({ ...prev, [type]: true }));
        addLog(`Terhubung ke Server ${type.toUpperCase()}.`, "success");
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
          // Update local canvas
          if (mainCanvas.current) {
            const ctx = mainCanvas.current.getContext('2d');
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0, 640, 480);
            img.src = b64;
          }
          // Update Global Sidebar Preview
          window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: b64 }));
        };
        wsMain.current = ws;
      }
    } catch (e) {
      addLog(`Gagal menyambung ke port ${port}.`, "error");
    }
  };

  const handleCmdMessage = (data) => {
    switch (data.id) {
      case 130: setSdkVersion(data.version || "Error"); break;
      case 8:
      case 107: setDeviceId(data.did || "N/A"); break;
      case 10: addLog("Kamera diaktifkan.", "success"); break;
      case 12: addLog("Kamera dimatikan."); break;
      case 14: 
        if (data.error === 0) addLog("Foto diambil. Sedang memproses...", "success");
        break;
      case 301: 
        if (data.error === 0 && data.file1 !== "null") addLog(`Gambar disimpan: ${data.file1}`, "success");
        break;
      case 326: // BARCODE DETECTED
        if (data.error === 0) {
          setScanResult({ data: data.text, type: data.type });
          addLog(`Barcode Terdeteksi: ${data.text}`, "success");
        }
        break;
      case 2: addLog(data.error === 0 ? "Inisialisasi Plugin Berhasil" : `Gagal: Error ${data.error}`, data.error === 0 ? "success" : "error"); break;
      default:
        if (data.error !== undefined && data.error !== 0) addLog(`Kesalahan SDK: ${data.error}`, "error");
    }
  };

  // --- Aksi Perintah (Sesuai page.js) ---
  const sendCmd = (obj) => {
    if (wsCmd.current?.readyState === WebSocket.OPEN) {
      wsCmd.current.send(JSON.stringify(obj));
    } else {
      addLog("Server Perintah belum terhubung!", "error");
    }
  };

  const initializePlugin = () => sendCmd({ id: 1, license });
  const openCamera = () => sendCmd({ id: 9, index: camFunc.devType });
  const closeCamera = () => sendCmd({ id: 11, index: camFunc.devType });
  const setA4 = (on) => { setIsA4(on); sendCmd({ id: 110, on: on ? 1 : 0 }); };

  const obtainImageFile = () => {
    setIsScanning(true);
    sendCmd({
      id: 13, index: camFunc.devType, file: camFunc.filePath, dpi: camFunc.dpi,
      color: camFunc.colorMode, round: camFunc.keepRound ? 1 : 0, 
      adjust: camFunc.autoAdjust ? 1 : 0, bcr: camFunc.readBarcode ? 1 : 0,
      bpd: camFunc.detectBlank ? 1 : 0, quality: camFunc.jpgQuality, compress: camFunc.tiffCompress
    });
    setTimeout(() => setIsScanning(false), 1500);
  };

  const startBarcodeRecog = () => {
    sendCmd({
      id: 102, freq: 8, left: 0.0, top: 0.0, right: 1.0, bottom: 1.0,
      flag: 2, content: barcodeFile
    });
    addLog("Memulai pengenalan barcode...", "info");
  };

  const stopBarcodeRecog = () => {
    sendCmd({ id: 104 });
    addLog("Deteksi barcode dihentikan.");
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-5 overflow-hidden font-mono">
      
      {/* HEADER: CONNECTIVITY & SDK INIT (MATCH PAGE.JS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
        <div className="border-2 border-[#00ffff]/40 bg-zinc-900/60 p-4 relative rounded-sm shadow-xl flex items-center justify-between">
           <div className="absolute -top-[10px] left-4 bg-white text-black px-3 py-0.5 text-[10px] font-black uppercase z-10">Connectivity</div>
           <div className="flex gap-2">
              <ConnectionBtn label="CMD (25014)" active={connections.cmd} onClick={() => connectSvc('cmd', 25014)} />
              <ConnectionBtn label="MAIN (9999)" active={connections.main} onClick={() => connectSvc('main', 9999)} />
           </div>
           <div className="flex gap-4 text-[10px]">
              <div className="flex flex-col items-end"><span className="text-zinc-500 uppercase">SDK Ver</span><span className="text-[#00ffff] font-black">{sdkVersion || "---"}</span></div>
              <div className="flex flex-col items-end"><span className="text-zinc-500 uppercase">Device ID</span><span className="text-[#00ffff] font-black">{deviceId || "---"}</span></div>
           </div>
        </div>

        <div className="border-2 border-[#00ffff]/40 bg-zinc-900/60 p-4 relative rounded-sm shadow-xl">
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
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col lg:flex-row gap-5 overflow-hidden">
        
        {/* LEFT COLUMN: PREVIEW & LOGS (USER REQUESTED: DO NOT CHANGE POSITION) */}
       

        {/* RIGHT COLUMN: SETTINGS (FROM PAGE.JS) */}
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Menu Kamera */}
              <div className="border-2 border-[#00ffff]/20 bg-zinc-900/40 p-4 rounded-sm relative">
                <div className="absolute -top-[10px] left-4 bg-zinc-800 text-[#00ffff] px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border border-[#00ffff]/20">Kamera</div>
                <div className="flex items-center justify-between p-3 bg-black/40 rounded mb-4 border border-[#00ffff]/5">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase">A4 Size Mode</span>
                  <button 
                    onClick={() => setA4(!isA4)}
                    className={`w-10 h-5 rounded-full transition-all relative ${isA4 ? 'bg-[#00ffff]' : 'bg-zinc-700'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${isA4 ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button onClick={openCamera} className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 py-2.5 rounded-sm text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                    <Play size={12}/> Enable Camera
                  </button>
                  <button onClick={closeCamera} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/40 py-2.5 rounded-sm text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                    <Square size={12}/> Disable Camera
                  </button>
                </div>
              </div>

              {/* Menu Konfigurasi */}
              {/* <div className="border-2 border-[#00ffff]/20 bg-zinc-900/40 p-4 rounded-sm relative">
                <div className="absolute -top-[10px] left-4 bg-zinc-800 text-[#00ffff] px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border border-[#00ffff]/20">Konfigurasi</div>
                <div className="space-y-3 pt-2">
                   <div className="space-y-1">
                      <label className="text-[9px] text-zinc-500 uppercase font-black text-left block">Save Path</label>
                      <div className="flex gap-1">
                         <input type="text" value={camFunc.filePath} onChange={(e) => setCamFunc({...camFunc, filePath: e.target.value})} className="flex-1 bg-black border border-[#00ffff]/20 p-2 text-[10px] text-white outline-none" />
                         <button onClick={() => savePathInputRef.current.click()} className="p-2 bg-zinc-800 border border-[#00ffff]/10 text-zinc-400 hover:text-white"><FolderOpen size={12}/></button>
                         <input type="file" ref={savePathInputRef} className="hidden" onChange={(e) => setCamFunc({...camFunc, filePath: `C:\\${e.target.files[0].name}`})} />
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                         <label className="text-[9px] text-zinc-500 uppercase font-black text-left block">DPI</label>
                         <input type="number" value={camFunc.dpi} onChange={(e) => setCamFunc({...camFunc, dpi: parseInt(e.target.value)})} className="w-full bg-black border border-[#00ffff]/20 p-2 text-[10px] text-white outline-none" />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[9px] text-zinc-500 uppercase font-black text-left block">Mode Warna</label>
                         <select value={camFunc.colorMode} onChange={(e) => setCamFunc({...camFunc, colorMode: parseInt(e.target.value)})} className="w-full bg-black border border-[#00ffff]/20 p-2 text-[10px] text-white outline-none">
                            <option value={0}>Color</option><option value={1}>Optimize</option><option value={2}>Grey</option><option value={3}>B&W</option>
                         </select>
                      </div>
                   </div>
                </div>
              </div> */}
              <div className="border-2 border-[#00ffff]/20 bg-zinc-900/40 p-4 rounded-sm relative">
              <div className="absolute -top-[10px] left-4 bg-zinc-800 text-[#00ffff] px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border border-[#00ffff]/20">Konfigurasi</div>
              <div className="space-y-4 pt-2">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-[9px] text-zinc-500 uppercase font-black">Save Path</label>
                       <div className="flex gap-1">
                          <input type="text" value={camFunc.filePath} onChange={(e) => setCamFunc({...camFunc, filePath: e.target.value})} className="flex-1 bg-black border border-[#00ffff]/20 p-2 text-[10px] text-white outline-none" />
                          <button onClick={() => savePathInputRef.current.click()} className="p-2 bg-zinc-800 border border-[#00ffff]/10 text-zinc-400 hover:text-white"><FolderOpen size={12}/></button>
                          <input type="file" ref={savePathInputRef} className="hidden" onChange={(e) => setCamFunc({...camFunc, filePath: `C:\\${e.target.files[0].name}`})} />
                       </div>
                    </div>
                    <div className="space-y-1">
                       <label className="text-[9px] text-zinc-500 uppercase font-black">DPI / Mode Warna</label>
                       <div className="flex gap-1">
                          <input type="number" value={camFunc.dpi} onChange={(e) => setCamFunc({...camFunc, dpi: parseInt(e.target.value)})} className="w-16 bg-black border border-[#00ffff]/20 p-2 text-[10px] text-white outline-none" />
                          <select value={camFunc.colorMode} onChange={(e) => setCamFunc({...camFunc, colorMode: parseInt(e.target.value)})} className="flex-1 bg-black border border-[#00ffff]/20 p-2 text-[10px] text-white outline-none">
                             <option value={0}>Color</option><option value={1}>Optimize</option><option value={2}>Grey</option><option value={3}>B&W</option>
                          </select>
                       </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <Checkbox label="Keep Corners" checked={camFunc.keepRound} onChange={(v) => setCamFunc({...camFunc, keepRound: v})} />
                    <Checkbox label="Auto Adjust" checked={camFunc.autoAdjust} onChange={(v) => setCamFunc({...camFunc, autoAdjust: v})} />
                    <Checkbox label="Read Barcode" checked={camFunc.readBarcode} onChange={(v) => setCamFunc({...camFunc, readBarcode: v})} />
                    <Checkbox label="Detect Blank" checked={camFunc.detectBlank} onChange={(v) => setCamFunc({...camFunc, detectBlank: v})} />
                 </div>

                 <button onClick={obtainImageFile} disabled={isScanning} className="w-full bg-zinc-800 hover:bg-black border border-[#00ffff]/20 text-white py-2 text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                    {isScanning ? <RefreshCw size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                    Obtain Image File
                 </button>
              </div>
           </div>
           </div>
           
           {/* Camera Control */}
           {/* <div className="border-2 border-[#00ffff]/20 bg-zinc-900/40 p-4 rounded-sm relative">
              <div className="absolute -top-[10px] left-4 bg-zinc-800 text-[#00ffff] px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border border-[#00ffff]/20">Kamera</div>
              <div className="flex items-center justify-between p-3 bg-black/40 rounded mb-4 border border-[#00ffff]/5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">A4 Size Mode</span>
                <button 
                  onClick={() => setA4(!isA4)}
                  className={`w-10 h-5 rounded-full transition-all relative ${isA4 ? 'bg-[#00ffff]' : 'bg-zinc-700'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${isA4 ? 'left-5.5' : 'left-0.5'}`} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={openCamera} className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/40 py-2.5 rounded-sm text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                  <Play size={12}/> Enable Camera
                </button>
                <button onClick={closeCamera} className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/40 py-2.5 rounded-sm text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2">
                  <Square size={12}/> Disable Camera
                </button>
              </div>
           </div> */}

           

           {/* Camera Function Settings */}
           {/* <div className="border-2 border-[#00ffff]/20 bg-zinc-900/40 p-4 rounded-sm relative">
              <div className="absolute -top-[10px] left-4 bg-zinc-800 text-[#00ffff] px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border border-[#00ffff]/20">Konfigurasi</div>
              <div className="space-y-4 pt-2">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-[9px] text-zinc-500 uppercase font-black">Save Path</label>
                       <div className="flex gap-1">
                          <input type="text" value={camFunc.filePath} onChange={(e) => setCamFunc({...camFunc, filePath: e.target.value})} className="flex-1 bg-black border border-[#00ffff]/20 p-2 text-[10px] text-white outline-none" />
                          <button onClick={() => savePathInputRef.current.click()} className="p-2 bg-zinc-800 border border-[#00ffff]/10 text-zinc-400 hover:text-white"><FolderOpen size={12}/></button>
                          <input type="file" ref={savePathInputRef} className="hidden" onChange={(e) => setCamFunc({...camFunc, filePath: `C:\\${e.target.files[0].name}`})} />
                       </div>
                    </div>
                    <div className="space-y-1">
                       <label className="text-[9px] text-zinc-500 uppercase font-black">DPI / Mode Warna</label>
                       <div className="flex gap-1">
                          <input type="number" value={camFunc.dpi} onChange={(e) => setCamFunc({...camFunc, dpi: parseInt(e.target.value)})} className="w-16 bg-black border border-[#00ffff]/20 p-2 text-[10px] text-white outline-none" />
                          <select value={camFunc.colorMode} onChange={(e) => setCamFunc({...camFunc, colorMode: parseInt(e.target.value)})} className="flex-1 bg-black border border-[#00ffff]/20 p-2 text-[10px] text-white outline-none">
                             <option value={0}>Color</option><option value={1}>Optimize</option><option value={2}>Grey</option><option value={3}>B&W</option>
                          </select>
                       </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <Checkbox label="Keep Corners" checked={camFunc.keepRound} onChange={(v) => setCamFunc({...camFunc, keepRound: v})} />
                    <Checkbox label="Auto Adjust" checked={camFunc.autoAdjust} onChange={(v) => setCamFunc({...camFunc, autoAdjust: v})} />
                    <Checkbox label="Read Barcode" checked={camFunc.readBarcode} onChange={(v) => setCamFunc({...camFunc, readBarcode: v})} />
                    <Checkbox label="Detect Blank" checked={camFunc.detectBlank} onChange={(v) => setCamFunc({...camFunc, detectBlank: v})} />
                 </div>

                 <button onClick={obtainImageFile} disabled={isScanning} className="w-full bg-zinc-800 hover:bg-black border border-[#00ffff]/20 text-white py-2 text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                    {isScanning ? <RefreshCw size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                    Obtain Image File
                 </button>
              </div>
           </div> */}

           {/* Barcode Recognition Engine */}
           <div className="border-2 border-[#00ffff]/40 bg-zinc-950 p-5 rounded-sm relative shadow-2xl flex flex-col">
              <div className="absolute -top-[12px] left-6 bg-white text-black px-4 py-0.5 text-[12px] font-black uppercase z-20">Engine BCR</div>
              <div className="space-y-4">
                 <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 uppercase font-black flex items-center gap-2"><FileSearch size={12}/> Analysis Target Path</label>
                    <div className="flex gap-2">
                       <input type="text" value={barcodeFile} onChange={(e) => setBarcodeFile(e.target.value)} className="flex-1 bg-black border border-[#00ffff]/20 p-2 text-[11px] text-[#00ffff] outline-none" />
                       <button onClick={() => barcodePathInputRef.current.click()} className="px-3 bg-zinc-800 border border-[#00ffff]/20 text-zinc-400 hover:text-white transition-all"><FolderOpen size={16}/></button>
                       <input type="file" accept=".jpg,.jpeg" ref={barcodePathInputRef} className="hidden" onChange={(e) => setBarcodeFile(`C:\\${e.target.files[0].name}`)} />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-3">
                    <button onClick={startBarcodeRecog} className="bg-blue-600 hover:bg-blue-700 text-white py-3 text-[11px] font-black uppercase tracking-tighter transition-all active:scale-95 shadow-[0_0_15px_rgba(37,99,235,0.4)] flex items-center justify-center gap-2">
                       <Play size={14} fill="white" /> START BCR
                    </button>
                    <button onClick={stopBarcodeRecog} className="bg-zinc-800 hover:bg-zinc-900 text-zinc-400 py-3 text-[11px] font-black uppercase tracking-tighter transition-all active:scale-95 border border-white/5 flex items-center justify-center gap-2">
                       <Square size={14} fill="currentColor" /> STOP BCR
                    </button>
                 </div>

                 {/* Decoded Stream Result */}
                 {scanResult ? (
                    <div className="bg-[#00ffff]/5 border-l-4 border-[#00ffff] p-4 animate-in fade-in slide-in-from-top-2">
                       <span className="text-[9px] text-[#00ffff]/60 uppercase font-black block mb-1">Result_Output_Value</span>
                       <div className="text-xl text-[#00ffff] break-all font-black leading-none">{scanResult.data}</div>
                    </div>
                 ) : (
                    <div className="border border-white/5 bg-black/40 p-6 flex flex-col items-center justify-center text-zinc-700 opacity-30 italic">
                       <ScanBarcode size={32} className="mb-2" />
                       <span className="text-[10px] uppercase font-black">Awaiting Stream Data_</span>
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
      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-700'}`} />
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
      <span className="text-[10px] font-black text-zinc-500 group-hover:text-zinc-300 transition-colors uppercase">
        {label}
      </span>
    </label>
  );
}

export default BarcodeScannerModule;