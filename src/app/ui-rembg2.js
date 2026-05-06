"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Cpu, Zap, Image as ImageIcon, Crosshair, AlertCircle, Loader2, Palette, Download, Video, VideoOff } from 'lucide-react';

const App = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [model, setModel] = useState('u2net');
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState({ image: null, mask: null });
  const [error, setError] = useState(null);
  const [bgColor, setBgColor] = useState('transparent');

  // --- STATE BARU UNTUK MODE INPUT & LIVE CAMERA ---
  const [inputMode, setInputMode] = useState('upload'); // 'upload' atau 'live'
  const [isLiveActive, setIsLiveActive] = useState(false);
  const pollingRef = useRef(null);
  const cameraCanvasRef = useRef(null);

  const fileInputRef = useRef(null);
  const imageRef = useRef(null);

  const API_URL = 'http://localhost:5000/api/remove-bg';
  const CAMERA_API_URL = "http://localhost:5160/api/face/capture"; // URL API Kamera

  // --- LOGIKA LIVE CAMERA (POLLING API) ---
  const startLiveCamera = () => {
    if (pollingRef.current) return;
    setIsLiveActive(true);
    setError(null);
    setResult({ image: null, mask: null });

    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${CAMERA_API_URL}?t=${Date.now()}`);
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setPreviewUrl(url);
          // Set as selected file for submission
          const file = new File([blob], "live_capture.jpg", { type: "image/jpeg" });
          setSelectedFile(file);
        }
      } catch (err) {
        console.error("Camera API Error:", err);
      }
    }, 200); // Polling setiap 200ms
  };

  const stopLiveCamera = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setIsLiveActive(false);
  };

  // Cleanup saat komponen unmount
  useEffect(() => {
    return () => stopLiveCamera();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult({ image: null, mask: null });
      setError(null);
    }
  };

  const handleImageClick = (e) => {
    if (model !== 'sam' || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    const scaleX = imageRef.current.naturalWidth / rect.width;
    const scaleY = imageRef.current.naturalHeight / rect.height;
    setCoords({ x: Math.round(x * scaleX), y: Math.round(y * scaleY) });
  };

  const downloadImage = (dataUrl, filename) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadFlattenedImage = (dataUrl, filename, backgroundColor) => {
    if (backgroundColor === 'transparent') {
      downloadImage(dataUrl, filename);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      downloadImage(canvas.toDataURL('image/png'), filename);
    };
    img.src = dataUrl;
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError("SOURCE_BUFFER_EMPTY: Silahkan unggah gambar atau aktifkan kamera.");
      return;
    }
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('model', model);
    formData.append('x', coords.x);
    formData.append('y', coords.y);

    try {
      const response = await fetch(API_URL, { method: 'POST', body: formData });
      const data = await response.json();
      if (data.status === 'success') {
        setResult({
          image: `data:image/png;base64,${data.image_base64}`,
          mask: `data:image/png;base64,${data.mask_base64}`
        });
        if (inputMode === 'live') stopLiveCamera(); // Hentikan live jika sudah diproses
      } else {
        setError(data.message || "EXECUTION_FAILED: Kesalahan server.");
      }
    } catch (err) {
      setError("CONNECTION_LOST: Pastikan Flask API berjalan di port 5000.");
    } finally {
      setLoading(false);
    }
  };

  const colorPresets = [
    { name: 'Transparan', value: 'transparent', class: 'bg-transparent border-white/20' },
    { name: 'Putih', value: '#ffffff', class: 'bg-white' },
    { name: 'Hitam', value: '#000000', class: 'bg-black border-white/10' },
    { name: 'Cyber Blue', value: '#00ffff', class: 'bg-[#00ffff]' },
    { name: 'Neon Pink', value: '#ff00ff', class: 'bg-[#ff00ff]' },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-mono p-4 md:p-8">
      <header className="max-w-7xl mx-auto flex items-center gap-6 mb-10">
        <img src="https://raw.githubusercontent.com/omenxuinsgd/testcase-majore/refs/heads/main/MIT_Black.png" alt="Logo" className="h-14 filter drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]" />
        <div>
          <h1 className="text-4xl md:text-5xl font-black italic tracking-[0.2em] text-[#00ffff] drop-shadow-[0_0_15px_rgba(0,255,255,0.4)] uppercase">MAJORE M-ONE AIO</h1>
          <p className="text-sm text-gray-400 mt-2 flex items-center gap-2"><Zap size={14} className="text-[#00ffff]" /> &gt; HAPUS & RUBAH BACKGROUND || MODE: {inputMode.toUpperCase()}</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-[#18181b]/60 border-2 border-[#00ffff]/20 p-4 rounded-sm flex flex-col gap-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-[#00ffff] text-sm font-bold flex items-center gap-2">
                <ImageIcon size={16} /> SOURCE_BUFFER_INPUT
              </h2>
              {/* TAB SWITCHER */}
              <div className="flex bg-black/40 p-1 rounded-sm border border-[#00ffff]/10">
                <button 
                  onClick={() => { setInputMode('upload'); stopLiveCamera(); }}
                  className={`px-3 py-1 text-[10px] uppercase font-bold transition-all ${inputMode === 'upload' ? 'bg-[#00ffff] text-black' : 'text-gray-500 hover:text-white'}`}
                >Upload</button>
                <button 
                  onClick={() => setInputMode('live')}
                  className={`px-3 py-1 text-[10px] uppercase font-bold transition-all ${inputMode === 'live' ? 'bg-[#00ffff] text-black' : 'text-gray-500 hover:text-white'}`}
                >Live Camera</button>
              </div>
            </div>
            
            {inputMode === 'upload' ? (
              <div 
                onClick={() => fileInputRef.current.click()}
                className="relative aspect-video border-2 border-dashed border-[#00ffff]/10 bg-black/40 cursor-pointer hover:border-[#00ffff]/40 transition-all flex items-center justify-center overflow-hidden group"
              >
                {previewUrl ? (
                  <img ref={imageRef} src={previewUrl} alt="Preview" className="w-full h-full object-contain" onClick={handleImageClick} />
                ) : (
                  <div className="text-center text-gray-500 group-hover:text-[#00ffff]/60">
                    <Upload className="mx-auto mb-2" size={40} />
                    <p className="text-xs uppercase tracking-widest">Klik untuk unggah citra</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative aspect-video border-2 border-[#00ffff]/20 bg-black overflow-hidden flex items-center justify-center">
                {isLiveActive ? (
                  <img ref={imageRef} src={previewUrl} alt="Live Stream" className="w-full h-full object-contain scale-x-[-1]" /> // Mirroring
                ) : (
                  <div className="text-center text-gray-700 uppercase text-xs tracking-widest flex flex-col items-center gap-3">
                    <VideoOff size={40} className="opacity-20" />
                    Sensor Optik Non-Aktif
                  </div>
                )}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  <button 
                    onClick={isLiveActive ? stopLiveCamera : startLiveCamera}
                    className={`px-4 py-2 text-[10px] font-black uppercase rounded-sm border-2 transition-all ${isLiveActive ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-emerald-500/20 border-emerald-500 text-emerald-500'}`}
                  >
                    {isLiveActive ? 'Stop Sensor' : 'Start Sensor'}
                  </button>
                </div>
              </div>
            )}

            <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*" />

            {/* Model Selection & Coords remains the same */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-tighter">Vector_Model_Selection</label>
                <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-black border border-[#00ffff]/30 p-2 text-sm outline-none focus:border-[#00ffff] transition-colors">
                  <option value="u2net">u2net (Standard)</option>
                  <option value="isnet-general-use">isnet (General)</option>
                  <option value="sam">sam (Segment Anything)</option>
                </select>
              </div>
              {model === 'sam' && (
                <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase">Point_X</label><input type="number" value={coords.x} readOnly className="w-full bg-black border border-[#00ffff]/30 p-2 text-sm outline-none" /></div><div className="space-y-1"><label className="text-[10px] text-gray-500 uppercase">Point_Y</label><input type="number" value={coords.y} readOnly className="w-full bg-black border border-[#00ffff]/30 p-2 text-sm outline-none" /></div></div>
              )}
            </div>

            {/* Background Color & Execute Button remains the same */}
            <div className="space-y-2 mt-2 border-t border-[#00ffff]/10 pt-4">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest flex items-center gap-2"><Palette size={12} className="text-[#00ffff]" /> Background_Color_Preset</label>
              <div className="flex flex-wrap gap-3">
                {colorPresets.map((color) => (
                  <button key={color.name} title={color.name} onClick={() => setBgColor(color.value)} className={`w-8 h-8 rounded-full border-2 transition-all ${color.class} ${bgColor === color.value ? 'scale-125 border-[#00ffff] ring-2 ring-[#00ffff]/40' : 'border-transparent'}`} />
                ))}
                <div className="flex items-center gap-2 ml-auto"><span className="text-[10px] text-gray-500 uppercase">Custom:</span><input type="color" value={bgColor === 'transparent' ? '#000000' : bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-8 h-8 bg-transparent border-none cursor-pointer" /></div>
              </div>
            </div>

            <button onClick={handleSubmit} disabled={loading || (inputMode === 'live' && !isLiveActive)} className="w-full bg-[#00ffff] text-black font-black py-3 px-6 mt-2 flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,255,255,0.5)] transition-all disabled:opacity-50 uppercase tracking-widest">
              {loading ? <><Loader2 className="animate-spin" size={20} /> DECODING_IN_PROGRESS...</> : <><Cpu size={20} /> EXECUTE_DECODING</>}
            </button>

            {error && <div className="mt-4 p-3 bg-red-900/20 border border-red-500/50 text-red-400 text-xs flex items-start gap-2"><AlertCircle size={16} className="shrink-0" /><span>{error}</span></div>}
          </div>
        </div>

        {/* Right Column: Results remains the same */}
        <div className="space-y-6">
          <div className="bg-[#18181b]/60 border-2 border-[#00ffff]/20 p-4 rounded-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[#00ffff] text-sm font-bold flex items-center gap-2"><Zap size={16} /> DECODED_RESULT</h2>
              {result.image && <button onClick={() => downloadFlattenedImage(result.image, 'majore_result.png', bgColor)} className="p-1 hover:text-[#00ffff] transition-colors flex items-center gap-1 text-[10px] uppercase font-bold"><Download size={16} /> Unduh</button>}
            </div>
            <div style={{ backgroundColor: bgColor }} className={`aspect-video border border-[#00ffff]/10 flex items-center justify-center relative overflow-hidden transition-colors duration-500 ${bgColor === 'transparent' ? 'bg-[url("https://www.transparenttextures.com/patterns/carbon-fibre.png")]' : ''}`}>
               {result.image ? <img src={result.image} alt="Result" className="w-full h-full object-contain drop-shadow-2xl" /> : <div className="text-gray-700 uppercase text-[10px] tracking-[0.3em]">Awaiting_Execution_Stream</div>}
            </div>
          </div>
          <div className="bg-[#18181b]/60 border-2 border-[#00ffff]/20 p-4 rounded-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[#00ffff] text-sm font-bold flex items-center gap-2"><Crosshair size={16} /> ALPHA_CHANNEL_MASK</h2>
              {result.mask && <button onClick={() => downloadImage(result.mask, 'majore_mask.png')} className="p-1 hover:text-[#00ffff] transition-colors flex items-center gap-1 text-[10px] uppercase font-bold"><Download size={16} /> Unduh</button>}
            </div>
            <div className="aspect-video bg-black/40 border border-[#00ffff]/10 flex items-center justify-center relative overflow-hidden">
               {result.mask ? <img src={result.mask} alt="Mask" className="w-full h-full object-contain brightness-125" /> : <div className="text-gray-700 uppercase text-[10px] tracking-[0.3em]">Waiting_For_Alpha_Channel</div>}
            </div>
          </div>
        </div>
      </main>
      <footer className="max-w-7xl mx-auto mt-12 pt-8 border-t border-[#00ffff]/10 text-center">
        <p className="text-[10px] text-gray-600 uppercase tracking-widest">MAJORE_SYSTEMS v2.0 || 127.0.0.1:5000 || SECURE_GATEWAY_ACTIVE</p>
      </footer>
    </div>
  );
};

export default App;