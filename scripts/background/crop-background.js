import { layers } from "../canvas/canvas-layers.js";

// Sets up the crop modal for editing background images
export function initCropBackground(fabricCanvas, mainModal, updateStepIndicators, getIsFileUpload, setIsFileUpload, getBackgroundSource, closeAllPopups) {
  const elements = {
    cropModal: document.getElementById("cropModal"),
    cropBackBtn: document.getElementById("crop-back-btn"),
    cropNextBtn: document.getElementById("crop-next-btn"),
    croppableImage: document.getElementById("croppable-image"),
  };

  let cropper, scaleHandler, cropperTimeout, modalShownTimeout, refreshRetryTimeout;
  let savedState = { imageUrl: null, cropperData: null, isInitialized: false };

  // Connects the scale handler for processing cropped images
  const setScaleHandler = (handler) => {
    scaleHandler = handler;
  };
  const getScaleHandler = () => scaleHandler;

  // Fixes the cropper layout when the image is ready
  function refreshCropperLayout(maxRetries = 10, delay = 100) {
    if (refreshRetryTimeout) clearTimeout(refreshRetryTimeout);
    if (!cropper || !elements.croppableImage) return;

    const visible = elements.croppableImage.isConnected && elements.croppableImage.offsetParent !== null;
    const hasSize = elements.croppableImage.clientWidth > 0 && elements.croppableImage.clientHeight > 0;

    if (!visible || !hasSize) {
      if (maxRetries > 0) refreshRetryTimeout = setTimeout(() => refreshCropperLayout(maxRetries - 1, delay), delay);
      return;
    }

    try {
      const data = savedState.cropperData || cropper.getData();
      cropper.reset();
      if (data) cropper.setData(data);
    } catch {
      try {
        cropper.render?.();
      } catch {}
    }
  }

  // Creates a new cropper instance for the image
  function initCropper(image) {
    if (cropperTimeout) clearTimeout(cropperTimeout);
    if (cropper) cropper.destroy();
    cropper = null;

    const needsDelay = image.src.startsWith("data:");
    const init = () => {
      const isMapSource = getBackgroundSource?.() === "map" || getBackgroundSource?.() === "maps";
      cropper = new Cropper(image, {
        aspectRatio: NaN,
        viewMode: 1,
        autoCropArea: isMapSource ? 1 : 0.8,
        responsive: true,
        background: true,
        movable: true,
        zoomable: true,
        scalable: true,
        cropBoxMovable: true,
        cropBoxResizable: true,
        ready() {
          if (cropper) {
            refreshCropperLayout();
            if (savedState.cropperData && savedState.isInitialized) cropper.setData(savedState.cropperData);
            savedState.isInitialized = true;
          }
        },
      });
    };

    if (needsDelay) cropperTimeout = setTimeout(init, 300);
    else init();
  }

  // Cleans up the cropper and clears timers
  function resetCropper(preserveSavedState = false) {
    [cropperTimeout, modalShownTimeout, refreshRetryTimeout].forEach((t) => t && clearTimeout(t));

    if (cropper) {
      try {
        cropper.destroy();
      } catch {}
      cropper = null;
    }

    if (elements.croppableImage) {
      elements.croppableImage.src = "";
      elements.croppableImage.removeAttribute("src");
      elements.croppableImage.onload = null;
    }

    if (!preserveSavedState) {
      savedState = { imageUrl: null, cropperData: null, isInitialized: false };
    } else {
      savedState.isInitialized = false;
    }
  }

  // Opens the crop modal with an image
  function handleCrop(imageUrl) {
    savedState.imageUrl = imageUrl;
    savedState.isInitialized = false;
    (bootstrap.Modal.getInstance(elements.cropModal) || new bootstrap.Modal(elements.cropModal)).show();

    if (elements.croppableImage) {
      elements.croppableImage.onload = () => {
        initCropper(elements.croppableImage);
        elements.croppableImage.onload = null;
      };
      elements.croppableImage.src = imageUrl;
    }
    updateStepIndicators(2);
  }

  // Restores the crop modal with saved data
  function restoreCropModal() {
    if (!savedState.imageUrl) return false;
    (bootstrap.Modal.getInstance(elements.cropModal) || new bootstrap.Modal(elements.cropModal)).show();

    if (elements.croppableImage) {
      if (elements.croppableImage.src !== savedState.imageUrl) {
        elements.croppableImage.onload = () => {
          initCropper(elements.croppableImage);
          elements.croppableImage.onload = null;
        };
        elements.croppableImage.src = savedState.imageUrl;
      } else initCropper(elements.croppableImage);
    }
    updateStepIndicators(2);
    return true;
  }

  // Handles the back button to return to source modal
  function handleCropBack() {
    bootstrap.Modal.getInstance(elements.cropModal)?.hide();
    resetCropper(true);

    const source = getBackgroundSource();
    const modalMap = {
      file: mainModal,
      pdf: mainModal,
      custom: "customBackgroundModal",
      map: "mapModal",
      maps: "mapModal",
    };
    const targetModal = modalMap[source];

    let modalElement = typeof targetModal === "string" ? document.getElementById(targetModal) : targetModal;
    if (modalElement) {
      (bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement)).show();
    }
    updateStepIndicators(1);
  }

  // Handles the next button to process the cropped image
  function handleCropNext() {
    if (!cropper) return;

    savedState.cropperData = cropper.getData();
    const croppedCanvas = cropper.getCroppedCanvas({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });
    if (!croppedCanvas) {
      alert("Error processing crop. Please try again.");
      return;
    }

    bootstrap.Modal.getInstance(elements.cropModal)?.hide();
    resetCropper(true);

    if (window.__replaceBackgroundMode) {
      const objectsNow = fabricCanvas.getObjects();
      let existingBg = null;

      try {
        const layerBgs = layers?.background?.objects || [];
        for (let i = layerBgs.length - 1; i >= 0; i--) {
          const obj = layerBgs[i];
          if (obj?.type === "image" && objectsNow.includes(obj)) {
            existingBg = obj;
            break;
          }
        }
      } catch {}

      if (!existingBg) existingBg = objectsNow.find((o) => o.type === "image" && (o.isBackground || (!o.selectable && !o.evented)));

      if (existingBg) {
        const existingDisplayedWidth = existingBg.width * existingBg.scaleX;
        const existingDisplayedHeight = existingBg.height * existingBg.scaleY;
        const targetScaleX = existingDisplayedWidth / croppedCanvas.width;
        const targetScaleY = existingDisplayedHeight / croppedCanvas.height;
        const targetLeft = existingBg.left;
        const targetTop = existingBg.top;

        fabricCanvas.remove(existingBg);
        layers.background.objects = layers.background.objects.filter((obj) => obj !== existingBg);

        fabric.Image.fromURL(
          croppedCanvas.toDataURL("image/png"),
          (img) => {
            img.set({
              scaleX: targetScaleX,
              scaleY: targetScaleY,
              left: targetLeft,
              top: targetTop,
              selectable: false,
              evented: false,
              hoverCursor: "default",
              isBackground: true,
            });
            fabricCanvas.add(img);
            fabricCanvas.sendToBack(img);
            layers.background.objects.push(img);
            fabricCanvas.requestRenderAll();
            window.__replaceBackgroundMode = false;
            closeAllPopups();
          },
          { crossOrigin: "anonymous" }
        );
      } else {
        window.__replaceBackgroundMode = false;
        closeAllPopups();
      }
    } else {
      if (scaleHandler) scaleHandler.handleCropNext(croppedCanvas);
    }
  }

  // Gets the current cropped canvas
  const getCroppedCanvas = () =>
    cropper?.getCroppedCanvas({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });

  elements.cropBackBtn?.addEventListener("click", handleCropBack);
  elements.cropNextBtn?.addEventListener("click", handleCropNext);

  elements.cropModal?.addEventListener("shown.bs.modal", () => {
    if (modalShownTimeout) clearTimeout(modalShownTimeout);
    modalShownTimeout = setTimeout(() => cropper && refreshCropperLayout(), 100);
  });

  return {
    handleCrop,
    getCroppedCanvas,
    resetCropper,
    setScaleHandler,
    getScaleHandler,
    restoreCropModal,
  };
}
