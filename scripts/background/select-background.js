import { initCropBackground } from "./crop-background.js";
import { initCustomBackground } from "./custom-background.js";
import { initMapBackground } from "./map-background.js";
import { initScaleBackground } from "./scale-background.js";

// Sets up the background selection modal
export function initSelectBackground(fabricCanvas) {
  const elements = {
    googleMapsBtn: document.getElementById("google-maps-btn"),
    customStyleBtn: document.getElementById("custom-style-btn"),
    uploadFileBtn: document.getElementById("upload-file-btn"),
    uploadPdfBtn: document.getElementById("upload-pdf-btn"),
    subSidebar: document.getElementById("sub-sidebar"),
    customModal: document.getElementById("customModal"),
  };

  let isFileUpload = false,
    selectedBackground = null;
  let modalImageInput, modalPdfInput;

  // Creates file input elements
  const createInput = (accept, handler) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", handler);
    document.body.appendChild(input);
    return input;
  };

  modalImageInput = createInput("image/*", handleImageFile);
  modalPdfInput = createInput(".pdf", handlePdfFile);

  const resetInputs = () => {
    modalImageInput.value = "";
    modalPdfInput.value = "";
  };

  // Handles image file selection
  function handleImageFile() {
    const file = modalImageInput.files[0];
    if (!file || !file.type.startsWith("image/")) {
      if (file) alert("Please select a valid image file (JPG, PNG, etc.)");
      return;
    }
    processFile("file", URL.createObjectURL(file));
  }

  // Handles PDF file selection
  async function handlePdfFile() {
    const file = modalPdfInput.files[0];
    if (!file || file.type !== "application/pdf") {
      if (file) alert("Please select a valid PDF file");
      return;
    }
    bootstrap.Modal.getInstance(elements.customModal)?.hide();
    await convertPdf(file);
  }

  // Converts PDF to image using PDF.js
  async function convertPdf(file) {
    try {
      if (!window.pdfjsLib) throw new Error("PDF.js library not loaded");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport }).promise;
      processFile("pdf", canvas.toDataURL("image/png"));
      pdf.destroy();
    } catch {
      alert("Error converting PDF to image. Please try again or use an image file instead.");
    }
  }

  // Processes the selected file and starts the crop flow
  function processFile(source, url) {
    isFileUpload = true;
    selectedBackground = source;
    bootstrap.Modal.getInstance(elements.customModal)?.hide();
    cropHandler.handleCrop(url);
    updateStepIndicators(2);
    resetInputs();
  }

  // Gets the currently visible modal
  function getVisibleModal() {
    const modals = ["customModal", "mapModal", "cropModal", "customBackgroundModal", "scaleModal"];
    return modals.find((id) => document.getElementById(id)?.classList.contains("show"));
  }

  // Updates the step indicators in the modal header
  function updateStepIndicators(activeStep) {
    const visibleModalId = getVisibleModal();
    if (!visibleModalId) return;
    const steps = document.getElementById(visibleModalId)?.querySelectorAll(".modal-header-center .step");
    steps?.forEach((step, index) => {
      step.classList.remove("active", "finish");
      if (index + 1 === activeStep) step.classList.add("active");
      else if (index + 1 < activeStep) step.classList.add("finish");
    });
  }

  // Closes all modals and resets the UI state
  function closeAllPopups() {
    const modals = ["customModal", "mapModal", "cropModal", "customBackgroundModal", "scaleModal"];
    modals.forEach((id) => {
      const modal = document.getElementById(id);
      if (modal?.classList.contains("show")) bootstrap.Modal.getInstance(modal)?.hide();
    });
    elements.subSidebar?.classList.add("hidden");
    document.querySelectorAll(".submenu").forEach((submenu) => {
      submenu.classList.add("hidden");
      submenu.classList.remove("show");
    });
    resetInputs();
    isFileUpload = false;
    selectedBackground = null;
    updateStepIndicators(1);
  }

  // Initializes all the background handlers
  const scaleHandler = initScaleBackground(fabricCanvas, null, updateStepIndicators, closeAllPopups);
  const cropHandler = initCropBackground(
    fabricCanvas,
    elements.customModal,
    updateStepIndicators,
    () => isFileUpload,
    (value) => (isFileUpload = value),
    () => selectedBackground,
    (source) => (selectedBackground = source),
    closeAllPopups
  );

  cropHandler.setScaleHandler(scaleHandler);
  window.cropHandlerInstance = cropHandler;

  initCustomBackground(fabricCanvas, elements.customModal, updateStepIndicators, cropHandler.handleCrop, (source) => (selectedBackground = source));
  initMapBackground(fabricCanvas, elements.customModal, updateStepIndicators, cropHandler.handleCrop, (source) => (selectedBackground = source));

  elements.customModal?.addEventListener("show.bs.modal", () => elements.subSidebar?.classList.add("hidden"));

  // Prevents escape key from closing modals
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return false;
      }
    },
    true
  );

  const showModal = (modalId) => {
    const modal = document.getElementById(modalId);
    (bootstrap.Modal.getInstance(modal) || new bootstrap.Modal(modal)).show();
  };

  // Sets up button event listeners
  elements.uploadFileBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetInputs();
    modalImageInput.click();
  });
  elements.uploadPdfBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetInputs();
    modalPdfInput.click();
  });
  elements.googleMapsBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectedBackground = "maps";
    bootstrap.Modal.getInstance(elements.customModal)?.hide();
    showModal("mapModal");
  });
  elements.customStyleBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectedBackground = "custom";
    bootstrap.Modal.getInstance(elements.customModal)?.hide();
    showModal("customBackgroundModal");
  });

  return { closeAllPopups, updateStepIndicators, setIsFileUpload: (value) => (isFileUpload = value), getIsFileUpload: () => isFileUpload, setBackgroundSource: (source) => (selectedBackground = source), getBackgroundSource: () => selectedBackground };
}

// Handle replace background button
export function setupReplaceBackgroundHandler() {
  const replaceBackgroundBtn = document.getElementById("replace-background-btn");
  if (replaceBackgroundBtn) {
    replaceBackgroundBtn.addEventListener("click", function () {
      const fabricCanvas = window.fabricCanvas;
      if (!fabricCanvas) return;

      const existingBg = fabricCanvas.getObjects().find((o) => o.type === "image" && (o.isBackground || (!o.selectable && !o.evented)));
      if (!existingBg) {
        alert("No background found. Please add a background first.");
        return;
      }

      window.__replaceBackgroundMode = true;
      const customModal = document.getElementById("customModal");
      (bootstrap.Modal.getInstance(customModal) || new bootstrap.Modal(customModal)).show();
    });
  }
}
