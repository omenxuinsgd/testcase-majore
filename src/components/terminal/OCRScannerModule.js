"use client";
import React, { useRef, useState, useEffect } from 'react';
import { 
  Folder, 
  Scan, 
  X, 
  FileText, 
  RefreshCw, 
  BookOpen,
  Table as TableIcon,
  Camera,
  Play,
  Square,
  ImageIcon,
  Terminal as TerminalIcon,
  Activity,
  Trash2
} from 'lucide-react';

/**
 * OCRScannerModule (Browser Camera + Polygon Edge Detection)
 * Diperbarui: Menambahkan Terminal Log sesuai referensi PassportScannerModule.
 */
const App = ({ data, setLogs: setGlobalLogs }) => {
  const [inputMode, setInputMode] = useState('camera'); // 'camera' atau 'file'
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [subTab, setSubTab] = useState('text');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [hasFileBuffer, setHasFileBuffer] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  // const [logs, setLogs] = useState([`[SYSTEM] Passport Intelligence v1.7 Online.`]);

  // State Log Lokal (Sesuai Referensi)
  const [logs, setLogs] = useState([`[SYSTEM] OCR Intelligence v2.1 Online.`]);

  // Refs untuk Camera & Canvas logic
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const resultCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // State untuk Polygon (Draggable Points)
  const [polygon, setPolygon] = useState(null);
  const draggingPointIndex = useRef(-1);
  const dragOffset = useRef({ x: 0, y: 0 });

  const BASE_URL = "http://localhost:5160";

  // Helper untuk menambahkan log
  const addModuleLog = (msg, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === "error" ? "[ERROR]" : type === "success" ? "[SUCCESS]" : "[INFO]";
    const newLog = `${prefix} ${msg} (${timestamp})`;
    setLogs(prev => [newLog, ...prev].slice(0, 50));
    
    // Sinkronisasi ke sidebar global jika prop tersedia
    if (setGlobalLogs) {
      setGlobalLogs(prev => [newLog, ...prev]);
    }
  };

  // --- LOGIKA KAMERA ---
  const startCamera = async () => {
    try {
      addModuleLog("Memulai inisialisasi kamera browser...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 3264 }, height: { ideal: 2448 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
        addModuleLog("Kamera berhasil diaktifkan.", "success");
      }
    } catch (err) {
      addModuleLog(`Akses kamera ditolak: ${err.message}`, "error");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsCameraActive(false);
      addModuleLog("Aliran kamera dihentikan.");
      window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
    }
  };

  // --- IMAGE FILTERS ---
  const sharpen = (ctx, w, h) => {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    const copy = new Uint8ClampedArray(data);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const i = ((y + ky) * w + (x + kx)) * 4 + c;
              const k = kernel[(ky + 1) * 3 + (kx + 1)];
              sum += copy[i] * k;
            }
          }
          const i = (y * width + x) * 4 + c;
          data[i] = Math.min(255, Math.max(0, sum));
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  };

  // --- POLYGON INTERACTION ---
  const getMousePos = (canvas, e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e) => {
    if (!polygon || !canvasRef.current) return;
    const pos = getMousePos(canvasRef.current, e);
    let index = -1;
    let minDist = Infinity;
    polygon.forEach((p, i) => {
      const dist = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (dist < 40 && dist < minDist) {
        minDist = dist;
        index = i;
      }
    });
    if (index !== -1) {
      draggingPointIndex.current = index;
      dragOffset.current = { x: polygon[index].x - pos.x, y: polygon[index].y - pos.y };
    }
  };

  const handleMouseMove = (e) => {
    if (draggingPointIndex.current === -1 || !polygon || !canvasRef.current) return;
    const pos = getMousePos(canvasRef.current, e);
    const newPoly = [...polygon];
    newPoly[draggingPointIndex.current] = {
      x: Math.max(0, Math.min(canvasRef.current.width, pos.x + dragOffset.current.x)),
      y: Math.max(0, Math.min(canvasRef.current.height, pos.y + dragOffset.current.y))
    };
    setPolygon(newPoly);
  };

  const handleMouseUp = () => { draggingPointIndex.current = -1; };

  // --- SINKRONISASI LOG KE SIDEBAR ---
    useEffect(() => {
      window.dispatchEvent(new CustomEvent('scanner:logs-sync', { detail: logs }));
    }, [logs]);
  
    const addLog = (msg, type = "info") => {
      const timestamp = new Date().toLocaleTimeString();
      const prefix = type === "error" ? "[ERROR]" : type === "success" ? "[SUCCESS]" : "[INFO]";
      setLogs(prev => [`${prefix} ${msg} (${timestamp})`, ...prev].slice(0, 50));
    };
    
  // --- LOOP ANIMASI PREVIEW ---
  useEffect(() => {
    let animationFrame;
    const detect = () => {
      if (isCameraActive && videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        if (video.videoWidth > 0) {
          canvas.width = 800;
          canvas.height = 600;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          if (!polygon) {
            setPolygon([
              { x: canvas.width * 0.15, y: canvas.height * 0.2 },
              { x: canvas.width * 0.85, y: canvas.height * 0.2 },
              { x: canvas.width * 0.85, y: canvas.height * 0.85 },
              { x: canvas.width * 0.15, y: canvas.height * 0.85 }
            ]);
          }

          if (polygon) {
            ctx.strokeStyle = "#00ffff";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(polygon[0].x, polygon[0].y);
            polygon.forEach(p => ctx.lineTo(p.x, p.y));
            ctx.closePath();
            ctx.stroke();
            polygon.forEach(p => {
              ctx.fillStyle = "#ff0000";
              ctx.beginPath();
              ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
              ctx.fill();
            });
          }

          const previewData = canvas.toDataURL('image/jpeg', 0.5);
          window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: previewData }));
        }
      }
      animationFrame = requestAnimationFrame(detect);
    };
    detect();
    return () => cancelAnimationFrame(animationFrame);
  }, [isCameraActive, polygon]);

  // --- HANDLERS ---
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setSelectedFile(file);
      setHasFileBuffer(true);
      window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: url }));
      addModuleLog(`Berkas dimuat: ${file.name}`, "success");
    }
  };

  const handleExtract = async () => {
    if (inputMode === 'camera' && (!isCameraActive || !polygon)) return;
    if (inputMode === 'file' && !selectedFile) return;

    setIsProcessing(true);
    addModuleLog("Menjalankan pemrosesan citra & OCR Engine...");

    try {
      const resCanvas = resultCanvasRef.current;
      const ctx = resCanvas.getContext('2d');
      let blob;

      if (inputMode === 'camera') {
        const video = videoRef.current;
        const xs = polygon.map(p => p.x);
        const ys = polygon.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const w = maxX - minX;
        const h = maxY - minY;

        const scaleX = video.videoWidth / 800;
        const scaleY = video.videoHeight / 600;

        resCanvas.width = w * scaleX;
        resCanvas.height = h * scaleY;
        ctx.drawImage(video, minX * scaleX, minY * scaleY, w * scaleX, h * scaleY, 0, 0, resCanvas.width, resCanvas.height);
        
        blob = await new Promise(r => resCanvas.toBlob(r, 'image/jpeg', 0.95));
      } else {
        blob = selectedFile;
      }

      const formData = new FormData();
      formData.append("image", blob, "capture.jpg");

      const response = await fetch(`${BASE_URL}/api/ocr/doc_img`, {
        method: "POST",
        body: formData
      });

      if (!response.ok) throw new Error("Gagal menghubungi server OCR.");
      const json = await response.json();

      setExtractedData({
        text: json.raw ? json.raw.split('\n') : ["[Data Kosong]"],
        visualization_base64: "data:image/jpeg;base64," + json.image,
        markdown_source: json.raw || ""
      });
      addModuleLog("Ekstraksi OCR berhasil diselesaikan.", "success");

    } catch (err) {
      addModuleLog(`Ekstraksi Gagal: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const renderResultContent = () => {
    if (!extractedData) return (
      <div className="flex flex-col items-center justify-center h-full opacity-20 py-10">
        <Scan size={48} className={isProcessing ? "animate-pulse text-[#00ffff]" : ""} />
        <span className="text-[12px] font-black uppercase tracking-[0.3em] mt-4">Menunggu Output Data</span>
      </div>
    );

    return (
      <div className="w-full animate-in fade-in duration-500 overflow-y-auto custom-scrollbar h-full text-left">
        {subTab === 'text' && (
          <div className="space-y-1">
            {extractedData.text.map((line, i) => (
              <div key={i} className="flex gap-4 group">
                <span className="text-[10px] text-zinc-700 w-6 shrink-0 mt-1">{i+1}</span>
                <span className="text-[13px] text-[#00ffff]">{line}</span>
              </div>
            ))}
          </div>
        )}
        {subTab === 'visual' && (
          <div className="flex justify-center">
             <img src={extractedData.visualization_base64} className="max-w-full border-2 border-[#00ffff]/20 rounded" alt="OCR Visual" />
          </div>
        )}
        {subTab === 'markdown' && (
          <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap">{extractedData.markdown_source}</pre>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar font-mono">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start shrink-0">
        
        {/* PANEL KONTROL */}
        <div className="border-2 border-[#00ffff]/40 bg-zinc-900/60 p-5 relative rounded-sm shadow-2xl flex flex-col gap-4">
          <div className="absolute -top-[12px] left-6 bg-white text-black px-4 py-0.5 text-[12px] font-black uppercase z-20 shadow-md">OCR Control Panel</div>
          
          <div className="space-y-4">
            <div className="space-y-2 text-left">
              <label className="text-[11px] text-[#00ffff]/60 font-black block uppercase tracking-widest">Metode Input:</label>
              <select 
                value={inputMode}
                onChange={(e) => {
                   setInputMode(e.target.value);
                   if (e.target.value === 'file') stopCamera();
                }}
                className="w-full bg-black border-2 border-[#00ffff]/20 p-2.5 text-[#00ffff] text-[12px] font-black uppercase outline-none focus:border-[#00ffff] transition-all cursor-pointer"
              >
                <option value="camera">📷 Live Camera (Polygon Mode)</option>
                <option value="file">📂 Unggah Berkas Lokal</option>
              </select>
            </div>

            {inputMode === 'camera' ? (
              <div className="relative aspect-[4/3] bg-black border-2 border-[#00ffff]/10 overflow-hidden group cursor-crosshair rounded-sm">
                <video ref={videoRef} autoPlay playsInline className="hidden" />
                <canvas 
                  ref={canvasRef} 
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  className="w-full h-full object-contain" 
                />
                {!isCameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/80">
                    <Camera size={40} className="text-zinc-800" />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <button 
                  onClick={() => fileInputRef.current.click()} 
                  className={`py-10 border-2 border-dashed text-[12px] px-4 font-black transition-all flex flex-col items-center justify-center gap-3 group rounded-sm ${hasFileBuffer ? 'border-[#00ffff] bg-[#00ffff]/10 text-[#00ffff]' : 'border-[#00ffff]/40 bg-[#00ffff]/5 text-zinc-500 hover:text-[#00ffff]'}`}
                >
                  <Folder size={32} />
                  <span>{hasFileBuffer ? "Ganti Gambar" : "Klik Untuk Memilih Berkas"}</span>
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            {inputMode === 'camera' && (
              <button 
                onClick={isCameraActive ? stopCamera : startCamera}
                className={`py-3 border-2 font-black text-[12px] uppercase flex items-center justify-center gap-2 transition-all rounded-sm ${isCameraActive ? 'bg-red-600 border-red-600 text-white' : 'bg-emerald-600 border-emerald-600 text-white shadow-[0_0_15px_#10b98144]'}`}
              >
                {isCameraActive ? <Square size={14} /> : <Play size={14} />}
                {isCameraActive ? "Hentikan Kamera" : "Aktifkan Kamera"}
              </button>
            )}
            <button 
              onClick={handleExtract}
              disabled={(inputMode === 'camera' && !isCameraActive) || (inputMode === 'file' && !hasFileBuffer) || isProcessing}
              className={`py-3 border-2 font-black text-[12px] uppercase flex items-center justify-center gap-2 transition-all rounded-sm ${((inputMode === 'camera' && isCameraActive) || (inputMode === 'file' && hasFileBuffer)) && !isProcessing ? 'bg-[#00ffff] border-[#00ffff] text-black shadow-[0_0_15px_#00ffff44]' : 'bg-zinc-800 border-zinc-700 text-zinc-500 disabled:opacity-50'} ${inputMode === 'file' ? 'col-span-2' : ''}`}
            >
              {isProcessing ? <RefreshCw size={14} className="animate-spin" /> : <Scan size={14} />}
              Jalankan OCR
            </button>
          </div>
        </div>

        {/* PANEL HASIL RECOGNITION */}
        <div className="border-2 border-[#00ffff]/40 bg-zinc-900/60 p-5 relative rounded-sm shadow-2xl flex flex-col min-h-[400px]">
           <div className="absolute -top-[12px] left-6 bg-white text-black px-4 py-0.5 text-[12px] font-black uppercase z-20 shadow-md">Data Extraction Stream</div>
           
           <div className="flex gap-1 mb-4 bg-black/40 p-1 border border-[#00ffff]/10">
              {['text', 'visual', 'markdown'].map(t => (
                <button 
                  key={t}
                  onClick={() => setSubTab(t)}
                  className={`flex-1 py-1.5 text-[10px] font-black uppercase transition-all ${subTab === t ? 'bg-[#00ffff] text-black shadow-[inset_0_0_10px_rgba(0,0,0,0.2)]' : 'text-zinc-500 hover:text-[#00ffff]'}`}
                >
                  {t}
                </button>
              ))}
           </div>

           <div className="flex-1 bg-black/60 border border-[#00ffff]/5 p-4 rounded-sm min-h-[300px] shadow-inner">
              {renderResultContent()}
           </div>
        </div>
      </div>

      {/* TERMINAL LOGS (SESUAI REFERENSI PASSPORT SCANNER) */}
      {/* <div className="flex-1 border-2 border-[#00ffff]/40 bg-zinc-950 flex flex-col rounded-sm relative overflow-hidden shadow-2xl min-h-[250px] mt-2">
          <div className="flex items-center justify-between p-4 border-b border-[#00ffff]/20 bg-black/40">
            <div className="flex items-center gap-3">
               <TerminalIcon size={18} className="text-[#00ffff] animate-pulse" />
               <span className="text-[14px] font-black text-[#00ffff] uppercase tracking-widest font-mono">
                  Log Terminal OCR
               </span>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2">
                  <Activity size={12} className="text-[#00ffff]/40 animate-pulse" />
                  <span className="text-[9px] text-zinc-600 uppercase font-black tracking-widest italic">Live Status Link_</span>
               </div>
               <button 
                 onClick={() => setLogs([`[SYSTEM] Terminal logs flushed at ${new Date().toLocaleTimeString()}`])} 
                 className="p-1.5 hover:bg-rose-500/10 text-rose-500/60 hover:text-rose-500 transition-all rounded-sm border border-transparent hover:border-rose-500/30"
                 title="Clear Logs"
               >
                 <Trash2 size={14} />
               </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-black/60 border border-[#00ffff]/5 rounded-sm overflow-auto custom-scrollbar font-mono shadow-inner p-5 text-left">
            <pre className="text-emerald-400 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
              {logs.join('\n')}
              <span className="animate-pulse ml-1">_</span>
            </pre>
          </div>
      </div> */}

      <canvas ref={resultCanvasRef} className="hidden" />

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0, 255, 255, 0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); }
      `}</style>
    </div>
  );
};

export default App;