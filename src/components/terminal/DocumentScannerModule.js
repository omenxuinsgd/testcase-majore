"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Square, Wifi, WifiOff, Maximize2, Link as LinkIcon, Key, Database, RefreshCw, 
  Activity, FileText, Camera, Loader2, X, Settings, CameraIcon, Layers, FolderOpen, 
  Search, ShieldCheck, Crop, Trash2, CheckCircle, Download, Sparkles, Video
} from 'lucide-react';

// === SOLVER MATRIKS PERSAMAAN LINIER UNTUK PERSPEKTIF WARPING ===
const solveHomography = (src, dst) => {
  const M = [];
  const Y = [];
  for (let i = 0; i < 4; i++) {
    const u = dst[i].x; const v = dst[i].y;
    const x = src[i].x; const y = src[i].y;
    M.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    M.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    Y.push(x); Y.push(y);
  }
  const N = 8;
  const A = M.map((row, i) => [...row, Y[i]]);
  for (let i = 0; i < N; i++) {
    let maxRow = i;
    for (let k = i + 1; k < N; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    const temp = A[i]; A[i] = A[maxRow]; A[maxRow] = temp;
    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-10) return null;
    for (let k = 0; k < N; k++) {
      if (k !== i) {
        const factor = A[k][i] / pivot;
        for (let j = i; j <= N; j++) A[k][j] -= factor * A[i][j];
      }
    }
    for (let j = i; j <= N; j++) A[i][j] /= pivot;
  }
  const h = A.map(row => row[N]);
  return { a: h[0], b: h[1], c: h[2], d: h[3], e: h[4], f: h[5], g: h[6], h: h[7] };
};

const FILTERS = {
  original: 'none',
  grayscale: 'grayscale(100%)',
  highContrast: 'contrast(150%) brightness(110%) grayscale(100%)',
  magic: 'contrast(120%) saturate(120%) brightness(110%)',
  bw: 'threshold'
};

