"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyboard, Activity, Printer as PrinterIcon, Loader2, X } from 'lucide-react';

/**
 * ThermalPrinterModule
 * Terintegrasi dengan API Printer: print-text, print-qrcode, print-barcode, dan print-sample.
 */
const ThermalPrinterModule = ({ data, activeTab }) => {
  const [logs, setLogs] = useState([]);
  const [printText, setPrintText] = useState("");
  const [format, setFormat] = useState("text"); // text, qrcode, barcode
  const [isLoading, setIsLoading] = useState(false);
  const [activeInput, setActiveInput] = useState('text');

  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  const showToast = (message, type = "success") => {
    const cleanMsg = message ? message.replace(/\0/g, '').trim() : "Sistem Sibuk";
    setToast({ show: true, message: cleanMsg, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 5000);
  };

  // Ambil API Base URL dari environment variable
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5160";

  useEffect(() => {
    setLogs([`[SYSTEM] Thermal Printer Ready.`, `[API] Base URL: ${API_BASE_URL}`]);
  }, [API_BASE_URL]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '[ERROR]' : type === 'success' ? '[SUCCESS]' : '[INFO]';
    setLogs(prev => [...prev, `${prefix} ${message} (${timestamp})`]);
  };

  const handleKeyClick = (char) => {
    if (activeInput === 'text') setPrintText(prev => prev + char);
  };

  const handleAction = async (endpoint, body = null) => {
    setIsLoading(true);
    showToast("Mengirim perintah cetak...", "success");
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : null,
      });

      if (response.ok) {
        showToast("Proses Cetak Berhasil", "success"); // Toast sukses
        addLog(`Cetak ${endpoint.split('-')[1]} berhasil`, 'success');
      } else {
        showToast("Gagal Mencetak", "error"); // Toast gagal
        const errData = await response.text();
        addLog(`Gagal: ${response.status} - ${errData}`, 'error');
      }
    } catch (error) {
      showToast("Kesalahan Jaringan", "error"); // Toast network error
      addLog(`Network Error: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintSubmit = () => {
    if (!printText && format !== 'sample') {
      showToast("Input teks kosong!", "error"); // Tambahkan toast error
      addLog("Input teks kosong!", "error");
      return;
    }

    // Mapping endpoint berdasarkan format
    switch (format) {
      case 'qrcode':
        showToast("Mengirim perintah cetak QRCode...", "success");
        handleAction('/api/printer/print-qrcode', printText);
        break;
      case 'barcode':
        showToast("Mengirim perintah cetak Barcode...", "success");
        handleAction('/api/printer/print-barcode', printText);
        break;
      default:
        showToast("Mengirim perintah cetak teks...", "success");
        handleAction('/api/printer/print-text', printText);
        break;
    }
  };

  return (
    <div className="flex-1 p-8 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
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

      <div className="flex flex-col lg:flex-row gap-10 items-start">
        {/* VISUAL STATUS */}
        {/* <div className="w-full lg:w-[190px] flex flex-col items-center gap-2 shrink-0">
          <div className="relative w-full aspect-[1.25/1] border-2 border-[#00ffff]/20 bg-zinc-950 overflow-hidden group">
            <img 
              src="https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdTlocWRmemY1c243MG93cmk4bTFsdm1heXJtMmJ2YmVybTMxODJnbiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/kSxi9DiWH4Q8q1Kbql/giphy.gif " 
              alt="Printer Visual" 
              className="w-full h-full object-cover opacity-90"
            />
            <div className="absolute top-0 left-0 w-full h-[1px] bg-[#00ffff]/30 animate-scan-fast pointer-events-none" />
          </div>
          <span className="text-[8px] text-[#00ffff]/40 font-bold uppercase tracking-[0.3em]">Thermal_Service_V.1</span>
        </div> */}

        {/* CONFIGURATION FORM */}
        <div className="flex-1 h-[250px] border-2 border-[#00ffff]/40 bg-zinc-900/60 pt-7 px-6 pb-12 relative font-mono rounded-sm group flex flex-col justify-start gap-4 overflow-visible">
          <div className="absolute -top-[12px] left-6 bg-white text-black px-4 py-0.5 text-[18px] font-black uppercase z-[50]">
            {activeTab === 'text_barcode' ? 'Printing' : 'Quick Actions'}
          </div>
          
          {activeTab === 'text_barcode' ? (
            <>
              <div className="grid grid-cols-2 gap-6 text-left">
                <div className="space-y-1.5">
                  <label className="text-[16px] text-white font-black uppercase tracking-widest block">Select Format</label>
                  <select 
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="w-full bg-black border-2 border-[#00ffff]/20 text-[16px] p-2 text-[#00ffff] outline-none focus:border-[#00ffff] font-moono cursor-pointer"
                  >
                    <option value="text">Text Standard</option>
                    <option value="barcode">Barcode 1D</option>
                    <option value="qrcode">QR Code 2D</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[16px] text-white font-black uppercase tracking-widest block">Payload Data</label>
                  <input 
                    value={printText}
                    onFocus={() => setActiveInput('text')}
                    onChange={(e) => setPrintText(e.target.value)}
                    placeholder="Masukkan data..." 
                    className="w-full bg-black border-2 border-[#00ffff]/20 p-1.5 text-[#00ffff] outline-none font-mono text-[16px] focus:border-[#00ffff] transition-colors" 
                  />
                </div>
              </div>
              <div className="flex gap-4 mt-1">
                <button 
                  disabled={isLoading}
                  onClick={handlePrintSubmit} 
                  className="flex-1 py-2.5 bg-zinc-950 border-3 border-[#00ffff]/30 text-[#00ffff] text-[16px] hover:border-[#00ffff] active:scale-95 uppercase font-black shadow-lg flex items-center justify-center gap-4"
                >
                  {isLoading ? <Loader2 size={18} className="animate-spin" /> : <PrinterIcon size={18} />}
                  {isLoading ? 'Processing...' : 'Execute Print'}
                </button>
              </div>
              <div className="flex gap-4">
               <button 
                 onClick={() => handleAction('/api/printer/print-sample')}
                 className="flex-1 py-2.5 bg-zinc-950 border-3 border-[#00ffff]/30 text-[#00ffff] text-[16px] hover:border-[#00ffff] active:scale-95 uppercase font-black shadow-lg flex items-center justify-center gap-4"
               >
                 {isLoading ? <Loader2 size={12} className="animate-spin" /> : <PrinterIcon size={18} />}
                  {isLoading ? 'Processing...' : 'Print Sample'}
               </button>
               {/* <button 
                 onClick={() => handleAction('/api/test/test-person')}
                 className="flex-1 py-2.5 bg-zinc-950 border-3 border-[#ff00ff]/30 text-[#ff00ff] text-[14px] hover:border-[#ff00ff] active:scale-95 uppercase font-black shadow-lg flex items-center justify-center gap-4"
               >
                 {isLoading ? <Loader2 size={12} className="animate-spin" /> : <PrinterIcon size={18} />}
                  {isLoading ? 'Processing...' : 'Print Sample 2'}
               </button> */}
            </div>
            </>
          ) : (
            <div className="flex-1 flex flex-wrap gap-2 p-1 overflow-y-auto custom-scrollbar">
               <button 
                 onClick={() => handleAction('/api/printer/print-sample')}
                 className="px-4 py-2 bg-black border border-[#00ffff]/30 text-[#00ffff] text-[9px] hover:border-[#00ffff] active:scale-95 uppercase font-black"
               >
                 Print Test Sample
               </button>
               <button 
                 onClick={() => handleAction('/api/test/test-person')}
                 className="px-4 py-2 bg-black border border-[#ff00ff]/30 text-[#ff00ff] text-[9px] hover:border-[#ff00ff] active:scale-95 uppercase font-black"
               >
                 Test Person Data
               </button>
            </div>
          )}
        </div>
      </div>

      {/* LOWER SECTION: KEYBOARD & LOGS */}
      <div className="flex-1 h-[220px] grid grid-cols-1 xl:grid-cols-1 gap-4 h-fit">
        
        {/* <div className="border-2 border-[#00ffff]/20 bg-zinc-950/80 p-4 flex flex-col rounded-sm relative text-left">
          <div className="flex justify-between items-center border-b border-[#00ffff]/10 pb-1 mb-2 font-black text-[#00ffff]/60 uppercase text-[9px] tracking-widest">
            <span>Manual_Input_Registry</span>
            <Keyboard size={12} className="text-[#00ffff]/30" />
          </div>
          <div className="grid grid-cols-10 gap-1 mt-3 select-none">
            {[...Array(30)].map((_, i) => {
              const char = String.fromCharCode(65 + i);
              return (
                <button key={i} onClick={() => handleKeyClick(char)} className="aspect-square border border-[#00ffff]/30 bg-[#00ffff]/5 text-[8px] flex items-center justify-center text-[#00ffff] hover:bg-[#00ffff] hover:text-black transition-all active:scale-90">{char}</button>
              );
            })}
          </div>
          <button onClick={() => setPrintText("")} className="mt-3 py-1 border border-[#ff00ff]/40 text-[#ff00ff] text-[8px] uppercase font-bold hover:bg-[#ff00ff]/10">Clear Input</button>
        </div> */}

        <div className="border-2 border-[#00ffff]/20 bg-black/90 pl-6 p-3 flex flex-col rounded-sm relative overflow-hidden shadow-inner text-left font-mono text-[12px] text-zinc-400">
          <div className="text-[18px] text-[#00ffff] font-black mb-2 uppercase flex items-center gap-2 border-b border-[#00ffff]/10 pb-1 tracking-widest">
             <Activity size={18} className="animate-pulse" />
             <span>Logs Output</span>
          </div>
          <div className="flex-1 p-2 overflow-y-auto space-y-1 custom-scrollbar min-h-[120px]">
            {logs.slice(-10).map((log, idx) => (
              <div key={idx} className="flex gap-2 leading-none">
                <span className="opacity-20">{(idx + 1).toString().padStart(2, '0')}</span>
                <span className={log.includes('SUCCESS') ? 'text-emerald-400' : log.includes('ERROR') ? 'text-red-500' : ''}>{log}</span>
              </div>
            ))}
            <div className="animate-pulse text-[#00ffff] font-black">_</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThermalPrinterModule;