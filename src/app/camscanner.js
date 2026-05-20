"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, Download, Image as ImageIcon, FileText, Trash2, CheckCircle, AlertCircle, XCircle, Loader2, Settings, Sparkles, Check, Crop } from 'lucide-react';

const FILTERS = {
  original: 'none',
  grayscale: 'grayscale(100%)',
  highContrast: 'contrast(150%) brightness(110%) grayscale(100%)',
  magic: 'contrast(120%) saturate(120%) brightness(110%)',
  bw: 'threshold'
};

// === SOLVER MATRIKS PERSAMAAN LINIER UNTUK PERSPEKTIF WARPING ===
const solveHomography = (src, dst) => {
  const M = [];
  const Y = [];
  for (let i = 0; i < 4; i++) {
    const u = dst[i].x;
    const v = dst[i].y;
    const x = src[i].x;
    const y = src[i].y;
    M.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    M.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    Y.push(x);
    Y.push(y);
  }

  const N = 8;
  const A = M.map((row, i) => [...row, Y[i]]);
  for (let i = 0; i < N; i++) {
    let maxRow = i;
    for (let k = i + 1; k < N; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) {
        maxRow = k;
      }
    }
    const temp = A[i];
    A[i] = A[maxRow];
    A[maxRow] = temp;

    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-10) return null;

    for (let k = 0; k < N; k++) {
      if (k !== i) {
        const factor = A[k][i] / pivot;
        for (let j = i; j <= N; j++) {
          A[k][j] -= factor * A[i][j];
        }
      }
    }
    for (let j = i; j <= N; j++) {
      A[i][j] /= pivot;
    }
  }
  const h = A.map(row => row[N]);
  return {
    a: h[0], b: h[1], c: h[2],
    d: h[3], e: h[4], f: h[5],
    g: h[6], h: h[7]
  };
};