const DocumentScannerModule = ({ data }) => {
  // --- STATE SYSTEM CZUR SDK ---
  const [logs, setLogs] = useState([`[SYSTEM] Document Engine v3.0 Online.`]);
  const [connStatus, setConnStatus] = useState({ cmd: false, mc: false });
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLicenseActive, setIsLicenseActive] = useState(false);
  const SDK_LICENSE = process.env.NEXT_PUBLIC_DOCUMENT_LICENSE || ""; 
  const autoConnectStarted = useRef(false);
  const isAutoInitializing = useRef(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });

  // --- KUNCI UTAMA: STATE SUMBER SENSOR KAMERA ---
  const [cameraSource, setCameraSource] = useState('czur'); // 'czur' | 'webcam'
  const [webcamStream, setWebcamStream] = useState(null);

  // --- STATE MODALITAS DESAIN CAMSCANNER SUITE ---
  const [activeBottomTab, setActiveBottomTab] = useState('scan_control'); 
  const [detectionMode, setDetectionMode] = useState('manual'); 
  const [filter, setFilter] = useState('original');
  const [capturedList, setCapturedList] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  
  // Manajemen Transformasi Matriks & Koordinat Jangkar
  const [originalImage, setOriginalImage] = useState(null); 
  const [capturedImage, setCapturedImage] = useState(null); 
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [activeHandle, setActiveHandle] = useState(null);
  const [adjustableCorners, setAdjustableCorners] = useState({
    tl: { x: 20, y: 20 }, tr: { x: 80, y: 20 }, br: { x: 80, y: 80 }, bl: { x: 20, y: 80 }
  });

  // State Deteksi Live Berkelanjutan via Server Flask API
  const [liveCorners, setLiveCorners] = useState(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [stableFrames, setStableFrames] = useState(0);
  

  const wsCmd = useRef(null);
  const wsMc = useRef(null);
  const previewCanvasRef = useRef(null);
  const adjustContainerRef = useRef(null);
  const lastFrameRef = useRef(null);

  // --- SINKRONISASI LOG KE SIDEBAR ---
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('scanner:logs-sync', { detail: logs }));
  }, [logs]);

  const showToast = (message, type = "success") => {
    const cleanMsg = message ? message.replace(/\0/g, '').trim() : "Sistem Siap";
    setToast({ show: true, message: cleanMsg, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  const addLog = (msg, type = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === "error" ? "[ERROR]" : type === "success" ? "[SUCCESS]" : "[INFO]";
    setLogs(prev => [`${prefix} ${msg} (${timestamp})`, ...prev].slice(0, 50));
  };

  // --- KONEKSI CZUR WEBSOCKET AUTOMATIC ---
  useEffect(() => {
    if (!autoConnectStarted.current) {
      autoConnectStarted.current = true;
      checkApiStatus();
    }
    return () => {
      if (wsCmd.current) wsCmd.current.close();
      if (wsMc.current) wsMc.current.close();
      if (webcamStream) webcamStream.getTracks().forEach(track => track.stop());
      window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
    };
  }, [webcamStream]);

  const checkApiStatus = async () => {
    if (wsCmd.current?.readyState === WebSocket.OPEN && wsMc.current?.readyState === WebSocket.OPEN) return;
    showToast("Memeriksa status SDK...", "success");
    addLog("Memeriksa status endpoint API Document CZUR SDK...", "info");
    const ports = { cmd: 25014, mc: 9999 };

    Object.entries(ports).forEach(([type, port]) => {
      const url = `ws://127.0.0.1:${port}/`;
      const testWs = new WebSocket(url);

      testWs.onopen = () => {
        setConnStatus(prev => {
          const newConns = { ...prev, [type]: true };
          if (type === 'cmd' && !isAutoInitializing.current) {
            isAutoInitializing.current = true;
            addLog("Membangun jaringan Socket CMD. Mengirimkan kode lisensi ke modul lokal...", "info");
            setTimeout(() => {
              testWs.send(JSON.stringify({ id: 1, license: SDK_LICENSE }));
            }, 300);
          }
          return newConns;
        });

        showToast(`Server CZUR ${type.toUpperCase()} Terhubung`, "success");
        addLog(`Status API CZUR ${type.toUpperCase()}: Terhubung otomatis.`, "success");

        if (type === 'cmd') {
          testWs.onmessage = (e) => {
            try { handleCmdMessage(JSON.parse(e.data)); } catch (err) { console.error(err); }
          };
          wsCmd.current = testWs;
        } else {
          testWs.onmessage = (e) => {
            const imageUrl = 'data:image/jpeg;base64,' + e.data;
            // Hanya update frame buffer jika mode sensor CZUR yang terpilih aktif
            if (cameraSource === 'czur') {
              lastFrameRef.current = imageUrl;
              window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: imageUrl }));
            }
          };
          wsMc.current = testWs;
        }
      };
      testWs.onerror = () => addLog(`Status API CZUR ${type.toUpperCase()}: TIDAK AKTIF.`, "error");
    });
  };

  const handleCmdMessage = (data) => {
    const cmdId = data.id !== undefined ? data.id.toString().trim() : "";
    const errCode = data.error !== undefined ? parseInt(data.error, 10) : -1;

    switch (cmdId) {
      case "1":
      case "2":
        if (errCode === 0 || data.msg === "success") {
          showToast("SDK Document Siap Digunakan", "success");
          addLog("AUTO-INIT BERHASIL: SDK CZUR terverifikasi.", "success");
          setIsLicenseActive(true);
        } else {
          showToast(`Inisialisasi Lisensi Gagal: Code ${errCode}`, "error");
          addLog(`AUTO-INIT GAGAL: Kode Error ${errCode}`, "error");
          setIsLicenseActive(false);
        }
        break;

      case "10":
        if (errCode === 0 || errCode === 12) {
          showToast("Kamera Utama Diaktifkan", "success");
          addLog("Kamera Utama Diaktifkan", "success");
          setIsCameraOpen(true); 
          setIsProcessing(false);
        } else if (errCode === 13) {
          showToast("Perangkat Tidak Terhubung", "error");
          addLog("Scanner is not connected. Please connect the scanner to this computer.", "error");
          setIsCameraOpen(false);
          setIsProcessing(false);
        } else {
          showToast(`Gagal mengaktifkan kamera: Error ${errCode}`, "error");
          setIsProcessing(false);
        }
        break;

      case "11":
      case "12":
        setIsCameraOpen(false); 
        setIsProcessing(false);
        showToast("Kamera Berhasil Dimatikan", "info");
        addLog("Kamera Utama Berhasil Dimatikan", "success");
        window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
        break;

      case "14":
        if (errCode === 0) addLog("Photo Taken. Processing Image, Please Wait", "info");
        break;

      case "301":
        if (errCode === 0 && data.file1 !== "null") {
          addLog(`Citra Berhasil Diambil dari CZUR Hardware. File: ${data.file1}`, "success");
          captureCzurStream();
        } else {
          addLog(`SDK Error saat menyimpan gambar: Code ${errCode}`, "error");
        }
        break;
        
      default:
        if (errCode !== undefined && errCode !== 0 && errCode !== -1) {
          addLog(`Notifikasi SDK (ID ${cmdId}): Code ${errCode}`, "info");
        }
    }
  };

  const sendCmd = (payload) => {
    if (wsCmd.current?.readyState === WebSocket.OPEN) {
      wsCmd.current.send(JSON.stringify(payload));
    } else {
      addLog("Gagal: Komunikasi saluran perintah utama belum terhubung!", "error");
    }
  };

  const openCzurCamera = () => isLicenseActive && sendCmd({ id: 9, index: 0 });
  const closeCzurCamera = () => isLicenseActive && sendCmd({ id: 11, index: 0 });

  // --- LOGIKA TOGGLE WEBCAM LOKAL STANDAR (TANPA LISENSI) ---
  const startWebcamStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      
      setWebcamStream(stream);
      setIsCameraOpen(true);
      showToast("Kamera Webcam Aktif (Tanpa Lisensi)", "success");
      addLog("Sensor internal webcam diaktifkan tanpa lisensi.", "success");

      // Loop pengiriman frame stream webcam menuju visual output buffer sidebar kiri
      const videoElement = document.createElement('video');
      videoElement.srcObject = stream;
      videoElement.play();

      const processCanvas = document.createElement('canvas');
      const processCtx = processCanvas.getContext('2d');

      const streamLoop = () => {
        if (stream.active && videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
          processCanvas.width = videoElement.videoWidth;
          processCanvas.height = videoElement.videoHeight;
          processCtx.drawImage(videoElement, 0, 0, processCanvas.width, processCanvas.height);
          const frameData = processCanvas.toDataURL('image/jpeg', 0.6);
          
          lastFrameRef.current = frameData;
          window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: frameData }));
        }
        if (stream.active) requestAnimationFrame(streamLoop);
      };
      
      videoElement.onloadedmetadata = () => requestAnimationFrame(streamLoop);

    } catch (err) {
      showToast("Gagal mengakses device webcam", "error");
      addLog(`Webcam error: ${err.message}`, "error");
    }
  };

  const stopWebcamStream = () => {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      setWebcamStream(null);
    }
    setIsCameraOpen(false);
    showToast("Kamera Webcam Dimatikan", "info");
    addLog("Aliran data sensor webcam ditutup.", "info");
    window.dispatchEvent(new CustomEvent('terminal:update-preview', { detail: null }));
  };

  // --- MAIN TOGGLE HANDLER INTERFACE ---
  const handleToggleCamera = async () => {
    const timestampText = new Date().toLocaleTimeString();
    addLog(`[CAMERA] Triggered handleToggleCamera. Source: ${cameraSource.toUpperCase()} | State: ${isCameraOpen ? 'OPEN' : 'CLOSED'}`);

    if (cameraSource === 'webcam') {
      if (isCameraOpen) stopWebcamStream();
      else await startWebcamStream();
    } else {
      // Skema CZUR standard dengan proteksi lisensi bawaan
      if (isCameraOpen) {
        setIsProcessing(true);
        closeCzurCamera();
      } else {
        setIsProcessing(true);
        try {
          if (!connStatus || !connStatus.cmd) throw new Error("Layanan hardware CZUR SDK offline.");
          openCzurCamera();
          showToast("Memulai Sensor Kamera CZUR...", "success");
        } catch (error) {
          setIsProcessing(false);
          setIsCameraOpen(false);
          addLog(`[ERROR] Gagal inisialisasi: ${error.message}`, "error");
          showToast(error.message, "error");
        }
      }
    }
  };

  // --- LOOP DETEKSI LIVE CORNER ---
  useEffect(() => {
    let intervalId;
    if (isCameraOpen && !originalImage && !capturedImage) {
      intervalId = setInterval(async () => {
        if (!lastFrameRef.current || isDetecting) return;
        setIsDetecting(true);

        const img = new Image();
        img.onload = () => {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = 224; tempCanvas.height = 224;
          const ctx = tempCanvas.getContext('2d');
          ctx.drawImage(img, 0, 0, 224, 224);

          tempCanvas.toBlob(async (blob) => {
            if (!blob) { setIsDetecting(false); return; }
            const formData = new FormData();
            formData.append('image', blob, 'frame.jpg');

            try {
              const res = await fetch('http://localhost:5000/api/predict-corner', {
                method: 'POST',
                body: formData
              });
              const resData = await res.json();
              
              if (resData.status === 'success' && resData.corners) {
                const origW = resData.original_size.width;
                const origH = resData.original_size.height;
                
                const mappedPoints = {
                  tl: { x: (resData.corners.top_left[0] / origW) * 100, y: (resData.corners.top_left[1] / origH) * 100 },
                  tr: { x: (resData.corners.top_right[0] / origW) * 100, y: (resData.corners.top_right[1] / origH) * 100 },
                  br: { x: (resData.corners.bottom_right[0] / origW) * 100, y: (resData.corners.bottom_right[1] / origH) * 100 },
                  bl: { x: (resData.corners.bottom_left[0] / origW) * 100, y: (resData.corners.bottom_left[1] / origH) * 100 }
                };

                setLiveCorners(mappedPoints);
                
                // DISPATCH DATA KE TERMINAL VIEW UNTUK DITAMPILKAN DI SIDEBAR KIRI (LIVE PREVIEW COORD)
                window.dispatchEvent(new CustomEvent('scanner:live-corners-sync', { detail: mappedPoints }));

                if (detectionMode === 'auto') {
                  setStableFrames(prev => {
                    const nextStable = prev + 1;
                    if (nextStable >= 3) {
                      executeCaptureWorkflow(mappedPoints);
                      return 0;
                    }
                    return nextStable;
                  });
                }
              } else {
                setLiveCorners(null);
                setStableFrames(0);
                window.dispatchEvent(new CustomEvent('scanner:live-corners-sync', { detail: null }));
              }
            } catch (err) {
              console.error("Gagal melakukan deteksi live:", err);
            } finally {
              setIsDetecting(true); // Memastikan status tetap berlanjut
              setIsDetecting(false);
            }
          }, 'image/jpeg', 0.85);
        };
        img.src = lastFrameRef.current;
      }, 700);
    } else {
      // Bersihkan garis deteksi jika kamera ditutup
      window.dispatchEvent(new CustomEvent('scanner:live-corners-sync', { detail: null }));
    }
    return () => { 
      if (intervalId) clearInterval(intervalId);
      window.dispatchEvent(new CustomEvent('scanner:live-corners-sync', { detail: null }));
    };
  }, [isCameraOpen, originalImage, capturedImage, detectionMode]);
  // --- WORKFLOW DOKUMEN PINDAIAN ---
  const captureCzurStream = (forcedPoints = null) => {
    if (lastFrameRef.current) {
      setOriginalImage(lastFrameRef.current);
      if (forcedPoints) {
        setAdjustableCorners(forcedPoints);
      } else if (liveCorners) {
        setAdjustableCorners(liveCorners);
      } else {
        setAdjustableCorners({
          tl: { x: 25, y: 20 }, tr: { x: 75, y: 20 }, br: { x: 75, y: 80 }, bl: { x: 25, y: 80 }
        });
      }
      setIsAdjusting(true);
      addLog("Masuk ke Mode Penyesuaian Dokumen (CamScanner Style).", "info");
    } else {
      showToast("Gagal mematangkan buffer pratinjau sisi kiri.", "error");
    }
  };

  const executeCaptureWorkflow = (forcedPoints = null) => {
    if (cameraSource === 'webcam') {
      captureCzurStream(forcedPoints);
      stopWebcamStream();
    } else {
      captureCzurStream(forcedPoints);
    }
  };

  const triggerHardwareCapture = () => {
    if (cameraSource === 'webcam') {
      executeCaptureWorkflow();
    } else {
      if (!isCameraOpen) return showToast("Aktifkan kamera CZUR terlebih dahulu!", "error");
      setIsProcessing(true);
      sendCmd({
        id: 13, index: 0, file: "d:\\scan_tmp.jpg", dpi: 300, quality: 90, color: 0,
        round: 0, adjust: 0, bcr: 0, bpd: 0, compress: 1
      });
      setTimeout(() => setIsProcessing(false), 1000);
    }
  };

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
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    setAdjustableCorners(prev => ({ ...prev, [activeHandle]: { x, y } }));
  };

  useEffect(() => {
    const handleStopDrag = () => setActiveHandle(null);
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

  const applyPerspectiveWarp = () => {
  if (!originalImage || !adjustContainerRef.current) return;
  
  // Mencari elemen gambar di dalam kontainer untuk mendapatkan ukuran visual aktual di layar
  const imgElement = adjustContainerRef.current.querySelector('img');
  if (!imgElement) return;

  const img = new Image();
  img.onload = () => {
    // 1. Dapatkan ukuran asli gambar (Piksel Asli)
    const trueW = img.width;
    const trueH = img.height;

    // 2. Dapatkan ukuran render gambar di layar browser (Ukuran UI)
    const rect = imgElement.getBoundingClientRect();
    const renderW = rect.width;
    const renderH = rect.height;

    // 3. Konversi koordinat persentase UI ke koordinat Piksel Asli Gambar
    // Rumus: (Persentase / 100) * Ukuran_UI * (True_Size / Ukuran_UI) => (Persentase / 100) * True_Size
    // Namun untuk presisi tinggi terhadap posisi relative kontainer, kita petakan proporsinya:
    const srcPoints = [
      { x: (adjustableCorners.tl.x / 100) * trueW, y: (adjustableCorners.tl.y / 100) * trueH },
      { x: (adjustableCorners.tr.x / 100) * trueW, y: (adjustableCorners.tr.y / 100) * trueH },
      { x: (adjustableCorners.br.x / 100) * trueW, y: (adjustableCorners.br.y / 100) * trueH },
      { x: (adjustableCorners.bl.x / 100) * trueW, y: (adjustableCorners.bl.y / 100) * trueH }
    ];

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = trueW; 
    srcCanvas.height = trueH;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(img, 0, 0);

    // 4. Hitung dimensi target output berdasarkan panjang sisi maksimum dari anchor points
    let destWidth = Math.round(
      Math.max(
        Math.hypot(srcPoints[1].x - srcPoints[0].x, srcPoints[1].y - srcPoints[0].y),
        Math.hypot(srcPoints[2].x - srcPoints[3].x, srcPoints[2].y - srcPoints[3].y)
      )
    );
    let destHeight = Math.round(
      Math.max(
        Math.hypot(srcPoints[3].x - srcPoints[0].x, srcPoints[3].y - srcPoints[0].y),
        Math.hypot(srcPoints[2].x - srcPoints[1].x, srcPoints[2].y - srcPoints[1].y)
      )
    );

    // Pembatasan resolusi agar performa warping matematis di browser tetap ringan
    const MAX_DIMENSION = 1600;
    if (destWidth > MAX_DIMENSION || destHeight > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(destWidth, destHeight);
      destWidth = Math.round(destWidth * scale);
      destHeight = Math.round(destHeight * scale);
      
      // Skala ulang poin sumber jika resolusi disesuaikan
      srcPoints.forEach(p => {
        p.x *= 1; // Tetap merujuk ke kanvas asal yang tidak di-scale
        p.y *= 1;
      });
    }

    const destCanvas = document.createElement('canvas');
    destCanvas.width = destWidth; 
    destCanvas.height = destHeight;
    const destCtx = destCanvas.getContext('2d');

    // 5. Jalankan algoritma Homography matriks linear
    const coeffs = solveHomography(srcPoints, [
      { x: 0, y: 0 }, 
      { x: destWidth - 1, y: 0 }, 
      { x: destWidth - 1, y: destHeight - 1 }, 
      { x: 0, y: destHeight - 1 }
    ]);
    
    if (!coeffs) {
      console.error("Gagal menyelesaikan matriks Homography.");
      return;
    }

    const { a, b, c, d, e, f, g, h } = coeffs;
    const srcData = srcCtx.getImageData(0, 0, trueW, trueH).data;
    const destImgData = destCtx.createImageData(destWidth, destHeight);
    const destData = destImgData.data;

    // 6. Integrasi interpolasi Bilinear untuk hasil pangkas yang tajam dan presisi
    for (let v = 0; v < destHeight; v++) {
      for (let u = 0; u < destWidth; u++) {
        const denom = g * u + h * v + 1;
        const srcX = (a * u + b * v + c) / denom;
        const srcY = (d * u + e * v + f) / denom;
        
        const x0 = Math.floor(srcX); 
        const y0 = Math.floor(srcY);
        const x1 = Math.min(x0 + 1, trueW - 1); 
        const y1 = Math.min(y0 + 1, trueH - 1);
        const dx = srcX - x0; 
        const dy = srcY - y0;

        if (x0 >= 0 && x1 < trueW && y0 >= 0 && y1 < trueH) {
          const idx00 = (y0 * trueW + x0) * 4; 
          const idx10 = (y0 * trueW + x1) * 4;
          const idx01 = (y1 * trueW + x0) * 4; 
          const idx11 = (y1 * trueW + x1) * 4;
          const destIdx = (v * destWidth + u) * 4;

          for (let ch = 0; ch < 4; ch++) {
            destData[destIdx + ch] = 
              (1 - dx) * (1 - dy) * srcData[idx00 + ch] + 
              dx * (1 - dy) * srcData[idx10 + ch] + 
              (1 - dx) * dy * srcData[idx01 + ch] + 
              dx * dy * srcData[idx11 + ch];
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

  const applyFilterToCanvas = useCallback(() => {
    if (!capturedImage || !previewCanvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = previewCanvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = img.width; canvas.height = img.height;
      ctx.filter = FILTERS[filter] === 'threshold' ? 'none' : FILTERS[filter];
      ctx.drawImage(img, 0, 0);

      if (filter === 'threshold') {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const dData = imageData.data;
        for (let i = 0; i < dData.length; i += 4) {
          const vVal = (dData[i] + dData[i + 1] + dData[i + 2]) / 3 > 120 ? 255 : 0;
          dData[i] = dData[i + 1] = dData[i + 2] = vVal;
        }
        ctx.putImageData(imageData, 0, 0);
      }
    };
    img.src = capturedImage;
  }, [capturedImage, filter]);

  useEffect(() => { if (capturedImage) applyFilterToCanvas(); }, [capturedImage, filter, applyFilterToCanvas]);

  const saveToGallery = () => {
    if (!previewCanvasRef.current) return;
    const finalImage = previewCanvasRef.current.toDataURL('image/jpeg');
    setCapturedList(prev => [...prev, { id: Date.now(), data: finalImage }]);
    setCapturedImage(null); setOriginalImage(null);
    setStableFrames(0); setLiveCorners(null);
    addLog("Hasil pangkasan dokumen ditambahkan ke koleksi galeri m-one.", "success");
  };

  // --- FUNGSI HALAMAN GALERI: DOWNLOAD INDIVIDUAL JPG ---
  const handleDownloadJPG = (imageData, index) => {
    const link = document.createElement('a');
    link.href = imageData;
    link.download = `M1_Doc_${index}_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog(`Dokumen DOC_${index} berhasil diunduh sebagai JPG.`, "success");
  };

  const generatePDF = async () => {
    if (capturedList.length === 0) return;
    setIsExporting(true);
    try {
      if (typeof window !== 'undefined' && !window.jspdf) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        document.head.appendChild(script);
        await new Promise((res) => { script.onload = res; });
      }
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF();
      for (let i = 0; i < capturedList.length; i++) {
        if (i > 0) pdf.addPage();
        const img = new Image(); img.src = capturedList[i].data;
        await new Promise(r => img.onload = r);
        const pW = pdf.internal.pageSize.getWidth();
        const pH = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pW / img.width, pH / img.height);
        const iW = img.width * ratio; const iH = img.height * ratio;
        pdf.addImage(capturedList[i].data, 'JPEG', (pW - iW) / 2, (pH - iH) / 2, iW, iH);
      }
      pdf.save(`M1_CamScan_${Date.now()}.pdf`);
      showToast("PDF Dokumen Berhasil Diekspor", "success");
    } catch (err) { addLog("Gagal ekspor PDF.", "error"); }
    finally { setIsExporting(false); }
  };

  return (
    <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar font-mono text-left">
      <AnimatePresence>
        {toast.show && (
          <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }} className={`fixed top-12 right-12 z-[9999] flex items-center gap-3 px-6 py-3 border-2 shadow-2xl backdrop-blur-md rounded-sm ${toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-rose-500/10 border-rose-500 text-rose-400'}`}>
            <span className="text-[14px] font-black uppercase tracking-widest">{toast.message}</span>
            <button onClick={() => setToast({ ...toast, show: false })} className="hover:text-white transition-colors"><X size={18} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SETUP PERANGKAT & LISENSI CZUR + SELECTBOX SUMBER KAMERA */}
      <div className="grid grid-cols-1 gap-4 shrink-0">
        <div className="flex-1 border-2 border-[#00ffff]/40 bg-zinc-900/60 p-5 relative rounded-sm flex flex-col shadow-2xl gap-4">
          <div className="absolute -top-[12px] left-6 bg-white text-black px-4 py-0.5 text-[14px] font-black uppercase">Setup Perangkat & Konfigurasi Kamera</div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {/* SELECTBOX PILIHAN DEVICE SUMBER KAMERA */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 uppercase font-bold tracking-widest flex items-center gap-1.5">
                <Video size={14} className="text-[#00ffff]" /> Pilih Sumber Sensor Kamera
              </label>
              <select 
                value={cameraSource} 
                onChange={(e) => {
                  if (isCameraOpen) handleToggleCamera(); // Matikan kamera yang aktif sebelum berpindah
                  setCameraSource(e.target.value);
                  addLog(`Sumber kamera diubah ke: ${e.target.value.toUpperCase()}`);
                }}
                className="w-full bg-black border border-[#00ffff]/30 p-2.5 text-[#00ffff] text-xs outline-none focus:border-[#00ffff] transition-colors cursor-pointer"
              >
                <option value="czur">Kamera Hardware CZUR (Membutuhkan Lisensi)</option>
                <option value="webcam">Kamera Webcam Internal / USB (Bypass Lisensi)</option>
              </select>
            </div>

            {/* STATUS AKTIVASI LISENSI (HANYA RELEVAN UNTUK MODE CZUR) */}
            <div className="space-y-1.5 flex flex-col justify-end">
              <div className={`flex h-[38px] items-center gap-3 px-4 border-2 rounded-sm transition-all duration-300 ${
                cameraSource === 'webcam' 
                  ? 'border-zinc-700 text-zinc-500 bg-zinc-800/20 opacity-50 select-none' 
                  : isLicenseActive ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-rose-600 text-rose-500 bg-rose-500/10'
              }`}>
                <ShieldCheck size={18} className={isLicenseActive && cameraSource === 'czur' ? "animate-pulse" : ""} />
                <span className="text-[11px] font-black uppercase tracking-[0.1em]">
                  {cameraSource === 'webcam' ? 'Lisensi: BYPASS_WEBCAM' : isLicenseActive ? 'Kode_Lisensi_Aktif' : 'Kode_Lisensi_Tidak_Aktif'}
                </span>
              </div>
            </div>
          </div>

          {/* KUNCI PERBAIKAN: MODE SELECTOR SEKARANG BERADA DI SINI (DI ATAS TOMBOL SEBENARNYA) */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-400 uppercase font-bold tracking-widest block">
              Pilih Mode Pemindaian Dokumen
            </label>
            <div className="bg-black p-1 rounded-sm border border-[#00ffff]/20 flex gap-1 w-full md:w-fit">
              <button 
                type="button"
                onClick={() => { setDetectionMode('manual'); setStableFrames(0); }} 
                className={`flex-1 md:flex-none px-6 py-2 text-xs font-bold uppercase transition-all ${detectionMode === 'manual' ? 'bg-[#00ffff] text-black' : 'text-zinc-500 hover:text-white'}`}
              >
                Manual Mode
              </button>
              <button 
                type="button"
                onClick={() => { setDetectionMode('auto'); setStableFrames(0); }} 
                className={`flex-1 md:flex-none px-6 py-2 text-xs font-bold uppercase transition-all ${detectionMode === 'auto' ? 'bg-emerald-600 text-white' : 'text-zinc-500 hover:text-white'}`}
              >
                Auto Capture
              </button>
            </div>
          </div>

          {/* BUTTON START / STOP ACTION */}
          <button
            onClick={handleToggleCamera}
            disabled={cameraSource === 'czur' && !isLicenseActive}
            className={`group flex items-center gap-2 w-full py-3.5 transition-all font-black text-sm uppercase tracking-widest shadow-lg rounded-sm border-2 justify-center ${
              cameraSource === 'czur' && !isLicenseActive
                ? 'bg-zinc-800 text-zinc-600 border-zinc-700 cursor-not-allowed opacity-50'
                : isCameraOpen 
                  ? 'bg-red-600 text-white border-red-700 hover:bg-red-500' 
                  : 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-500'
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing Sync...</span>
              </>
            ) : isCameraOpen ? (
              <>
                <Square className="w-4 h-4" />
                <span>Terminate Sensor Stream</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 group-hover:animate-pulse" />
                <span>Initialize {cameraSource === 'webcam' ? 'Webcam' : 'CZUR'} Sensor</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* CORE CAMSCANNER INTERACTIVE WORKBENCH */}
      <div className="flex-1 border-2 border-[#00ffff]/40 bg-zinc-950 flex flex-col rounded-sm relative overflow-hidden shadow-2xl min-h-[450px]">
        <div className="flex border-b border-[#00ffff]/40 bg-zinc-900">
          <button onClick={() => setActiveBottomTab('scan_control')} className={`px-6 py-2.5 text-[14px] font-black uppercase tracking-[0.1em] flex items-center gap-2 transition-all border-r border-[#00ffff]/10 ${activeBottomTab === 'scan_control' ? 'bg-[#00ffff] text-black' : 'text-[#00ffff]/70 hover:text-[#00ffff] hover:bg-zinc-800'}`}>
            <CameraIcon size={14} /> Document Processing Terminal
          </button>
          <button onClick={() => setActiveBottomTab('gallery')} className={`px-6 py-2.5 text-[14px] font-black uppercase tracking-[0.1em] flex items-center border-r-1 gap-2 transition-all ${activeBottomTab === 'gallery' ? 'bg-[#00ffff] text-black' : 'text-[#00ffff]/70 hover:text-[#00ffff] hover:bg-zinc-800'}`}>
            <Layers size={14} /> Captured Gallery ({capturedList.length})
          </button>
        </div>

        <div className="p-6 flex-1 flex flex-col relative overflow-hidden bg-black/20">
          {activeBottomTab === 'scan_control' ? (
            <div className="flex-1 flex flex-col justify-between animate-in fade-in duration-300">
              {/* {!originalImage && !capturedImage && (
                <div className="flex justify-center mb-4">
                  <div className="bg-zinc-900 p-1 rounded-sm border border-[#00ffff]/20 flex gap-1">
                    <button onClick={() => { setDetectionMode('manual'); setStableFrames(0); }} className={`px-6 py-1.5 text-xs font-bold uppercase transition-all ${detectionMode === 'manual' ? 'bg-[#00ffff] text-black' : 'text-zinc-500 hover:text-white'}`}>Manual Mode</button>
                    <button onClick={() => { setDetectionMode('auto'); setStableFrames(0); }} className={`px-6 py-1.5 text-xs font-bold uppercase transition-all ${detectionMode === 'auto' ? 'bg-emerald-600 text-white' : 'text-zinc-500 hover:text-white'}`}>Auto Capture</button>
                  </div>
                </div>
              )} */}

              {/* STAGE 1: DRAG MANUAL ADJUSTMENT SCREEN */}
              {/* STAGE 1: DRAG MANUAL ADJUSTMENT SCREEN */}
              {isAdjusting && originalImage && (
                <div className="flex-1 flex flex-col items-center justify-center border border-[#00ffff]/10 p-4 rounded-sm bg-black/40">
                  <div ref={adjustContainerRef} className="relative inline-block border border-[#00ffff]/30 bg-zinc-950 shadow-2xl rounded-sm max-h-[320px]">
                    {/* Pastikan gambar menggunakan w-auto dan h-auto agar aspek rasio aslinya terjaga di dalam kontainer */}
                    <img src={originalImage} className="max-h-[320px] w-auto max-w-full block pointer-events-none" alt="Buffer Snapshot" />
                    
                    {/* SVG Sekarang akan mengikuti ukuran presisi dari gambar di atasnya secara real-time */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <polygon points={`${adjustableCorners.tl.x},${adjustableCorners.tl.y} ${adjustableCorners.tr.x},${adjustableCorners.tr.y} ${adjustableCorners.br.x},${adjustableCorners.br.y} ${adjustableCorners.bl.x},${adjustableCorners.bl.y}`} className="fill-[#00ffff]/10 stroke-[#00ffff] stroke-2" />
                    </svg>
                    {Object.keys(adjustableCorners).map((key) => (
                      <div key={key} onMouseDown={(e) => handleStartDrag(key, e)} onTouchStart={(e) => handleStartDrag(key, e)} className="absolute w-6 h-6 -ml-3 -mt-3 flex items-center justify-center cursor-move z-50" style={{ left: `${adjustableCorners[key].x}%`, top: `${adjustableCorners[key].y}%` }}>
                        <div className="w-3.5 h-3.5 bg-[#00ffff] border border-white rounded-full shadow-[0_0_8px_#00ffff]"></div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-6 w-full max-w-xs">
                    <button onClick={() => { setOriginalImage(null); setIsAdjusting(false); if (cameraSource === 'webcam') handleToggleCamera(); }} className="flex-1 py-2 border border-rose-500 text-rose-400 text-xs font-black uppercase">Cancel</button>
                    <button onClick={applyPerspectiveWarp} className="flex-1 py-2 bg-[#00ffff] text-black text-xs font-black uppercase shadow-[0_0_10px_#00ffff44]">Warp & Crop</button>
                  </div>
                </div>
              )}

              {/* STAGE 2: SPEC SPECTRAL FILTER EDITING PANEL */}
              {capturedImage && !isAdjusting && (
                <div className="flex-1 flex flex-col lg:flex-row gap-6 animate-in zoom-in-95 duration-400">
                  <div className="flex-1 bg-black/60 border border-[#00ffff]/20 p-2 rounded-sm flex items-center justify-center relative min-h-[200px]">
                    <canvas ref={previewCanvasRef} className="max-w-full max-h-[380px] object-contain rounded-sm" />
                  </div>
                  <div className="w-full lg:w-[240px] flex flex-col gap-4">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-1"><Sparkles size={12} className="text-[#00ffff]" /> Spectral Filters</label>
                    <div className="flex flex-col gap-2">
                      {Object.keys(FILTERS).map((f) => (
                        <button key={f} onClick={() => setFilter(f)} className={`w-full py-2 text-left px-4 text-xs font-bold uppercase border transition-all ${filter === f ? 'bg-[#00ffff] text-black border-[#00ffff]' : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'}`}>
                          &gt; {f.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-auto">
                      <button onClick={() => setIsAdjusting(true)} className="flex-1 py-2.5 border border-zinc-700 text-zinc-400 text-xs font-bold uppercase">Sudut</button>
                      <button onClick={saveToGallery} className="flex-2 py-2.5 bg-emerald-600 text-white text-xs font-black uppercase shadow-lg">Simpan</button>
                    </div>
                  </div>
                </div>
              )}

              {/* STAGE 0: SHUTTER HARDWARE TRIGGER STATE */}
              {!originalImage && !capturedImage && (
                <div className="flex-1 flex flex-col items-center justify-center py-12 border border-dashed border-[#00ffff]/20 rounded-sm relative">
                  {detectionMode === 'auto' && stableFrames > 0 && (
                    <div className="absolute inset-0 bg-emerald-500/5 backdrop-blur-[1px] flex flex-col items-center justify-center z-40">
                      <div className="bg-zinc-950/90 border border-emerald-500/30 px-6 py-4 rounded-sm text-center shadow-2xl flex flex-col items-center gap-2">
                        <Loader2 className="animate-spin text-emerald-400" size={24} />
                        <p className="text-emerald-400 font-bold text-xs">Menstabilkan Berkas...</p>
                        <p className="text-[10px] text-emerald-500/50">Sinkronisasi {stableFrames}/3</p>
                      </div>
                    </div>
                  )}

                  <div className="relative mb-4">
                    <div className="absolute -inset-4 bg-[#00ffff]/5 rounded-full blur-xl animate-pulse"></div>
                    <Camera size={48} className="text-zinc-700 relative" />
                  </div>
                  <p className="text-zinc-500 text-xs max-w-sm text-center mb-6 uppercase tracking-wider">
                    {cameraSource === 'webcam' ? 'Posisikan dokumen dalam jangkauan webcam.' : 'Posisikan berkas fisik di bawah scanner CZUR.'}
                  </p>
                  <button onClick={triggerHardwareCapture} disabled={!isCameraOpen} className={`px-12 py-3 font-black text-xs uppercase tracking-widest transition-all rounded-sm border-2 ${isCameraOpen ? 'bg-[#00ffff]/10 text-[#00ffff] border-[#00ffff] hover:bg-[#00ffff] hover:text-black shadow-[0_0_15px_rgba(0,255,255,0.2)]' : 'bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed'}`}>
                    {cameraSource === 'webcam' ? 'Bidik Citra Webcam' : 'Bidik Kamera CZUR'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* GALERI PENAMPUNG FILE */
            <div className="flex-1 flex flex-col justify-between animate-in slide-in-from-right-4 duration-300">
              {capturedList.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-zinc-800 py-16 opacity-30">
                  <FileText size={48} className="text-zinc-700 mb-2" />
                  <span className="text-[11px] font-black uppercase tracking-widest">Belum ada dokumen yang dipindai</span>
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                    {[...capturedList].reverse().map((item, idx) => {
                      // Menghitung indeks asli dokumen agar nama file dan label teks sinkron
                      const docIndex = capturedList.length - idx;

                      return (
                        <div key={item.id} className="bg-zinc-900/60 border border-[#00ffff]/10 p-2 rounded-sm flex flex-col group relative">
                          <div className="aspect-[4/4] overflow-hidden bg-black mb-2 border border-zinc-800">
                            <img src={item.data} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" alt="Scan Part" />
                          </div>
                          <div className="flex items-center justify-between mt-auto">
                            <span className="text-[14px] text-zinc-500 font-bold">DOC_{docIndex}</span>
                            
                            {/* CONTAINER ACTION BUTTONS */}
                            <div className="flex items-center gap-2">
                              {/* TOMBOL UNDUH JPG BARU */}
                              <button 
                                onClick={() => handleDownloadJPG(item.data, docIndex)} 
                                className="text-emerald-400 hover:text-emerald-300 p-1 transition-colors"
                                title="Unduh JPG"
                              >
                                <Download size={15} />
                              </button>
                              
                              {/* TOMBOL HAPUS */}
                              <button 
                                onClick={() => setCapturedList(capturedList.filter(l => l.id !== item.id))} 
                                className="text-rose-500 hover:text-rose-400 p-1 transition-colors"
                                title="Hapus"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <button onClick={generatePDF} disabled={isExporting} className={`w-full py-4 rounded-sm font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${isExporting ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black hover:bg-[#00ffff] hover:shadow-[0_0_15px_#00ffff44]'}`}>
                    {isExporting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                    {isExporting ? 'Mengekspor Berkas PDF...' : `Gabungkan ke PDF File (${capturedList.length})`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* FOOTER METADATA TERMINAL */}
          {/* <div className="mt-auto flex justify-between items-center border-t border-[#00ffff]/5 pt-4">
            <div className="flex items-center gap-2">
              <Activity size={12} className="text-[#00ffff]/40 animate-pulse" />
              <span className="text-[11px] text-zinc-600 uppercase">CamScanner Suite Module Enabled</span>
            </div>
            <button onClick={() => setLogs([`[SYSTEM] Console logs flushed.`])} className="text-[13px] text-[#00ffff]/70 hover:text-[#00ffff] uppercase font-black underline underline-offset-4 decoration-[#00ffff]/20 transition-colors">Flush Logs</button>
          </div> */}
        </div>
      </div>
    </div>
  );
};

export default DocumentScannerModule;