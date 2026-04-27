"use client";
import React, { useState, useRef, useEffect } from 'react';
import { 
  Folder, 
  Activity, 
  Wifi, 
  WifiOff, 
  Scan, 
  X, 
  RefreshCw, 
  Database, 
  Cpu, 
  Clock, 
  Play, 
  Square, 
  Key,
  Camera,
  Link as LinkIcon,
  Settings,
  Image as ImageIcon,
  ScanBarcode,
  Terminal
} from 'lucide-react';

/**
 * BarcodeScannerModule (SDK v3.0 Integration)
 * Menggunakan referensi pengaturan kamera dan engine BCR dari page.js
 */
const BarcodeScannerModule = ({ data }) => {
  const [logs, setLogs] = useState([`[SYSTEM] Barcode Dashboard v3.0 Online.`]);
  const [scanMode, setScanMode] = useState("Live_Camera"); 
  const [isScanning, setIsScanning] = useState(false);
  const [isLiveBCR, setIsLiveBCR] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [license, setLicense] = useState("");
  const [isLicenseActive, setIsLicenseActive] = useState(false);
  const [connStatus, setConnStatus] = useState({ cmd: false, mc: false });
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // --- STATE SETTING KAMERA (REFERENSI PAGE.JS) ---
  const [camSettings, setCamSettings] = useState({
    devType: 0, // 0: Main
    filePath: "d:\\barcode_save.jpg",
    dpi: 300,
    colorMode: 0, // 0: Color, 1: Optimize, 2: Grey, 3: B&W
    keepRound: false,
    autoAdjust: false,
    readBarcode: true,
    detectBlank: false,
    jpgQuality: 75,
    tiffCompress: 1 // 1: No Compression
  });

  const wsCmd = useRef(null);
  const wsMc = useRef(null);

  useEffect(() => {
    return () => {
      if (wsCmd.current) wsCmd.current.close();
      if (wsMc.current) wsMc.current.close();
      window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
    };
  }, []);

  // --- SINKRONISASI LOG KE SIDEBAR ---
    useEffect(() => {
      window.dispatchEvent(new CustomEvent('scanner:logs-sync', { detail: logs }));
    }, [logs]);

  const addLog = (msg, type = "info") => {
    const time = new Date().toLocaleTimeString();
    const prefix = type === "error" ? "[ERROR]" : type === "success" ? "[SUCCESS]" : "[INFO]";
    setLogs(p => [`${prefix} ${msg} (${time})`, ...p].slice(0, 50));
  };

  // --- LOGIKA WEBSOCKET SDK (PORT 25014 & 9999) ---
  const connectSDK = (type) => {
    const port = type === 'cmd' ? 25014 : 9999;
    const url = `ws://127.0.0.1:${port}/`;

    try {
      addLog(`Menghubungkan ke ${type.toUpperCase()} di port ${port}...`);
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        setConnStatus(prev => ({ ...prev, [type]: true }));
        addLog(`Terhubung ke Server ${type.toUpperCase()}`, "success");
        
        if (type === 'mc') {
          ws.onmessage = (e) => {
            const imageUrl = 'data:image/jpeg;base64,' + e.data;
            window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: imageUrl }));
          };
        }

        if (type === 'cmd') {
          ws.onmessage = (e) => {
            try {
              const res = JSON.parse(e.data);
              handleSDKResponse(res);
            } catch (err) {}
          };
        }
      };

      ws.onclose = () => {
        setConnStatus(prev => ({ ...prev, [type]: false }));
        addLog(`Koneksi ${type.toUpperCase()} terputus`, "error");
        if (type === 'mc') window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
      };

      if (type === 'cmd') wsCmd.current = ws;
      if (type === 'mc') wsMc.current = ws;

    } catch (e) {
      addLog(`Gagal menyambung: ${e.message}`, "error");
    }
  };

  const handleSDKResponse = (data) => {
    switch (data.id) {
      case 2: // Init Response
        if (data.error === 0 || data.error === 9) {
          setIsLicenseActive(true);
          addLog("Inisialisasi Plugin Berhasil", "success");
        } else {
          addLog(`Gagal Inisialisasi: Error ${data.error}`, "error");
        }
        break;
      case 10: 
        setIsCameraOpen(true);
        addLog("Kamera SDK Aktif"); 
        break;
      case 12: 
        setIsCameraOpen(false);
        addLog("Kamera SDK Dimatikan"); 
        break;
      case 326: // BARCODE DETECTED (ENGINE REFERENSI)
        setScanResult({
          data: data.text,
          type: "Auto-Detected",
          method: "Live Engine ID 102",
          latency: "Real-time"
        });
        addLog(`Barcode Terdeteksi: [${data.text}]`, "success");
        break;
      default:
        if (data.error !== undefined && data.error !== 0) {
          addLog(`Server Notification: ${data.error}`);
        }
    }
  };

  const sendCmd = (obj) => {
    if (wsCmd.current?.readyState === WebSocket.OPEN) {
      wsCmd.current.send(JSON.stringify(obj));
    } else {
      addLog("Gagal: CMD Server tidak terhubung!", "error");
    }
  };

  // --- AKSI PERINTAH (REFERENSI PAGE.JS) ---
  const initializePlugin = () => sendCmd({ id: 1, license });
  const openCamera = () => sendCmd({ id: 9, index: camSettings.devType });
  const closeCamera = () => sendCmd({ id: 11, index: camSettings.devType });

  const startLiveBCR = () => {
    sendCmd({
      id: 102, freq: 8, left: 0.0, top: 0.0, right: 1.0, bottom: 1.0,
      flag: 2, content: camSettings.filePath
    });
    setIsLiveBCR(true);
    addLog("Memulai Live Barcode Recognition (Engine ID 102)...", "success");
  };

  const stopLiveBCR = () => {
    sendCmd({ id: 104 });
    setIsLiveBCR(false);
    addLog("Deteksi Live Barcode Dihentikan (Engine ID 104).");
  };

  const obtainImageFile = () => {
    setIsScanning(true);
    sendCmd({
      id: 13,
      index: camSettings.devType,
      file: camSettings.filePath,
      dpi: parseInt(camSettings.dpi),
      color: camSettings.colorMode,
      round: camSettings.keepRound ? 1 : 0,
      adjust: camSettings.autoAdjust ? 1 : 0,
      bcr: camSettings.readBarcode ? 1 : 0,
      bpd: camSettings.detectBlank ? 1 : 0,
      quality: parseInt(camSettings.jpgQuality),
      compress: camSettings.tiffCompress
    });
    setTimeout(() => setIsScanning(false), 2000);
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-5 overflow-y-auto custom-scrollbar font-mono">
      
      {/* PANEL 1: KONEKSI & LISENSI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border-2 border-[#00ffff]/40 bg-zinc-900/60 p-5 relative rounded-sm shadow-xl">
          <div className="absolute -top-[12px] left-6 bg-white text-black px-4 py-0.5 text-[12px] font-black uppercase z-10">System Connectivity</div>
          <div className="flex flex-col md:flex-row items-end gap-4 mt-2">
            <div className="flex-none space-y-1">
              <label className="text-[11px] text-[#00ffff]/60 uppercase font-black flex items-center gap-1"><LinkIcon size={12} /> Server Ports</label>
              <div className="flex gap-1 h-9 items-center">
                <button onClick={() => connectSDK('cmd')} className={`px-4 h-full text-[11px] border-2 font-black uppercase transition-all ${connStatus.cmd ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_#10b98144]' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}>Cmd (25014)</button>
                <button onClick={() => connectSDK('mc')} className={`px-4 h-full text-[11px] border-2 font-black uppercase transition-all ${connStatus.mc ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_#10b98144]' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}>Media (9999)</button>
              </div>
            </div>
            <div className="flex-1 space-y-1 w-full">
              <label className="text-[11px] text-[#00ffff]/60 uppercase font-black flex items-center gap-1"><Key size={12} /> SDK License</label>
              <div className="flex gap-1 h-9 items-center">
                <input type="text" value={license} onChange={(e) => setLicense(e.target.value)} placeholder="Masukkan Kode Lisensi..." className="flex-1 bg-black border border-[#00ffff]/20 h-full px-3 text-[12px] text-white outline-none focus:border-[#00ffff]/60 font-mono placeholder:opacity-20" />
                <button onClick={initializePlugin} disabled={!connStatus.cmd} className="px-4 h-full bg-white text-black text-[10px] font-black uppercase hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-30">INIT</button>
              </div>
            </div>
          </div>
        </div>

        {/* PANEL 2: CAMERA CONTROL & MODE */}
        <div className="border-2 border-[#00ffff]/40 bg-zinc-900/60 p-5 relative rounded-sm shadow-xl">
           <div className="absolute -top-[12px] left-6 bg-white text-black px-4 py-0.5 text-[12px] font-black uppercase z-10">Operation & Mode</div>
           <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={isCameraOpen ? closeCamera : openCamera} 
                  disabled={!isLicenseActive} 
                  className={`flex-1 py-3 border-2 font-black text-[12px] uppercase flex items-center justify-center gap-2 transition-all ${!isLicenseActive ? 'opacity-30 cursor-not-allowed border-zinc-800 text-zinc-600' : isCameraOpen ? 'bg-red-600 border-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.3)]' : 'bg-emerald-600 border-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]'}`}
                >
                  {isCameraOpen ? <Square size={14} fill="white" /> : <Play size={14} fill="white" />}
                  {isCameraOpen ? "Stop Camera" : "Start Camera"}
                </button>
                <button 
                  onClick={obtainImageFile}
                  disabled={!isCameraOpen || isScanning}
                  className={`py-3 border-2 font-black text-[12px] uppercase flex items-center justify-center gap-2 transition-all ${isCameraOpen && !isScanning ? 'bg-indigo-600 border-indigo-600 text-white hover:brightness-110' : 'bg-zinc-800 border-zinc-700 text-zinc-500'}`}
                >
                  {isScanning ? <RefreshCw size={14} className="animate-spin" /> : <Camera size={14} />}
                  Capture File
                </button>
              </div>
              <select 
                value={scanMode} 
                onChange={(e) => setScanMode(e.target.value)} 
                className="w-full bg-black border-2 border-[#00ffff]/20 text-[11px] p-2.5 text-white outline-none focus:border-[#00ffff] cursor-pointer"
              >
                <option value="Live_Camera">📷 Live Camera Mode (CZUR SDK Engine)</option>
                <option value="Upload_File">📂 Manual File Analysis</option>
              </select>
           </div>
        </div>
      </div>

      {/* PANEL 3: CAMERA FUNCTION SETTINGS (REFERENSI PAGE.JS) */}
      <div className="border-2 border-[#00ffff]/20 bg-black/40 p-5 relative rounded-sm shadow-inner">
        <div className="absolute -top-[10px] left-6 bg-zinc-800 text-[#00ffff] px-3 py-0.5 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-[#00ffff]/20">
          <Settings size={12} /> Camera Function Settings
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6 pt-2">
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase font-black">Save Path (Disk)</label>
            <input type="text" value={camSettings.filePath} onChange={(e) => setCamSettings({...camSettings, filePath: e.target.value})} className="w-full bg-black border border-[#00ffff]/20 p-2 text-[11px] text-[#00ffff] outline-none focus:border-[#00ffff]/50 font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase font-black">DPI Resolution</label>
            <input type="number" value={camSettings.dpi} onChange={(e) => setCamSettings({...camSettings, dpi: e.target.value})} className="w-full bg-black border border-[#00ffff]/20 p-2 text-[11px] text-white outline-none focus:border-[#00ffff]/50" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase font-black">Color Mode</label>
            <select value={camSettings.colorMode} onChange={(e) => setCamSettings({...camSettings, colorMode: parseInt(e.target.value)})} className="w-full bg-black border border-[#00ffff]/20 p-2 text-[11px] text-white outline-none cursor-pointer">
              <option value={0}>Color</option>
              <option value={1}>Optimize</option>
              <option value={2}>Grey Scale</option>
              <option value={3}>B & W</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] text-zinc-500 uppercase font-black">JPG Quality (%)</label>
            <input type="number" value={camSettings.jpgQuality} onChange={(e) => setCamSettings({...camSettings, jpgQuality: e.target.value})} className="w-full bg-black border border-[#00ffff]/20 p-2 text-[11px] text-white outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          {[
            { id: 'keepRound', label: 'Keep Corners' },
            { id: 'autoAdjust', label: 'Auto Adjust' },
            { id: 'readBarcode', label: 'Read Barcode' },
            { id: 'detectBlank', label: 'Detect Blank' }
          ].map((item) => (
            <label key={item.id} className="flex items-center gap-3 cursor-pointer group">
              <div className={`w-4 h-4 border-2 rounded transition-all flex items-center justify-center ${camSettings[item.id] ? 'bg-[#00ffff] border-[#00ffff]' : 'border-zinc-700 group-hover:border-[#00ffff]/40'}`}>
                {camSettings[item.id] && <div className="w-2 h-2 bg-black rounded-full" />}
              </div>
              <input type="checkbox" className="hidden" checked={camSettings[item.id]} onChange={(e) => setCamSettings({...camSettings, [item.id]: e.target.checked})} />
              <span className="text-[10px] font-black text-zinc-500 uppercase group-hover:text-zinc-300">{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* PANEL 4: ENGINE BCR (LIVE DETECT) & OUTPUT */}
      <div className="flex-1 flex flex-col md:flex-row gap-5 min-h-[350px]">
        
        {/* Terminal Logs */}
        {/* <div className="w-full md:w-[350px] border-2 border-[#00ffff]/20 bg-black/90 p-4 flex flex-col rounded-sm overflow-hidden">
            <div className="flex justify-between items-center border-b border-[#00ffff]/10 pb-2 mb-2">
              <div className="flex items-center gap-3 text-[#00ffff] uppercase font-black text-[12px]">
                  <Terminal size={14} className="animate-pulse" />
                  <span>Terminal_Log</span>
              </div>
              <button onClick={() => setLogs([])} className="text-[9px] hover:text-[#00ffff] transition-colors font-black">CLEAR</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 font-mono text-[11px]">
              {logs.map((l, i) => (
                  <div key={i} className={`flex gap-3 leading-tight ${l.includes('[ERROR]') ? 'text-red-400' : l.includes('[SUCCESS]') ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    <span className="opacity-20 shrink-0">{(logs.length - i).toString().padStart(2, '0')}</span>
                    <span className="break-words">{l}</span>
                  </div>
              ))}
            </div>
        </div> */}

        {/* BCR Engine & Output */}
        <div className="h-[300px] flex-1 border-2 border-[#00ffff]/40 bg-zinc-950 flex flex-col rounded-sm relative overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between py-2 px-4 border-b border-[#00ffff]/10 bg-zinc-900/50 shrink-0">
                <div className="flex items-center gap-3 text-[#00ffff] uppercase font-black text-[12px]">
                  <ScanBarcode size={14} />
                  <span>Engine_Output_Stream</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={isLiveBCR ? stopLiveBCR : startLiveBCR} 
                    disabled={!isCameraOpen}
                    className={`px-4 py-1 text-[9px] font-black uppercase rounded-sm border transition-all ${isLiveBCR ? 'bg-red-600 border-red-500 text-white' : 'bg-blue-600 border-blue-500 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)] disabled:opacity-30'}`}
                  >
                    {isLiveBCR ? "Stop BCR" : "Start Live BCR"}
                  </button>
                </div>
            </div>

            <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto custom-scrollbar">
                {scanResult ? (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="bg-[#00ffff]/5 border-l-4 border-[#00ffff] p-6 rounded-r-sm">
                            <span className="text-[10px] text-[#00ffff]/60 uppercase font-black tracking-[0.3em] block mb-3 underline decoration-[#00ffff]/20 underline-offset-4">Decoded Data Value</span>
                            <div className="text-3xl text-[#00ffff] break-all font-black tracking-tighter leading-none py-1">
                                {scanResult.data}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-1 bg-black/40 border border-[#00ffff]/10 rounded-sm overflow-hidden text-[10px]">
                            <div className="flex flex-col p-3 border-r border-[#00ffff]/5">
                                <span className="text-zinc-600 uppercase font-black flex items-center gap-2 mb-1"><Cpu size={12} /> Symbology</span>
                                <span className="text-white font-black">{scanResult.type}</span>
                            </div>
                            <div className="flex flex-col p-3 border-r border-[#00ffff]/5">
                                <span className="text-zinc-600 uppercase font-black flex items-center gap-2 mb-1"><Scan size={12} /> Method</span>
                                <span className="text-white font-black">{scanResult.method}</span>
                            </div>
                            <div className="flex flex-col p-3">
                                <span className="text-zinc-600 uppercase font-black flex items-center gap-2 mb-1"><Clock size={12} /> Latency</span>
                                <span className="text-emerald-400 font-black">{scanResult.latency}</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-20 py-10">
                        <ScanBarcode size={60} className={`text-[#00ffff] mb-4 ${isLiveBCR ? 'animate-pulse' : ''}`} />
                        <span className="text-[14px] font-black uppercase tracking-[0.4em] text-[#00ffff]">{isLiveBCR ? 'Scanning Live...' : 'System Idle'}</span>
                        <span className="text-[9px] text-zinc-600 mt-2 uppercase tracking-[0.5em]">{isLiveBCR ? 'Waiting for pattern match' : 'Activate Live BCR to begin'}</span>
                    </div>
                )}
            </div>
            
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00ffff]/40" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#00ffff]/40" />
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0, 255, 255, 0.2); border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default BarcodeScannerModule;