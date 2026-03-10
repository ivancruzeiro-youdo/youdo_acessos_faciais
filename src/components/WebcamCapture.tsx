import { useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { Button } from "@/components/ui/button";
import { Camera, RotateCcw, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface WebcamCaptureProps {
  onCapture: (imageData: string) => void;
  currentImage?: string;
}

export function WebcamCapture({ onCapture, currentImage }: WebcamCaptureProps) {
  const webcamRef = useRef<Webcam>(null);
  const [open, setOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setCapturedImage(imageSrc);
    }
  }, [webcamRef]);

  const retake = () => {
    setCapturedImage(null);
  };

  const confirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      setOpen(false);
      setCapturedImage(null);
    }
  };

  const cancel = () => {
    setOpen(false);
    setCapturedImage(null);
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {currentImage && (
            <img src={currentImage} alt="Foto atual" className="w-20 h-20 rounded object-cover border" />
          )}
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            <Camera className="h-4 w-4 mr-2" />
            {currentImage ? "Alterar Foto" : "Capturar Foto"}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Capturar Foto</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              {capturedImage ? (
                <img src={capturedImage} alt="Captura" className="w-full h-full object-contain" />
              ) : (
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{
                    width: 1280,
                    height: 720,
                    facingMode: "user"
                  }}
                  className="w-full h-full object-contain"
                />
              )}
            </div>

            <div className="flex justify-center gap-2">
              {capturedImage ? (
                <>
                  <Button variant="outline" onClick={retake}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Tirar Novamente
                  </Button>
                  <Button onClick={confirm}>
                    <Check className="h-4 w-4 mr-2" />
                    Confirmar
                  </Button>
                  <Button variant="ghost" onClick={cancel}>
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={capture}>
                    <Camera className="h-4 w-4 mr-2" />
                    Capturar
                  </Button>
                  <Button variant="ghost" onClick={cancel}>
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
