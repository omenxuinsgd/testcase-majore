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
  Link as LinkIcon
} from 'lucide-react';

/**
 * BarcodeScannerModule (SDK + REST API INTEGRATION)
 * Modul untuk pemindaian barcode dengan dukungan file upload dan Live Camera SDK.
 * Diperbarui: Layout kontrol konektivitas diselaraskan dengan Document Scanner.
 */
const BarcodeScannerModule = ({ data }) => {
  const [logs, setLogs] = useState([`[SYSTEM] Barcode Engine v1.1 Online.`]);
  const [scanMode, setScanMode] = useState("Upload_File"); // "Upload_File" atau "Live_Camera"
  const [isConnected, setIsConnected] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [hasBuffer, setHasBuffer] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const fileInputRef = useRef(null);

  // --- STATE INTEGRASI SDK ---
  const [connStatus, setConnStatus] = useState({ cmd: false, mc: false });
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isLicenseActive, setIsLicenseActive] = useState(false);
  const [license, setLicense] = useState("");
  const [lastFrame, setLastFrame] = useState(null);
  
  const wsCmd = useRef(null);
  const wsMc = useRef(null);

  useEffect(() => {
    checkServerStatus();
    return () => {
      // Cleanup koneksi saat modul ditutup
      if (wsCmd.current) wsCmd.current.close();
      if (wsMc.current) wsMc.current.close();
      window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
    };
  }, []);

  // Reset preview saat ganti mode
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
    if (isCameraOpen) toggleCamera();
    setHasBuffer(false);
    setSelectedFile(null);
  }, [scanMode]);

  const checkServerStatus = async () => {
    try {
      const res = await fetch('http://localhost:8000/', { mode: 'cors' });
      if (res.ok) {
        setIsConnected(true);
        addLog("[SYSTEM] API Barcode Terdeteksi di localhost:8000");
      }
    } catch (err) {
      setIsConnected(false);
      addLog("[ERROR] API Barcode Offline.");
    }
  };

  const addLog = (msg) => {
    setLogs(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p].slice(0, 50));
  };

  // --- LOGIKA WEBSOCKET SDK ---
  const connectSDK = (type) => {
    const ports = { cmd: 25014, mc: 9999 };
    const url = `ws://127.0.0.1:${ports[type]}/`;

    try {
      addLog(`[WS] Menghubungkan ke ${type}...`);
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        setConnStatus(prev => ({ ...prev, [type]: true }));
        addLog(`Terhubung ke SDK ${type.toUpperCase()}`);
        
        if (type === 'mc') {
          ws.onmessage = (e) => {
            const imageUrl = 'data:image/jpeg;base64,' + e.data;
            setLastFrame(imageUrl);
            // Kirim ke preview sidebar
            window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: imageUrl }));
          };
        }
        if (type === 'cmd') {
          ws.onmessage = (e) => {
            try {
              const res = JSON.parse(e.data);
              if (res.id === 2) {
                if (res.error === 0 || res.error === 9) {
                  setIsLicenseActive(true);
                  addLog("Lisensi SDK Berhasil Diaktifkan", "success");
                } else {
                  addLog(`Lisensi Gagal: Kode ${res.error}`, "error");
                }
              }
            } catch (err) {}
          };
        }
      };

      ws.onclose = () => {
        setConnStatus(prev => ({ ...prev, [type]: false }));
        addLog(`Koneksi ${type.toUpperCase()} terputus`);
        if (type === 'mc') window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
      };

      if (type === 'cmd') wsCmd.current = ws;
      if (type === 'mc') wsMc.current = ws;

    } catch (e) {
      addLog(`Koneksi SDK Gagal: ${e.message}`);
    }
  };

  const handleInitSDK = () => {
    if (wsCmd.current?.readyState === WebSocket.OPEN) {
      addLog(`Mengirim kode lisensi...`);
      wsCmd.current.send(JSON.stringify({ id: 1, license: license }));
    } else {
      addLog("Hubungkan CMD Service terlebih dahulu!");
    }
  };

  const toggleCamera = () => {
    if (!connStatus.cmd || !isLicenseActive) {
      addLog("SDK/Lisensi belum siap!");
      return;
    }
    if (isCameraOpen) {
      wsCmd.current.send(JSON.stringify({ id: 11, index: 0 }));
      setIsCameraOpen(false);
      addLog("Kamera SDK ditutup.");
      window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
    } else {
      wsCmd.current.send(JSON.stringify({ id: 9, index: 0 }));
      setIsCameraOpen(true);
      addLog("Membuka kamera SDK...");
    }
  };

  // Helper konversi base64 untuk dikirim ke API
  const base64ToFile = (base64String, filename) => {
    const arr = base64String.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) { u8arr[n] = bstr.charCodeAt(n); }
    return new File([u8arr], filename, { type: mime });
  };

  // --- LOGIKA PEMINDAIAN ---
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setSelectedFile(file);
      setHasBuffer(true);
      window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: url }));
      addLog(`[FILE] Berkas dimuat: ${file.name}`);
    }
  };

  const handleScan = async () => {
    let fileToScan = selectedFile;

    // Jika mode kamera, ambil frame terakhir
    if (scanMode === "Live_Camera") {
      if (!lastFrame) return addLog("Tidak ada frame kamera untuk dipindai.");
      fileToScan = base64ToFile(lastFrame, "camera_capture.jpg");
    }

    if (!fileToScan) {
      addLog("[WARN] Silakan siapkan sumber gambar.");
      return;
    }

    setIsScanning(true);
    addLog("[PROCESS] Menjalankan pemindaian algoritma 1D/2D...");
    setScanResult(null);

    try {
      const formData = new FormData();
      formData.append('file', fileToScan);

      const response = await fetch('http://localhost:8000/scan', {
        method: 'POST',
        body: formData,
        mode: 'cors',
      });

      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

      const result = await response.json();
      
      if (result.status === "success") {
        setScanResult({
            data: result.result?.data || "N/A",
            type: result.result?.type || "Unknown",
            method: result.result?.method || "Standard",
            latency: result.latency_ms || 0
        });
        addLog(`[SUCCESS] Barcode Terdeteksi: ${result.result?.data || "No Data"}`);
      } else {
        addLog(`[ERROR] Pemindaian gagal: ${result.message || "Tidak terdeteksi"}`);
      }
      
    } catch (error) {
      addLog(`[ERROR] Gagal memindai: ${error.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const resetBuffer = () => {
    setSelectedFile(null);
    setHasBuffer(false);
    setScanResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
    addLog("[SYSTEM] Buffer visual dibersihkan.");
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-5 overflow-y-auto custom-scrollbar">
      {/* BAGIAN ATAS: CONTROL PANEL */}
      <div className="flex flex-col lg:flex-row gap-6 items-start shrink-0">
        
        <div className="flex-1 border-2 border-[#00ffff]/40 bg-zinc-900/60 p-5 relative rounded-sm group flex flex-col gap-4 shadow-2xl min-h-[160px] font-mono">
          <div className="absolute -top-[12px] left-6 bg-white text-black px-4 py-0.5 text-[14px] font-black uppercase z-[50]">Capture Control</div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            {/* OPERATIONAL MODE */}
            <div className="space-y-1">
              <label className="text-[12px] text-[#00ffff]/60 font-black block uppercase tracking-widest flex items-center gap-2 py-1">
                <Scan size={12} /> Mode Operasi
              </label>
              <select 
                value={scanMode} 
                onChange={(e) => setScanMode(e.target.value)} 
                className="w-full bg-black border-2 border-[#00ffff]/20 text-[12px] p-2 text-white outline-none focus:border-[#00ffff] cursor-pointer transition-colors"
              >
                <option value="Upload_File">📂 Upload File (Lokal PC)</option>
                <option value="Live_Camera">📷 Live Camera (CZUR SDK)</option>
              </select>
            </div>

            {/* ACTION AREA - UPLOAD FILE ONLY */}
            {scanMode === "Upload_File" && (
              <div className="space-y-1">
                <div className="flex gap-2 h-[38px]">
                  <button 
                    onClick={() => fileInputRef.current.click()} 
                    className={`flex-1 border-2 border-dashed text-[12px] font-black flex items-center justify-center gap-2 transition-all ${hasBuffer ? 'bg-[#00ffff]/20 border-[#00ffff] text-[#00ffff]' : 'bg-[#00ffff]/5 border-[#00ffff]/30 text-zinc-500 hover:border-[#00ffff]'}`}
                  >
                    <Folder size={14} />
                    <span>{hasBuffer ? 'Ganti File' : 'Pilih Gambar'}</span>
                  </button>
                  {hasBuffer && (
                    <button onClick={resetBuffer} className="px-3 bg-red-500/10 border-2 border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white transition-all">
                      <X size={16} />
                    </button>
                  )}
                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                </div>
              </div>
            )}
          </div>

          {/* LIVE CAMERA CONNECTIVITY & LICENSE (REFERENSI DOCUMENT SCANNER) */}
          {scanMode === "Live_Camera" && (
            <div className="flex flex-col md:flex-row items-end gap-4 animate-in fade-in slide-in-from-top-1 duration-300">
               {/* CONNECTIVITY SECTION */}
               <div className="flex-none space-y-1">
                 <label className="text-[12px] text-[#00ffff]/60 uppercase font-black flex items-center gap-1"><LinkIcon size={12} /> Connectivity</label>
                 <div className="flex gap-1 h-9 items-center">
                    <button 
                      onClick={() => connectSDK('cmd')} 
                      className={`px-4 h-full text-[12px] border-2 font-black uppercase transition-all ${connStatus.cmd ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_#10b98144]' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
                    >
                      Cmd
                    </button>
                    <button 
                      onClick={() => connectSDK('mc')} 
                      className={`px-4 h-full text-[12px] border-2 font-black uppercase transition-all ${connStatus.mc ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_#10b98144]' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
                    >
                      Media
                    </button>
                 </div>
               </div>

               {/* LICENSE CODE SECTION */}
               <div className="flex-1 space-y-1 w-full">
                 <label className="text-[12px] text-[#00ffff]/60 uppercase font-black flex items-center gap-1"><Key size={12} /> License Code</label>
                 <div className="flex gap-1 h-9 items-center">
                    <input 
                      type="text" 
                      value={license} 
                      onChange={(e) => setLicense(e.target.value)} 
                      placeholder="Enter SDK License..." 
                      className="flex-1 bg-black border border-[#00ffff]/20 h-full px-3 text-[12px] text-white outline-none focus:border-[#00ffff]/60 font-mono placeholder:opacity-20" 
                    />
                    <button 
                      onClick={handleInitSDK} 
                      disabled={!connStatus.cmd} 
                      className="px-4 h-full bg-white text-black text-[10px] font-black uppercase hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-30"
                    >
                      INIT
                    </button>
                 </div>
               </div>
            </div>
          )}

          {/* START/STOP CAMERA TOGGLE */}
          {scanMode === "Live_Camera" && (
            <div className="mt-2 flex gap-2 animate-in fade-in slide-in-from-bottom-1 duration-500">
               <button 
                 onClick={toggleCamera}
                 disabled={!isLicenseActive}
                 className={`flex-1 py-3 border-2 font-black text-[12px] uppercase flex items-center justify-center gap-2 transition-all ${
                   !isLicenseActive 
                    ? 'opacity-30 cursor-not-allowed border-zinc-800 text-zinc-600' 
                    : isCameraOpen 
                      ? 'bg-red-600 border-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.3)]' 
                      : 'bg-emerald-600 border-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                 }`}
               >
                 {isCameraOpen ? <Square size={14} fill="white" /> : <Play size={14} fill="white" />}
                 {isCameraOpen ? "Stop Camera" : "Start Camera"}
               </button>
            </div>
          )}

          <div className="mt-2 pt-2 border-t border-[#00ffff]/10">
            <button 
              onClick={handleScan}
              disabled={isScanning || (scanMode === "Upload_File" && !hasBuffer) || (scanMode === "Live_Camera" && !isCameraOpen)}
              className={`w-full py-2.5 border-2 font-black uppercase tracking-[0.2em] text-[15px] transition-all flex items-center justify-center gap-3 ${isScanning ? 'bg-zinc-800 border-zinc-700 text-zinc-500' : 'bg-[#00ffff] border-[#00ffff] text-black hover:brightness-110 shadow-[0_0_20px_rgba(0,255,255,0.3)] disabled:opacity-30 disabled:cursor-not-allowed'}`}
            >
              {isScanning ? <RefreshCw size={14} className="animate-spin" /> : <Scan size={14} />}
              <span>{isScanning ? 'Menganalisa...' : 'Jalankan Scan Barcode'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tampilan Bawah: Console & Decoded Output */}
      <div className="flex-1 flex flex-col md:flex-row gap-6 min-h-[320px] mb-2 overflow-hidden pt-2 font-mono">
        
        {/* Console Output */}
        <div className="w-full md:w-[350px] border-2 border-[#00ffff]/20 bg-black/90 p-4 flex flex-col rounded-sm overflow-hidden text-left text-[13px] text-zinc-400 shadow-inner">
            <div className="flex justify-between items-center border-b border-[#00ffff]/10 pb-1.5 mb-2">
              <div className="flex items-center gap-3 text-[#00ffff] uppercase font-black">
                  <Activity size={12} className="animate-pulse" />
                  <span>Log_Terminal</span>
              </div>
              <button onClick={() => setLogs([`[SYSTEM] Log cleared.`])} className="text-[9px] hover:text-[#00ffff] transition-colors">CLEAR</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
              {logs.map((l, i) => (
                  <div key={i} className={`flex gap-3 leading-tight ${l.includes('[ERROR]') ? 'text-red-400' : l.includes('[SUCCESS]') ? 'text-emerald-400' : ''}`}>
                    <span className="opacity-30">{(logs.length - i).toString().padStart(2, '0')}</span>
                    <span className="break-all">{l}</span>
                  </div>
              ))}
            </div>
        </div>

        {/* Decoded Output */}
        <div className="flex-1 border-2 border-[#00ffff]/40 bg-zinc-950 flex flex-col rounded-sm relative overflow-hidden shadow-2xl">
            <div className="flex items-center gap-3 text-[#00ffff] py-2 px-4 uppercase font-black border-b border-[#00ffff]/10 bg-zinc-900/50 shrink-0">
                <Database size={12} />
                <span>Decoded_Data_Stream</span>
            </div>

            <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
                {scanResult ? (
                    <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-500">
                        <div className="bg-[#00ffff]/5 border border-[#00ffff]/40 p-5 rounded-sm">
                            <span className="text-[9px] text-[#00ffff]/60 uppercase font-black tracking-[0.3em] block mb-2 underline decoration-[#00ffff]/20 underline-offset-4">Value</span>
                            <div className="text-2xl text-[#00ffff] break-all font-black tracking-tighter leading-none py-1">
                                {scanResult.data}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-1 text-[11px] bg-black/40 border border-[#00ffff]/10 rounded-sm overflow-hidden">
                            <div className="flex justify-between items-center py-2.5 px-4 border-b border-[#00ffff]/5">
                                <span className="text-zinc-500 uppercase flex items-center gap-3 font-black"><Cpu size={12} /> Symbology</span>
                                <span className="text-white font-black bg-[#00ffff]/10 px-3 py-0.5 border border-[#00ffff]/20">{scanResult.type}</span>
                            </div>
                            <div className="flex justify-between items-center py-2.5 px-4 border-b border-[#00ffff]/5">
                                <span className="text-zinc-500 uppercase flex items-center gap-3 font-black"><Scan size={12} /> Engine</span>
                                <span className="text-white font-black">{scanResult.method}</span>
                            </div>
                            <div className="flex justify-between items-center py-2.5 px-4">
                                <span className="text-zinc-500 uppercase flex items-center gap-3 font-black"><Clock size={12} /> Latency</span>
                                <span className="text-emerald-400 font-black">{scanResult.latency} ms</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30">
                        <Scan size={40} className="text-[#00ffff] mb-3 animate-pulse" />
                        <span className="text-[11px] font-black uppercase tracking-[0.4em] text-[#00ffff]">System_Idle</span>
                        <span className="text-[8px] text-zinc-600 mt-2 uppercase tracking-[0.5em]">Waiting_For_Input</span>
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