const App = () => {
  // --- STATE MANAJEMEN ---
  const [stream, setStream] = useState(null);
  const [detectionMode, setDetectionMode] = useState('manual'); // 'manual' | 'auto'
  const [originalImage, setOriginalImage] = useState(null); // Menyimpan foto beresolusi tinggi sebelum warp
  const [capturedImage, setCapturedImage] = useState(null); // Menyimpan hasil setelah di-warp
  const [filter, setFilter] = useState('original');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedList, setCapturedList] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // Deteksi Live
  const [liveCorners, setLiveCorners] = useState(null);
  const [noDetectionFrames, setNoDetectionFrames] = useState(0);
  const [stableFrames, setStableFrames] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);

  // Dynamic Aspect Ratios
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const [imageAspectRatio, setImageAspectRatio] = useState(4 / 3);

  // Dragging / Adjusting Corners
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustableCorners, setAdjustableCorners] = useState({
    tl: { x: 15, y: 15 },
    tr: { x: 85, y: 15 },
    br: { x: 85, y: 85 },
    bl: { x: 15, y: 85 }
  });
  const [activeHandle, setActiveHandle] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const adjustContainerRef = useRef(null);

  // Hubungkan stream kamera ke elemen video DOM
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        if (videoRef.current) {
          const width = videoRef.current.videoWidth;
          const height = videoRef.current.videoHeight;
          if (width && height) {
            setVideoAspectRatio(width / height);
          }
          videoRef.current.play().catch(err => console.error("Kamera gagal memutar video:", err));
        }
      };
    }
  }, [stream, isCameraActive]);

  // Hentikan kamera saat unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // --- LOOP DETEKSI CORNER DOKUMEN REAL-TIME ---
  useEffect(() => {
    let intervalId;
    if (isCameraActive && !originalImage && !capturedImage) {
      intervalId = setInterval(async () => {
        if (!videoRef.current || isDetecting) return;
        
        setIsDetecting(true);
        const video = videoRef.current;
        
        // Buat canvas kecil untuk mempercepat request deteksi ke API
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 224;
        tempCanvas.height = 224;
        const ctx = tempCanvas.getContext('2d');
        ctx.drawImage(video, 0, 0, 224, 224);

        tempCanvas.toBlob(async (blob) => {
          if (!blob) {
            setIsDetecting(false);
            return;
          }

          const formData = new FormData();
          formData.append('image', blob, 'frame.jpg');

          try {
            const res = await fetch('http://localhost:5000/api/predict-corner', {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            
            if (data.status === 'success' && data.corners) {
              const origW = data.original_size.width;
              const origH = data.original_size.height;
              
              // Konversi titik sudut absolut ke skala persentase (0-100)
              const mappedPoints = {
                tl: { x: (data.corners.top_left[0] / origW) * 100, y: (data.corners.top_left[1] / origH) * 100 },
                tr: { x: (data.corners.top_right[0] / origW) * 100, y: (data.corners.top_right[1] / origH) * 100 },
                br: { x: (data.corners.bottom_right[0] / origW) * 100, y: (data.corners.bottom_right[1] / origH) * 100 },
                bl: { x: (data.corners.bottom_left[0] / origW) * 100, y: (data.corners.bottom_left[1] / origH) * 100 }
              };

              setLiveCorners(mappedPoints);
              setNoDetectionFrames(0);

              if (detectionMode === 'auto') {
                setStableFrames(prev => {
                  const nextStable = prev + 1;
                  // Jika deteksi stabil selama 3 kali pengecekan berturut-turut, picu auto-capture
                  if (nextStable >= 3) {
                    capturePhoto(mappedPoints);
                    return 0;
                  }
                  return nextStable;
                });
              }
            } else {
              setNoDetectionFrames(prev => {
                const count = prev + 1;
                // Sembunyikan overlay garis jika deteksi hilang lebih dari 2 frame
                if (count > 2) {
                  setLiveCorners(null);
                  setStableFrames(0);
                }
                return count;
              });
            }
          } catch (err) {
            console.error("Gagal melakukan deteksi live:", err);
          } finally {
            setIsDetecting(false);
          }
        }, 'image/jpeg', 0.85);

      }, 700);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isCameraActive, originalImage, capturedImage, isDetecting, detectionMode, liveCorners]);

  const startCamera = async () => {
    setErrorMessage(null);
    setLiveCorners(null);
    setStableFrames(0);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', 
          width: { ideal: 1920 }, 
          height: { ideal: 1080 } 
        },
        audio: false
      });
      setStream(mediaStream);
      setIsCameraActive(true);
      setOriginalImage(null);
      setCapturedImage(null);
      setIsAdjusting(false);
    } catch (err) {
      console.error("Gagal membuka webcam:", err);
      setErrorMessage("Kamera tidak ditemukan atau izin akses ditolak. Pastikan koneksi aman (HTTPS/localhost).");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsCameraActive(false);
    }
  };

  // --- AMBIL FOTO (CAPTURE) ---
  const capturePhoto = (detectedPoints = null) => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Ambil resolusi penuh stream video agar kualitas gambar jernih
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const highResData = canvas.toDataURL('image/jpeg', 0.95);
    
    // Tentukan aspek rasio gambar secara dinamis agar container editor pas presisi
    const img = new Image();
    img.onload = () => {
      setImageAspectRatio(img.width / img.height);
      setOriginalImage(highResData);

      // Tentukan koordinat sudut awal untuk penyesuaian manual
      if (detectedPoints) {
        setAdjustableCorners(detectedPoints);
      } else if (liveCorners) {
        setAdjustableCorners(liveCorners);
      } else {
        // Koordinat default berbentuk persegi di tengah-tengah frame
        setAdjustableCorners({
          tl: { x: 20, y: 20 },
          tr: { x: 80, y: 20 },
          br: { x: 80, y: 80 },
          bl: { x: 20, y: 80 }
        });
      }

      setIsAdjusting(true);
      stopCamera();
    };
    img.src = highResData;
  };

  // --- LOGIKA DRAGGING HANDLES ---
  const handleStartDrag = (cornerKey, e) => {
    e.preventDefault();
    setActiveHandle(cornerKey);
  };

  const handleDrag = (e) => {
    if (!activeHandle || !adjustContainerRef.current) return;

    const rect = adjustContainerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    let x = ((clientX - rect.left) / rect.width) * 100;
    let y = ((clientY - rect.top) / rect.height) * 100;

    // Batasi pergeseran agar tidak keluar area gambar
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));

    setAdjustableCorners(prev => ({
      ...prev,
      [activeHandle]: { x, y }
    }));
  };

  const handleStopDrag = () => {
    setActiveHandle(null);
  };

  // Tambahkan listener dragging global di level window
  useEffect(() => {
    if (activeHandle) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleStopDrag);
      window.addEventListener('touchmove', handleDrag);
      window.addEventListener('touchend', handleStopDrag);
    }
    return () => {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleStopDrag);
      window.removeEventListener('touchmove', handleDrag);
      window.removeEventListener('touchend', handleStopDrag);
    };
  }, [activeHandle]);

  // --- PERSPECTIVE WARPING FRONTEND ---
  const applyPerspectiveWarp = () => {
    if (!originalImage) return;

    const img = new Image();
    img.onload = () => {
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.width;
      srcCanvas.height = img.height;
      const srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(img, 0, 0);

      // Hitung koordinat piksel aktual dari persentase
      const srcPoints = [
        { x: (adjustableCorners.tl.x / 100) * img.width, y: (adjustableCorners.tl.y / 100) * img.height },
        { x: (adjustableCorners.tr.x / 100) * img.width, y: (adjustableCorners.tr.y / 100) * img.height },
        { x: (adjustableCorners.br.x / 100) * img.width, y: (adjustableCorners.br.y / 100) * img.height },
        { x: (adjustableCorners.bl.x / 100) * img.width, y: (adjustableCorners.bl.y / 100) * img.height }
      ];

      // Estimasi dimensi dokumen target berdasarkan jarak antar titik sudut
      const widthTop = Math.hypot(srcPoints[1].x - srcPoints[0].x, srcPoints[1].y - srcPoints[0].y);
      const widthBottom = Math.hypot(srcPoints[2].x - srcPoints[3].x, srcPoints[2].y - srcPoints[3].y);
      const heightLeft = Math.hypot(srcPoints[3].x - srcPoints[0].x, srcPoints[3].y - srcPoints[0].y);
      const heightRight = Math.hypot(srcPoints[2].x - srcPoints[1].x, srcPoints[2].y - srcPoints[1].y);

      let destWidth = Math.round(Math.max(widthTop, widthBottom));
      let destHeight = Math.round(Math.max(heightLeft, heightRight));

      // Batasi dimensi maksimum (misal 1600px) agar performa render interpolasi bilinear di browser tetap responsif
      const MAX_DIMENSION = 1600;
      if (destWidth > MAX_DIMENSION || destHeight > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(destWidth, destHeight);
        destWidth = Math.round(destWidth * scale);
        destHeight = Math.round(destHeight * scale);
      }

      const destCanvas = document.createElement('canvas');
      destCanvas.width = destWidth;
      destCanvas.height = destHeight;
      const destCtx = destCanvas.getContext('2d');

      const dstPoints = [
        { x: 0, y: 0 },
        { x: destWidth - 1, y: 0 },
        { x: destWidth - 1, y: destHeight - 1 },
        { x: 0, y: destHeight - 1 }
      ];

      const coeffs = solveHomography(srcPoints, dstPoints);
      if (!coeffs) {
        console.error("Gagal melakukan komputasi homografi.");
        return;
      }

      const { a, b, c, d, e, f, g, h } = coeffs;
      const srcImgData = srcCtx.getImageData(0, 0, img.width, img.height);
      const srcData = srcImgData.data;
      const destImgData = destCtx.createImageData(destWidth, destHeight);
      const destData = destImgData.data;

      // Jalankan interpolasi bilinear untuk kualitas dokumen terbaik tanpa cacat piksel
      for (let v = 0; v < destHeight; v++) {
        for (let u = 0; u < destWidth; u++) {
          const denom = g * u + h * v + 1;
          const srcX = (a * u + b * v + c) / denom;
          const srcY = (d * u + e * v + f) / denom;

          const x0 = Math.floor(srcX);
          const y0 = Math.floor(srcY);
          const x1 = Math.min(x0 + 1, img.width - 1);
          const y1 = Math.min(y0 + 1, img.height - 1);

          const dx = srcX - x0;
          const dy = srcY - y0;

          if (x0 >= 0 && x1 < img.width && y0 >= 0 && y1 < img.height) {
            const idx00 = (y0 * img.width + x0) * 4;
            const idx10 = (y0 * img.width + x1) * 4;
            const idx01 = (y1 * img.width + x0) * 4;
            const idx11 = (y1 * img.width + x1) * 4;

            const destIdx = (v * destWidth + u) * 4;

            for (let channel = 0; channel < 4; channel++) {
              const val = (1 - dx) * (1 - dy) * srcData[idx00 + channel] +
                          dx * (1 - dy) * srcData[idx10 + channel] +
                          (1 - dx) * dy * srcData[idx01 + channel] +
                          dx * dy * srcData[idx11 + channel];
              destData[destIdx + channel] = val;
            }
          }
        }
      }

      destCtx.putImageData(destImgData, 0, 0);
      setCapturedImage(destCanvas.toDataURL('image/jpeg', 0.95));
      setIsAdjusting(false);
    };
    img.src = originalImage;
  };

  // --- PENERAPAN FILTER GAMBAR ---
  const applyFilterToCanvas = useCallback(() => {
    if (!capturedImage || !previewCanvasRef.current) return;

    const img = new Image();
    img.onload = () => {
      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;

      ctx.filter = FILTERS[filter] === 'threshold' ? 'none' : FILTERS[filter];
      ctx.drawImage(img, 0, 0);

      if (filter === 'threshold') {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const val = avg > 120 ? 255 : 0; 
          data[i] = data[i + 1] = data[i + 2] = val;
        }
        ctx.putImageData(imageData, 0, 0);
      }
    };
    img.src = capturedImage;
  }, [capturedImage, filter]);

  useEffect(() => {
    if (capturedImage) {
      applyFilterToCanvas();
    }
  }, [capturedImage, filter, applyFilterToCanvas]);

  const saveToGallery = () => {
    if (!previewCanvasRef.current) return;
    const finalImage = previewCanvasRef.current.toDataURL('image/jpeg');
    setCapturedList(prev => [...prev, { id: Date.now(), data: finalImage }]);
    setCapturedImage(null);
    setOriginalImage(null);
    startCamera();
  };

  const downloadImage = (data, name = "scan.jpg") => {
    const link = document.createElement('a');
    link.href = data;
    link.download = name;
    link.click();
  };

  // --- EXPORT KOLEKSI GAMBAR MENJADI SATU FILE PDF ---
  const generatePDF = async () => {
    if (capturedList.length === 0) return;
    setIsExporting(true);

    try {
      if (typeof window !== 'undefined' && !window.jspdf) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        document.head.appendChild(script);
        await new Promise((resolve) => { script.onload = resolve; });
      }

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF();

      for (let i = 0; i < capturedList.length; i++) {
        const imgData = capturedList[i].data;
        if (i > 0) pdf.addPage();
        
        const img = new Image();
        img.src = imgData;
        await new Promise(resolve => img.onload = resolve);
        
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        
        const ratio = Math.min(pageWidth / img.width, pageHeight / img.height);
        const imgWidth = img.width * ratio;
        const imgHeight = img.height * ratio;
        
        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;

        pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight);
      }

      pdf.save(`WebScan_Koleksi_${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error("Gagal membuat PDF:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Navbar */}
      <header className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/20">
            <Camera size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">Web Scanner</h1>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">PRO EDITION</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-semibold">{capturedList.length} File</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row p-4 lg:p-8 gap-8 max-w-[1600px] mx-auto w-full">
        
        {/* Left Side: Viewfinder / Adjustment Screen / Filter Preview */}
        <div className="flex-1 flex flex-col gap-6">
          
          {/* Mode Selector (Visible before activating camera and during live streaming) */}
          {!originalImage && !capturedImage && (
            <div className="flex justify-center">
              <div className="bg-slate-900 p-1 rounded-2xl border border-slate-800 flex gap-1 shadow-inner shadow-black/40">
                <button
                  onClick={() => { setDetectionMode('manual'); setStableFrames(0); }}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    detectionMode === 'manual' 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Camera size={14} />
                  Mode Manual
                </button>
                <button
                  onClick={() => { setDetectionMode('auto'); setStableFrames(0); }}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    detectionMode === 'auto' 
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' 
                    : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles size={14} />
                  Auto Capture
                </button>
              </div>
            </div>
          )}

          {/* Immersive Preview Box */}
          <div className="relative aspect-[3/4] md:aspect-auto md:h-[600px] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border-2 border-slate-800 flex items-center justify-center group">
            
            {/* 1. VIEW Kamera Live */}
            {isCameraActive && !originalImage && !capturedImage && (
              <div className="w-full h-full relative flex items-center justify-center p-4 bg-slate-950">
                <div className="relative inline-block overflow-hidden rounded-3xl border border-slate-800 shadow-2xl">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="max-h-[380px] md:max-h-[480px] w-auto max-w-full block"
                  />
                  
                  {/* SVG Overlay Garis Deteksi Corner Live */}
                  {liveCorners && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <polygon 
                        points={`${liveCorners.tl.x},${liveCorners.tl.y} ${liveCorners.tr.x},${liveCorners.tr.y} ${liveCorners.br.x},${liveCorners.br.y} ${liveCorners.bl.x},${liveCorners.bl.y}`}
                        className={`fill-none stroke-2 transition-all ${detectionMode === 'auto' ? 'stroke-emerald-400 animate-pulse' : 'stroke-blue-400'}`}
                      />
                      {/* Menggambar lingkaran pada setiap sudut deteksi live */}
                      <circle cx={liveCorners.tl.x} cy={liveCorners.tl.y} r="1.5" className="fill-blue-500 stroke-white stroke-[0.3]" />
                      <circle cx={liveCorners.tr.x} cy={liveCorners.tr.y} r="1.5" className="fill-blue-500 stroke-white stroke-[0.3]" />
                      <circle cx={liveCorners.br.x} cy={liveCorners.br.y} r="1.5" className="fill-blue-500 stroke-white stroke-[0.3]" />
                      <circle cx={liveCorners.bl.x} cy={liveCorners.bl.y} r="1.5" className="fill-blue-500 stroke-white stroke-[0.3]" />
                    </svg>
                  )}

                  {/* Info Overlay Status Scanner */}
                  <div className="absolute top-4 left-4 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] font-semibold border border-white/10 flex items-center gap-2 z-10">
                    <div className={`w-2.5 h-2.5 rounded-full ${isDetecting ? 'bg-amber-500 animate-ping' : 'bg-blue-500'}`}></div>
                    <span>{isDetecting ? "Sedang Memindai..." : "Deteksi Siap"}</span>
                  </div>

                  {/* Indikator Stabilisasi Auto Capture */}
                  {detectionMode === 'auto' && stableFrames > 0 && (
                    <div className="absolute inset-0 bg-emerald-500/10 backdrop-blur-[1px] flex flex-col items-center justify-center pointer-events-none transition-all z-10">
                      <div className="bg-emerald-950/90 border border-emerald-500/30 px-6 py-4 rounded-3xl text-center shadow-2xl flex flex-col items-center gap-2">
                        <Loader2 className="animate-spin text-emerald-400" size={28} />
                        <p className="text-emerald-400 font-bold text-sm">Menstabilkan...</p>
                        <p className="text-[11px] text-emerald-500/75">Menghitung {stableFrames}/3</p>
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-5 py-2.5 rounded-2xl text-xs text-white border border-white/10 text-center max-w-[280px] z-10 w-[90%] md:w-auto">
                    {detectionMode === 'auto' 
                      ? "Tahan kamera beberapa detik ketika dokumen terbingkai hijau untuk mengambil secara otomatis" 
                      : "Posisikan dokumen dalam bingkai dan tekan tombol Shutter"
                    }
                  </div>
                </div>
              </div>
            )}

            {/* 2. LAYAR PENYESUAIAN SUDUT (ADJUST CORNER) */}
            {isAdjusting && originalImage && (
              <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center p-4">
                <div className="text-center mb-3">
                  <h3 className="text-sm font-bold text-slate-300">Sesuaikan Sudut Dokumen</h3>
                  <p className="text-[11px] text-slate-500">Tarik lingkaran sudut untuk menandai dokumen dengan presisi</p>
                </div>

                <div className="relative flex items-center justify-center w-full flex-1 max-h-[80%]">
                  <div 
                    ref={adjustContainerRef}
                    className="relative inline-block overflow-hidden shadow-2xl rounded-2xl cursor-crosshair select-none border border-slate-800"
                  >
                    <img 
                      src={originalImage} 
                      alt="Original captured" 
                      className="max-h-[380px] md:max-h-[480px] w-auto max-w-full block pointer-events-none"
                    />

                    {/* Polygon SVG Dinamis Penyesuaian Manual */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <polygon 
                        points={`${adjustableCorners.tl.x},${adjustableCorners.tl.y} ${adjustableCorners.tr.x},${adjustableCorners.tr.y} ${adjustableCorners.br.x},${adjustableCorners.br.y} ${adjustableCorners.bl.x},${adjustableCorners.bl.y}`}
                        className="fill-blue-500/10 stroke-blue-500 stroke-2"
                      />
                    </svg>

                    {/* 4 Draggable Handles */}
                    {Object.keys(adjustableCorners).map((key) => {
                      const coord = adjustableCorners[key];
                      return (
                        <div
                          key={key}
                          onMouseDown={(e) => handleStartDrag(key, e)}
                          onTouchStart={(e) => handleStartDrag(key, e)}
                          className="absolute w-8 h-8 -ml-4 -mt-4 flex items-center justify-center cursor-move touch-none z-30"
                          style={{ left: `${coord.x}%`, top: `${coord.y}%` }}
                        >
                          <div className="w-4.5 h-4.5 bg-blue-500 rounded-full border-2 border-white shadow-lg shadow-black/50 active:scale-125 hover:bg-blue-400 transition-all"></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 3. FILTER EDITING MODE */}
            {capturedImage && !isAdjusting && (
              <div className="w-full h-full bg-slate-950 flex items-center justify-center p-4">
                <canvas 
                  ref={previewCanvasRef} 
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                />
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="flex flex-col items-center gap-4 p-8 text-center max-w-xs">
                <div className="bg-red-500/10 p-4 rounded-full">
                  <AlertCircle size={48} className="text-red-500" />
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">{errorMessage}</p>
                <button onClick={startCamera} className="text-blue-400 text-sm font-bold hover:underline">Coba Lagi</button>
              </div>
            )}

            {/* Idle State */}
            {!isCameraActive && !originalImage && !capturedImage && !errorMessage && (
              <div className="text-center p-8">
                <div className="relative inline-block mb-6">
                   <div className="absolute -inset-4 bg-blue-600/20 rounded-full blur-xl animate-pulse"></div>
                   <Camera size={64} className="relative text-slate-700" />
                </div>
                <h3 className="text-xl font-bold mb-2">Siap Memindai?</h3>
                <p className="text-slate-500 mb-8 max-w-[240px]">Ambil foto dokumen secara real-time dari browser Anda.</p>
                <button 
                  onClick={startCamera}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-10 py-4 rounded-2xl font-bold transition-all transform hover:scale-105 active:scale-95 shadow-xl shadow-blue-600/20"
                >
                  Aktifkan Kamera
                </button>
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            {isCameraActive && !originalImage && !capturedImage ? (
              <div className="flex items-center justify-between max-w-md mx-auto">
                <button onClick={stopCamera} className="p-4 rounded-2xl bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-all">
                  <XCircle size={24} />
                </button>
                <button 
                  onClick={() => capturePhoto()}
                  className="group relative w-16 h-16 rounded-full border-4 border-white/20 flex items-center justify-center p-1 hover:border-blue-500 transition-all"
                >
                  <div className="w-full h-full rounded-full bg-white group-active:scale-90 transition-transform"></div>
                </button>
                <button onClick={startCamera} className="p-4 rounded-2xl bg-slate-800 text-slate-400 hover:bg-blue-500/10 hover:text-blue-400 transition-all">
                  <RefreshCw size={24} />
                </button>
              </div>
            ) : isAdjusting && originalImage ? (
              // Tombol Navigasi Penyesuaian Sudut
              <div className="flex gap-4 max-w-md mx-auto">
                <button 
                  onClick={() => { setOriginalImage(null); setIsAdjusting(false); startCamera(); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-3.5 rounded-2xl font-bold text-sm transition-all border border-slate-700 text-slate-300"
                >
                  <XCircle size={18} /> Batal
                </button>
                <button 
                  onClick={applyPerspectiveWarp}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 py-3.5 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20 text-white"
                >
                  <Crop size={18} /> Terapkan & Potong
                </button>
              </div>
            ) : capturedImage && !isAdjusting ? (
              // Tombol Navigasi Filter & Simpan
              <div className="space-y-6">
                <div className="flex overflow-x-auto gap-3 pb-2 no-scrollbar">
                  {Object.keys(FILTERS).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                        filter === f 
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' 
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1).replace(/([A-Z])/g, ' $1')}
                    </button>
                  ))}
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => { setCapturedImage(null); setIsAdjusting(true); }}
                    className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-4 rounded-2xl font-bold transition-all border border-slate-700 text-slate-300"
                  >
                    <Crop size={18} /> Edit Sudut
                  </button>
                  <button 
                    onClick={saveToGallery}
                    className="flex-2 flex items-center justify-center gap-3 bg-emerald-600 hover:bg-emerald-500 py-4 px-8 rounded-2xl font-bold transition-all shadow-lg shadow-emerald-600/20"
                  >
                    <CheckCircle size={20} /> Simpan Hasil Scan
                  </button>
                </div>
              </div>
            ) : (
               <div className="text-center text-slate-500 text-sm font-medium">
                 Kamera Tidak Aktif
               </div>
            )}
          </div>
        </div>

        {/* Right Side: Gallery / Recent Scans */}
        <div className="w-full md:w-96 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-3">
              <ImageIcon size={22} className="text-blue-500" />
              Koleksi Dokumen
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar min-h-[300px]">
            {capturedList.length === 0 ? (
              <div className="h-full border-2 border-dashed border-slate-800 rounded-3xl p-10 flex flex-col items-center justify-center text-center opacity-50">
                <div className="bg-slate-900 p-4 rounded-2xl mb-4">
                  <FileText size={32} className="text-slate-700" />
                </div>
                <p className="text-slate-600 text-sm font-medium">Belum ada dokumen yang dipindai hari ini.</p>
              </div>
            ) : (
              [...capturedList].reverse().map((item, idx) => (
                <div key={item.id} className="group relative bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 transition-all hover:border-blue-500/50 hover:shadow-xl">
                  <div className="aspect-[3/4] overflow-hidden bg-black">
                    <img src={item.data} alt={`Scan ${idx}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  
                  <div className="p-4 flex items-center justify-between bg-slate-900/90 backdrop-blur-sm border-t border-slate-800">
                    <div>
                      <p className="text-xs font-bold text-slate-300">SCAN_{new Date(item.id).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      <p className="text-[10px] text-slate-500">Document {idx + 1}</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => downloadImage(item.data, `scan-${item.id}.jpg`)}
                        className="p-2.5 bg-blue-600/10 text-blue-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all"
                        title="Download JPG"
                      >
                        <Download size={18} />
                      </button>
                      <button 
                        onClick={() => {
                          const newList = capturedList.filter(l => l.id !== item.id);
                          setCapturedList(newList);
                        }}
                        className="p-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                        title="Hapus"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {capturedList.length > 0 && (
            <button 
              disabled={isExporting}
              className={`w-full py-5 rounded-3xl font-black flex items-center justify-center gap-3 shadow-xl transition-all transform hover:-translate-y-1 ${
                isExporting ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 hover:bg-white text-slate-950'
              }`}
              onClick={generatePDF}
            >
              {isExporting ? (
                <>
                  <Loader2 size={22} className="animate-spin" />
                  MENGEKSPOR...
                </>
              ) : (
                <>
                  <FileText size={22} />
                  GABUNG PDF ({capturedList.length})
                </>
              )}
            </button>
          )}
        </div>
      </main>

      {/* Hidden helper elements */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(-150px); opacity: 0; }
          50% { transform: translateY(150px); opacity: 1; }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
    </div>
  );
};

export default App;