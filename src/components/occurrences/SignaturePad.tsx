import { useState, useEffect, useRef } from 'react';
import { Maximize2, X, RotateCw, Check, Smartphone, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SignaturePadProps {
  label: string;
  onSave: (dataUrl: string) => void;
  onClear: () => void;
  initialValue?: string;
}

export function SignaturePad({
  label,
  onSave,
  onClear,
  initialValue
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(true);
  const [hasSignature, setHasSignature] = useState(false);

  // Track screen orientation for portrait/landscape detection on mobile
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Sync state if initialValue exists
  useEffect(() => {
    if (initialValue) {
      setHasSignature(true);
    }
  }, [initialValue]);

  // Hook up canvas resizing and content preservation for a given canvas
  const setupCanvas = (
    canvas: HTMLCanvasElement | null,
    val: string | undefined,
    onDrawEnd?: (dataUrl: string) => void
  ) => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0f172a'; // Slate-900
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const currentWidth = Math.max(rect.width, 100);
      const currentHeight = Math.max(rect.height, 50);

      if (canvas.width !== currentWidth || canvas.height !== currentHeight) {
        // Save current drawing content before resizing clears it
        let tempImage: string | null = null;
        try {
          tempImage = canvas.toDataURL();
        } catch (e) {
          // ignore empty canvas errors
        }

        canvas.width = currentWidth;
        canvas.height = currentHeight;

        const newCtx = canvas.getContext('2d');
        if (newCtx) {
          newCtx.lineWidth = 3;
          newCtx.strokeStyle = '#0f172a';
          newCtx.lineCap = 'round';
          newCtx.lineJoin = 'round';

          // Restore saved content
          if (tempImage && tempImage !== 'data:,') {
            const img = new Image();
            img.onload = () => {
              newCtx.drawImage(img, 0, 0, currentWidth, currentHeight);
            };
            img.src = tempImage;
          } else if (val) {
            const img = new Image();
            img.onload = () => {
              newCtx.drawImage(img, 0, 0, currentWidth, currentHeight);
            };
            img.src = val;
          }
        }
      }
    };

    resizeCanvas();

    const resizeObserver = new ResizeObserver(() => {
      setTimeout(resizeCanvas, 30);
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  };

  // Inline Canvas Setup
  useEffect(() => {
    if (!isModalOpen) {
      return setupCanvas(canvasRef.current, initialValue);
    }
  }, [initialValue, isModalOpen]);

  // Modal Canvas Setup
  useEffect(() => {
    if (isModalOpen) {
      // Pass the current initialValue or the inline canvas content
      const inlineDataUrl = canvasRef.current?.toDataURL();
      return setupCanvas(modalCanvasRef.current, inlineDataUrl || initialValue);
    }
  }, [isModalOpen, initialValue]);

  const getPos = (canvas: HTMLCanvasElement, e: any) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (canvas: HTMLCanvasElement, e: any) => {
    e.preventDefault();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(canvas, e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (canvas: HTMLCanvasElement, e: any) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(canvas, e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = (canvas: HTMLCanvasElement, isModal: boolean) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const dataUrl = canvas.toDataURL();
    if (!isModal) {
      onSave(dataUrl);
    }
  };

  const handleClear = (canvas: HTMLCanvasElement | null, isModal: boolean) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasSignature(false);
    if (!isModal) {
      onClear();
    }
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleConfirmModalSignature = () => {
    const modalCanvas = modalCanvasRef.current;
    const inlineCanvas = canvasRef.current;
    if (modalCanvas && inlineCanvas) {
      const dataUrl = modalCanvas.toDataURL();
      
      // Draw modal content back to inline canvas
      const inlineCtx = inlineCanvas.getContext('2d');
      if (inlineCtx) {
        inlineCtx.clearRect(0, 0, inlineCanvas.width, inlineCanvas.height);
        const img = new Image();
        img.onload = () => {
          inlineCtx.drawImage(img, 0, 0, inlineCanvas.width, inlineCanvas.height);
        };
        img.src = dataUrl;
      }
      
      onSave(dataUrl);
      setHasSignature(true);
    }
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex justify-between items-center">
        <label className="text-[11px] font-bold text-slate-500 uppercase">{label}</label>
        
        {/* Fullscreen signature helper button */}
        <button
          type="button"
          onClick={handleOpenModal}
          className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
        >
          <Maximize2 className="w-3 h-3" />
          Assinar em Tela Cheia / Rotacionar
        </button>
      </div>

      <div className="border-2 border-dashed border-slate-300 bg-slate-50/50 rounded-xl relative overflow-hidden h-[154px] group">
        <canvas
          ref={canvasRef}
          onMouseDown={(e) => startDrawing(canvasRef.current!, e)}
          onMouseMove={(e) => draw(canvasRef.current!, e)}
          onMouseUp={() => stopDrawing(canvasRef.current!, false)}
          onMouseLeave={() => stopDrawing(canvasRef.current!, false)}
          onTouchStart={(e) => startDrawing(canvasRef.current!, e)}
          onTouchMove={(e) => draw(canvasRef.current!, e)}
          onTouchEnd={() => stopDrawing(canvasRef.current!, false)}
          className="w-full h-[150px] cursor-crosshair touch-none block bg-transparent"
        />
        
        <div className="absolute bottom-2 right-2 flex gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => handleClear(canvasRef.current, false)}
            className="bg-slate-600 hover:bg-slate-700 text-white text-[10px] font-bold uppercase py-1 px-2.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
          >
            <Trash2 className="w-2.5 h-2.5" />
            Limpar
          </button>
        </div>
      </div>

      {/* FULL SCREEN / ROTATION SIGNATURE MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-950/95 p-4 md:p-6 justify-between select-none">
            {/* Modal Header */}
            <div className="flex items-center justify-between text-white pb-2 border-b border-slate-800">
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-indigo-400">
                  Assinatura Digital - {label}
                </h3>
                <p className="text-xs text-slate-400">
                  Desenhe sua assinatura no espaço em branco abaixo.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Auto-Rotation Instruction Helper */}
            {isPortrait && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-indigo-950/80 border border-indigo-800 text-indigo-200 text-xs p-3 rounded-xl flex items-center gap-3 my-2"
              >
                <div className="p-2 bg-indigo-900/60 rounded-lg animate-bounce">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <span className="font-black block uppercase text-[10px] text-indigo-400 tracking-wider">Passo Recomendado</span>
                  Vire o seu celular de lado (na horizontal/deitado) para ter muito mais espaço e facilidade ao assinar!
                </div>
                <RotateCw className="w-4 h-4 text-indigo-400 animate-spin-slow hidden sm:block" />
              </motion.div>
            )}

            {/* Huge Canvas Area */}
            <div className="flex-1 bg-white rounded-2xl border-2 border-indigo-500 shadow-2xl relative my-3 overflow-hidden flex flex-col justify-end">
              <canvas
                ref={modalCanvasRef}
                onMouseDown={(e) => startDrawing(modalCanvasRef.current!, e)}
                onMouseMove={(e) => draw(modalCanvasRef.current!, e)}
                onMouseUp={() => stopDrawing(modalCanvasRef.current!, true)}
                onMouseLeave={() => stopDrawing(modalCanvasRef.current!, true)}
                onTouchStart={(e) => startDrawing(modalCanvasRef.current!, e)}
                onTouchMove={(e) => draw(modalCanvasRef.current!, e)}
                onTouchEnd={() => stopDrawing(modalCanvasRef.current!, true)}
                className="absolute inset-0 w-full h-full cursor-crosshair touch-none bg-transparent"
              />
              
              {/* Overlay watermarks */}
              {!hasSignature && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-slate-300">
                  <span className="font-serif italic text-2xl tracking-widest font-black opacity-30 select-none">
                    Assine Aqui
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-30 select-none">
                    Área Digital de Homologação
                  </span>
                </div>
              )}

              {/* Clear button inside the signature area */}
              <div className="absolute top-3 right-3">
                <button
                  type="button"
                  onClick={() => handleClear(modalCanvasRef.current, true)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase py-2 px-3.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm border border-slate-200"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-600" />
                  Limpar Campo
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmModalSignature}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <Check className="w-4 h-4" />
                Confirmar Assinatura
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
