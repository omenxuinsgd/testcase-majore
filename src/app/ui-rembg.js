"use client";

import React, { useState, useRef } from 'react';
import { Upload, Cpu, Zap, Image as ImageIcon, Crosshair, AlertCircle, Loader2, Palette, Download } from 'lucide-react';

const App = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [model, setModel] = useState('u2net');
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState({ image: null, mask: null });
  const [error, setError] = useState(null);
  
  // State untuk pemilihan warna background
  const [bgColor, setBgColor] = useState('transparent');

  const fileInputRef = useRef(null);
  const imageRef = useRef(null);

  const API_URL = 'http://localhost:5000/api/remove-bg';

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

    setCoords({
      x: Math.round(x * scaleX),
      y: Math.round(y * scaleY)
    });
  };

  // Fungsi untuk mengunduh gambar transparan biasa (untuk Mask)
  const downloadImage = (dataUrl, filename) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Fungsi untuk mengunduh gambar dengan background yang dipilih (Flatten)
  const downloadFlattenedImage = (dataUrl, filename, backgroundColor) => {
    if (backgroundColor === 'transparent') {
      downloadImage(dataUrl, filename);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      // Gambar background warna solid
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Gambar objek di atasnya
      ctx.drawImage(img, 0, 0);

      // Konversi canvas ke URL dan unduh
      const flattenedUrl = canvas.toDataURL('image/png');
      downloadImage(flattenedUrl, filename);
    };
    img.src = dataUrl;
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError("SOURCE_BUFFER_EMPTY: Silahkan unggah gambar terlebih dahulu.");
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
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.status === 'success') {
        setResult({
          image: `data:image/png;base64,${data.image_base64}`,
          mask: `data:image/png;base64,${data.mask_base64}`
        });
      } else {
        setError(data.message || "EXECUTION_FAILED: Terjadi kesalahan pada server.");
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
      {/* Header Section */}
      <header className="max-w-7xl mx-auto flex items-center gap-6 mb-10">
        <img 
          src="https://raw.githubusercontent.com/omenxuinsgd/testcase-majore/refs/heads/main/MIT_Black.png" 
          alt="Logo" 
          className="h-14 filter drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]"
        />
        <div>
          <h1 className="text-4xl md:text-5xl font-black italic tracking-[0.2em] text-[#00ffff] drop-shadow-[0_0_15px_rgba(0,255,255,0.4)] uppercase">
            MAJORE M-ONE AIO
          </h1>
          <p className="text-sm text-gray-400 mt-2 flex items-center gap-2">
            <Zap size={14} className="text-[#00ffff]" />
            &gt; HAPUS & RUBAH BACKGROUND || CORE_STATUS: ACTIVE || ENCRYPTION: ENABLED
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Input & Controls */}
        <div className="space-y-6">
          <div className="bg-[#18181b]/60 border-2 border-[#00ffff]/20 p-4 rounded-sm flex flex-col gap-4">
            <h2 className="text-[#00ffff] text-sm font-bold flex items-center gap-2 mb-2">
              <ImageIcon size={16} /> SOURCE_BUFFER_INPUT
            </h2>
            
            <div 
              onClick={() => fileInputRef.current.click()}
              className="relative aspect-video border-2 border-dashed border-[#00ffff]/10 bg-black/40 cursor-pointer hover:border-[#00ffff]/40 transition-all flex items-center justify-center overflow-hidden group"
            >
              {previewUrl ? (
                <img 
                  ref={imageRef}
                  src={previewUrl} 
                  alt="Preview" 
                  className="w-full h-full object-contain"
                  onClick={handleImageClick}
                />
              ) : (
                <div className="text-center text-gray-500 group-hover:text-[#00ffff]/60">
                  <Upload className="mx-auto mb-2" size={40} />
                  <p className="text-xs uppercase tracking-widest">Klik untuk unggah citra</p>
                </div>
              )}
              {model === 'sam' && previewUrl && (
                <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 text-[10px] text-[#00ffff] border border-[#00ffff]/40">
                  SAM_MODE: Klik pada objek untuk menentukan koordinat
                </div>
              )}
            </div>
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange}
              accept="image/*"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-tighter">Vector_Model_Selection</label>
                <select 
                  value={model} 
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-black border border-[#00ffff]/30 p-2 text-sm outline-none focus:border-[#00ffff] transition-colors"
                >
                  <option value="u2net">u2net (Standard)</option>
                  <option value="isnet-general-use">isnet (General)</option>
                  <option value="sam">sam (Segment Anything)</option>
                </select>
              </div>

              {model === 'sam' && (
                <div className="grid grid-cols-2 gap-2 animate-in fade-in duration-500">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase">Point_X</label>
                    <input 
                      type="number" 
                      value={coords.x} 
                      readOnly 
                      className="w-full bg-black border border-[#00ffff]/30 p-2 text-sm outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase">Point_Y</label>
                    <input 
                      type="number" 
                      value={coords.y} 
                      readOnly 
                      className="w-full bg-black border border-[#00ffff]/30 p-2 text-sm outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SELECTION BACKGROUND COLOR */}
            <div className="space-y-2 mt-2 border-t border-[#00ffff]/10 pt-4">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Palette size={12} className="text-[#00ffff]" /> 
                Background_Color_Preset
              </label>
              <div className="flex flex-wrap gap-3">
                {colorPresets.map((color) => (
                  <button
                    key={color.name}
                    title={color.name}
                    onClick={() => setBgColor(color.value)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${color.class} ${
                      bgColor === color.value ? 'scale-125 border-[#00ffff] ring-2 ring-[#00ffff]/40' : 'border-transparent'
                    }`}
                  />
                ))}
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-[10px] text-gray-500 uppercase">Custom:</span>
                  <input 
                    type="color" 
                    value={bgColor === 'transparent' ? '#000000' : bgColor} 
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-8 h-8 bg-transparent border-none cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <button 
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-[#00ffff] text-black font-black py-3 px-6 mt-2 flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(0,255,255,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  DECODING_IN_PROGRESS...
                </>
              ) : (
                <>
                  <Cpu size={20} />
                  EXECUTE_DECODING
                </>
              )}
            </button>

            {error && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-500/50 text-red-400 text-xs flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="space-y-6">
          {/* Result Panel */}
          <div className="bg-[#18181b]/60 border-2 border-[#00ffff]/20 p-4 rounded-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[#00ffff] text-sm font-bold flex items-center gap-2">
                <Zap size={16} /> DECODED_RESULT
              </h2>
              {result.image && (
                <button 
                  onClick={() => downloadFlattenedImage(result.image, 'majore_result.png', bgColor)}
                  className="p-1 hover:text-[#00ffff] transition-colors flex items-center gap-1 text-[10px] uppercase font-bold"
                  title="Unduh Hasil dengan Latar Belakang"
                >
                  <Download size={16} /> Unduh
                </button>
              )}
            </div>
            <div 
              style={{ backgroundColor: bgColor }}
              className={`aspect-video border border-[#00ffff]/10 flex items-center justify-center relative overflow-hidden transition-colors duration-500 ${
                bgColor === 'transparent' ? 'bg-[url("https://www.transparenttextures.com/patterns/carbon-fibre.png")]' : ''
              }`}
            >
               {result.image ? (
                 <img src={result.image} alt="Result" className="w-full h-full object-contain drop-shadow-2xl" />
               ) : (
                 <div className="text-gray-700 uppercase text-[10px] tracking-[0.3em]">Awaiting_Execution_Stream</div>
               )}
            </div>
          </div>

          {/* Mask Panel */}
          <div className="bg-[#18181b]/60 border-2 border-[#00ffff]/20 p-4 rounded-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[#00ffff] text-sm font-bold flex items-center gap-2">
                <Crosshair size={16} /> ALPHA_CHANNEL_MASK
              </h2>
              {result.mask && (
                <button 
                  onClick={() => downloadImage(result.mask, 'majore_mask.png')}
                  className="p-1 hover:text-[#00ffff] transition-colors flex items-center gap-1 text-[10px] uppercase font-bold"
                  title="Unduh Mask"
                >
                  <Download size={16} /> Unduh
                </button>
              )}
            </div>
            <div className="aspect-video bg-black/40 border border-[#00ffff]/10 flex items-center justify-center relative overflow-hidden">
               {result.mask ? (
                 <img src={result.mask} alt="Mask" className="w-full h-full object-contain brightness-125" />
               ) : (
                 <div className="text-gray-700 uppercase text-[10px] tracking-[0.3em]">Waiting_For_Alpha_Channel</div>
               )}
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto mt-12 pt-8 border-t border-[#00ffff]/10 text-center">
        <p className="text-[10px] text-gray-600 uppercase tracking-widest">
          MAJORE_SYSTEMS v2.0 || 127.0.0.1:5000 || SECURE_GATEWAY_ACTIVE
        </p>
      </footer>
    </div>
  );
};

export default App;